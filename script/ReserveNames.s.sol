// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {Script, console2} from "forge-std/Script.sol";
import {HoodNameGuard} from "../contracts/hood/HoodNameGuard.sol";

/// @notice Reads the reserved-name lists.
abstract contract ReservedLists is Script {
    /// @dev The lists that are applied. A new list file must be added here,
    ///      or neither ReserveNames nor the check before opening will see it.
    function _files() internal pure returns (string[6] memory) {
        return [
            "reserved/brand.txt",
            "reserved/support.txt",
            "reserved/regulators.txt",
            "reserved/web3.txt",
            "reserved/tickers.txt",
            "reserved/issuers.txt"
        ];
    }

    function _guard() internal view returns (HoodNameGuard) {
        string memory json = vm.readFile(
            string.concat("deployments/", vm.toString(block.chainid), ".json")
        );
        require(
            vm.parseJsonUint(json, ".chainId") == block.chainid,
            "deployments file is for another chain"
        );
        HoodNameGuard guard = HoodNameGuard(vm.parseJsonAddress(json, ".HoodNameGuard"));
        require(address(guard).code.length > 0, "name guard is not deployed");
        require(guard.rules().isSealed(), "name rules are not sealed");
        return guard;
    }

    /// @dev One label per line; blank lines and lines starting with # are skipped.
    function _readLabels(string memory path) internal view returns (string[] memory out) {
        string[] memory lines = vm.split(vm.readFile(path), "\n");
        string[] memory kept = new string[](lines.length);
        uint256 n;
        for (uint256 i = 0; i < lines.length; i++) {
            string memory line = vm.trim(lines[i]);
            bytes memory b = bytes(line);
            if (b.length == 0 || b[0] == "#") continue;
            kept[n++] = line;
        }
        out = new string[](n);
        for (uint256 i = 0; i < n; i++) out[i] = kept[i];
    }

    /// @dev Labels that need a reservation. One- and two-character entries
    ///      (short tickers) are dropped: nobody can register them. Anything
    ///      longer that the name rules refuse is a mistake in the list, and
    ///      stops the run instead of being skipped quietly.
    function _registrable(
        HoodNameGuard guard,
        string[] memory labels
    ) internal view returns (string[] memory out) {
        string[] memory kept = new string[](labels.length);
        uint256 n;
        for (uint256 i = 0; i < labels.length; i++) {
            if (bytes(labels[i]).length < 3) continue;
            require(
                guard.valid(labels[i]),
                string.concat("reserved list entry is not a valid label: ", labels[i])
            );
            kept[n++] = labels[i];
        }
        out = new string[](n);
        for (uint256 i = 0; i < n; i++) out[i] = kept[i];
    }

    function _slice(
        string[] memory all,
        uint256 from,
        uint256 size
    ) internal pure returns (string[] memory out) {
        uint256 end = from + size > all.length ? all.length : from + size;
        out = new string[](end - from);
        for (uint256 i = from; i < end; i++) out[i - from] = all[i];
    }

    /// @dev Number of list entries that are not reserved on-chain.
    function _missing(HoodNameGuard guard) internal view returns (uint256 missing) {
        string[6] memory files = _files();
        for (uint256 i = 0; i < files.length; i++) {
            string[] memory labels = _registrable(guard, _readLabels(files[i]));
            for (uint256 j = 0; j < labels.length; j++) {
                if (!guard.isReserved(labels[j])) {
                    if (missing < 10) console2.log("Not reserved:", labels[j]);
                    missing++;
                }
            }
        }
    }
}

/// @notice Reserves every label in the reserved lists. Reserving a label
///         also reserves everything that looks like it. Safe to run again:
///         labels already reserved are left as they are.
///
///   forge script script/ReserveNames.s.sol --rpc-url robinhood_testnet --broadcast
///
/// Environment: PRIVATE_KEY (the name guard's owner). Reads the guard
/// address from deployments/<chainId>.json.
contract ReserveNames is ReservedLists {
    uint256 internal constant BATCH = 40;

    function run() external {
        uint256 key = vm.envUint("PRIVATE_KEY");
        HoodNameGuard guard = _guard();

        string[6] memory files = _files();
        uint256 total;
        uint256 skipped;
        vm.startBroadcast(key);
        for (uint256 i = 0; i < files.length; i++) {
            string[] memory all = _readLabels(files[i]);
            string[] memory labels = _registrable(guard, all);
            skipped += all.length - labels.length;
            for (uint256 j = 0; j < labels.length; j += BATCH)
                guard.setReservedLabels(_slice(labels, j, BATCH), true);
            total += labels.length;
        }
        vm.stopBroadcast();
        console2.log("Reserved labels:", total);
        console2.log("Skipped (under 3 characters, cannot be registered):", skipped);
    }
}
