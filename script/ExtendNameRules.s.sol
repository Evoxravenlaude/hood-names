// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {Script, console2} from "forge-std/Script.sol";
import {HoodNameRules} from "../contracts/hood/HoodNameRules.sol";
import {NameRulesExtensions} from "./NameRulesExtensions.sol";

/// @notice Adds the alphabets in nametables/ext-N to a live deployment's
///         name rules. Every name that was allowed stays as it was; names in
///         the added alphabets become possible. Does nothing if already done.
///         Extensions that need a newer rules contract (right-to-left
///         alphabets) are skipped on older deployments.
///
///   forge script script/ExtendNameRules.s.sol --rpc-url robinhood_testnet --broadcast
contract ExtendNameRules is Script, NameRulesExtensions {
    function run() external {
        uint256 key = vm.envUint("PRIVATE_KEY");
        string memory path = string.concat("deployments/", vm.toString(block.chainid), ".json");
        HoodNameRules rules = HoodNameRules(vm.parseJsonAddress(vm.readFile(path), ".HoodNameRules"));
        require(address(rules).code.length > 0, "no name rules contract at the recorded address");
        require(rules.isSealed(), "name rules are not sealed");
        require(rules.owner() == vm.addr(key), "this key does not own the name rules");

        vm.startBroadcast(key);
        (uint256 applied, uint256 skipped) = _applyNameExtensions(rules);
        vm.stopBroadcast();
        console2.log("Extensions added:", applied);
        if (skipped != 0) console2.log("Extensions skipped (need a newer name rules contract):", skipped);
    }
}
