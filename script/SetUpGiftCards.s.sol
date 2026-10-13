// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {Script, console2} from "forge-std/Script.sol";
import {HoodGiftCard} from "../contracts/hood/HoodGiftCard.sol";

/// @notice Defines the gift-card denominations on a deployment that has gift
///         cards enabled: $5, $25 and $100. Safe to run again: denominations
///         already defined are skipped.
///
///   forge script script/SetUpGiftCards.s.sol --rpc-url robinhood_testnet --broadcast
contract SetUpGiftCards is Script {
    function run() external {
        uint256 key = vm.envUint("PRIVATE_KEY");
        string memory json = vm.readFile(
            string.concat("deployments/", vm.toString(block.chainid), ".json")
        );
        HoodGiftCard card = HoodGiftCard(
            payable(vm.parseJsonAddress(json, ".HoodGiftCard"))
        );
        if (address(card) == address(0)) {
            console2.log("Gift cards are not deployed; nothing to do.");
            return;
        }
        uint256[3] memory values = [uint256(5e18), 25e18, 100e18];
        vm.startBroadcast(key);
        for (uint256 i = 0; i < values.length; i++)
            if (card.faceValue(i + 1) == 0) card.defineCard(i + 1, values[i]);
        vm.stopBroadcast();
        console2.log("Gift cards 1, 2 and 3 are $5, $25 and $100.");
    }
}
