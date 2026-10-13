// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {console2} from "forge-std/Script.sol";
import {DeploymentFile} from "./DeploymentFile.sol";

/// @notice Hands the whole deployed system to a new owner, for example the
///         chain operator's multisig.
///
///   NEW_OWNER=0x... forge script script/HandOver.s.sol --rpc-url robinhood_testnet --broadcast
///
/// Environment: PRIVATE_KEY (the current owner), NEW_OWNER (a deployed
/// multisig; set ALLOW_EOA=true to permit a plain address on testnet),
/// NEW_GUARDIAN (the pause guardian the new owner wants; required on
/// mainnet, and if left out elsewhere the guardian is removed. Pass the same
/// value on every run).
///
/// Afterwards the new owner calls acceptOwnership() on each contract the
/// script lists. Until then the current owner STILL CONTROLS those contracts,
/// so the handover is not complete: run VerifyHandOver to confirm. Also
/// rotate the discount signer and review which controllers are authorised.
/// The script can be run again if it stops half way.
contract HandOver is DeploymentFile {
    function run() external {
        uint256 key = vm.envUint("PRIVATE_KEY");
        address newOwner = vm.envAddress("NEW_OWNER");
        address newGuardian = vm.envOr("NEW_GUARDIAN", address(0));
        require(
            newGuardian != address(0) || block.chainid != 4663,
            "NEW_GUARDIAN is required on mainnet"
        );
        (Deployment memory d, string memory parentName) = _load();
        _requireComplete(d);

        vm.startBroadcast(key);
        _handOver(
            d,
            parentName,
            vm.addr(key),
            newOwner,
            newGuardian,
            vm.envOr("ALLOW_EOA", false)
        );
        vm.stopBroadcast();

        console2.log("Handed to:", newOwner);
        console2.log("The new owner must now call acceptOwnership() on:");
        console2.log("  HoodRegistrarController", address(d.controller));
        console2.log("  HoodPriceOracle", address(d.oracle));
        console2.log("  HoodResolverPolicy", address(d.policy));
        console2.log("  HoodNameRules", address(d.rules));
        console2.log("  HoodNameGuard", address(d.guard));
        if (address(d.hub) != address(0))
            console2.log("  HoodReferralHub", address(d.hub));
        if (address(d.ledger) != address(0))
            console2.log("  HoodPointsLedger", address(d.ledger));
        if (address(d.giftCard) != address(0))
            console2.log("  HoodGiftCard", address(d.giftCard));
        if (address(d.verifiedValidator) != address(0))
            console2.log("  SignedDiscountValidator", address(d.verifiedValidator));
        console2.log("Then run VerifyHandOver with the same NEW_OWNER.");
    }
}

/// @notice Confirms that NEW_OWNER holds everything. Read-only.
///
///   NEW_OWNER=0x... forge script script/HandOver.s.sol:VerifyHandOver --rpc-url robinhood_testnet
contract VerifyHandOver is DeploymentFile {
    function run() external view {
        address newOwner = vm.envAddress("NEW_OWNER");
        (Deployment memory d, string memory parentName) = _load();
        _requireComplete(d);
        string memory problem = _handOverProblem(d, parentName, newOwner);
        require(
            bytes(problem).length == 0,
            string.concat("handover incomplete: ", problem)
        );
        console2.log("Handover complete. Everything is held by", newOwner);
        // Chosen by the previous owner unless changed; confirm both.
        console2.log("Pause guardian:", d.controller.guardian());
        if (address(d.verifiedValidator) != address(0))
            console2.log("Discount signer (rotate it):", d.verifiedValidator.signer());
        console2.log(
            "Not visible here: check the ControllerChanged, ControllerAdded and"
        );
        console2.log(
            "TrustedResolverChanged logs for anything the previous owner added."
        );
    }
}
