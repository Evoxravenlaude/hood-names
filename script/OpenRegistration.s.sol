// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {console2} from "forge-std/Script.sol";
import {HoodRegistrarController} from "../contracts/hood/HoodRegistrarController.sol";
import {ReservedLists} from "./ReserveNames.s.sol";
import {DeploymentFile} from "./DeploymentFile.sol";

/// @notice Opens public registration. Refuses unless the deployment is whole
///         and every entry of every reserved list is reserved on-chain, so
///         a partial deployment or a partial ReserveNames run cannot be
///         followed by an open sale.
///
///   forge script script/OpenRegistration.s.sol --rpc-url robinhood_testnet --broadcast
contract OpenRegistration is ReservedLists, DeploymentFile {
    function run() external {
        uint256 key = vm.envUint("PRIVATE_KEY");
        (Deployment memory d, ) = _load();
        _requireComplete(d);
        require(address(_guard()) == address(d.guard), "guard mismatch");
        HoodRegistrarController controller = d.controller;

        uint256 missing = _missing(d.guard);
        require(missing == 0, "reserved lists are not fully applied; run ReserveNames");

        vm.broadcast(key);
        controller.unpause();
        console2.log("Registration is open.");
    }
}
