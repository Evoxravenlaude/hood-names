// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {CommonBase} from "forge-std/Base.sol";
import {console2} from "forge-std/console2.sol";
import {HoodNameRules} from "../contracts/hood/HoodNameRules.sol";

/// @notice Applies the alphabets added after launch (nametables/ext-N, see
///         tools/gen-name-tables.mjs) to a sealed HoodNameRules. Used by a
///         fresh deployment right after sealing and by ExtendNameRules on a
///         live one, so both end with the same tables.
///
///         Each extension only adds characters that do not resolve yet and
///         groups of scripts no group uses yet, so every name that was
///         allowed stays exactly as it was.
///
///         The three parts go in this order, each checked on-chain first and
///         sent only if missing, so a run that stopped part-way can simply be
///         run again:
///          1. pricing patterns (version 2), before any name can use them;
///          2. the character pages, which do nothing until their scripts
///             have a group;
///          3. the groups, which switch the alphabets on.
abstract contract NameRulesExtensions is CommonBase {
    /// @return applied Extensions this call changed anything for.
    /// @return skipped Extensions the contract is too old for.
    function _applyNameExtensions(HoodNameRules rules) internal returns (uint256 applied, uint256 skipped) {
        uint256 version = _rulesVersion(rules);
        string[] memory files = vm.parseJsonStringArray(vm.readFile("nametables/extensions.json"), ".files");
        for (uint256 i = 0; i < files.length; i++) {
            string memory meta = vm.readFile(files[i]);
            string memory title = vm.parseJsonString(meta, ".title");
            if (vm.parseJsonUint(meta, ".requiresVersion") > version) {
                console2.log("Skipped (needs name rules version 2):", title);
                skipped++;
                continue;
            }
            bool changed;

            if (version >= 2) {
                bytes[] memory patterns = vm.parseJsonBytesArray(meta, ".patterns");
                if (patterns.length != 0 && !_hasPatternPage(rules, _patternPage(patterns))) {
                    rules.addExtensionPatterns(patterns);
                    changed = true;
                }
            }

            string[] memory pages = vm.parseJsonStringArray(meta, ".pageFiles");
            for (uint256 k = 0; k < pages.length; k++) {
                bytes memory page = vm.parseBytes(vm.readFile(pages[k]));
                if (!_hasPage(rules, page)) {
                    rules.addPage(page);
                    changed = true;
                }
            }

            uint256[] memory wanted = vm.parseJsonUintArray(meta, ".groups");
            uint256[] memory missing = new uint256[](wanted.length);
            uint256 n;
            for (uint256 k = 0; k < wanted.length; k++) if (!_hasGroup(rules, wanted[k])) missing[n++] = wanted[k];
            if (n != 0) {
                assembly {
                    mstore(missing, n)
                }
                rules.addGroups(missing);
                changed = true;
            }

            (bool live, , , ) = rules.check(vm.parseJsonString(meta, ".probe"));
            require(live, string.concat("extension applied but its probe name is still refused: ", title));
            console2.log(changed ? "Added:" : "Already applied:", title);
            if (changed) applied++;
        }
    }

    /// @dev 1 for the launch contract, which has no VERSION constant.
    function _rulesVersion(HoodNameRules rules) internal view returns (uint256) {
        (bool ok, bytes memory ret) = address(rules).staticcall(abi.encodeWithSignature("VERSION()"));
        return ok && ret.length == 32 ? abi.decode(ret, (uint256)) : 1;
    }

    function _hasPage(HoodNameRules rules, bytes memory page) private view returns (bool) {
        (uint256 count, , ) = rules.counts();
        bytes32 want = keccak256(page);
        for (uint256 k = 0; k < count; k++) if (keccak256(rules.pages(k).code) == want) return true;
        return false;
    }

    function _hasGroup(HoodNameRules rules, uint256 mask) private view returns (bool) {
        (, , uint256 count) = rules.counts();
        for (uint256 k = 0; k < count; k++) if (rules.groups(k) == mask) return true;
        return false;
    }

    /// @dev The code addExtensionPatterns deploys for these patterns.
    function _patternPage(bytes[] memory patterns) private pure returns (bytes memory data) {
        data = new bytes(1 + patterns.length * 8);
        for (uint256 i = 0; i < patterns.length; i++) {
            data[1 + i * 8] = bytes1(uint8(patterns[i].length));
            for (uint256 j = 0; j < patterns[i].length; j++) data[2 + i * 8 + j] = patterns[i][j];
        }
    }

    function _hasPatternPage(HoodNameRules rules, bytes memory page) private view returns (bool) {
        bytes32 want = keccak256(page);
        for (uint256 k = 0; ; k++) {
            (bool ok, bytes memory ret) = address(rules).staticcall(abi.encodeWithSignature("extensionPatternPages(uint256)", k));
            if (!ok || ret.length != 32) return false;
            if (keccak256(abi.decode(ret, (address)).code) == want) return true;
        }
    }
}
