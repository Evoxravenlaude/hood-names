// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {Script, console2} from "forge-std/Script.sol";
import {VmSafe} from "forge-std/Vm.sol";
import {TestUSD} from "../contracts/testnet/TestUSD.sol";
import {PaymentAcceptor} from "../contracts/hood/PaymentAcceptor.sol";

/// @notice Testnets only. Replaces the test dollar with the current TestUSD
///         (1,000 per claim, once every six hours) if the deployment still
///         uses an older one: deploys it, accepts it for registrations and
///         gift cards, stops accepting the old one, and updates
///         deployments/<chainId>.json. Does nothing if already current.
///
///   forge script script/UpgradeTestStablecoin.s.sol --rpc-url robinhood_testnet --broadcast
contract UpgradeTestStablecoin is Script {
    function run() external {
        require(block.chainid != 4663, "testnets only");
        uint256 key = vm.envUint("PRIVATE_KEY");
        string memory path = string.concat("deployments/", vm.toString(block.chainid), ".json");
        string memory json = vm.readFile(path);

        address old = vm.parseJsonAddress(json, ".Stablecoin");
        if (old != address(0) && _isCurrent(old)) {
            console2.log("The test dollar is already current:", old);
            return;
        }
        if (old != address(0)) {
            require(old.code.length > 0, "the address file names a stablecoin with no code; fix deployments file first");
            // A real stablecoin must never be swapped out by this script.
            (bool ok, bytes memory ret) = old.staticcall(abi.encodeWithSignature("symbol()"));
            require(ok && keccak256(bytes(abi.decode(ret, (string)))) == keccak256(bytes("tUSD")), "not a test dollar");
        }

        PaymentAcceptor controller = PaymentAcceptor(vm.parseJsonAddress(json, ".HoodRegistrarController"));
        address giftCardAddress = vm.parseJsonAddress(json, ".HoodGiftCard");

        vm.startBroadcast(key);
        TestUSD fresh = new TestUSD();
        controller.setPaymentToken(address(fresh), true);
        if (old != address(0)) controller.setPaymentToken(old, false);
        if (giftCardAddress != address(0)) {
            PaymentAcceptor(giftCardAddress).setPaymentToken(address(fresh), true);
            if (old != address(0)) PaymentAcceptor(giftCardAddress).setPaymentToken(old, false);
        }
        vm.stopBroadcast();

        if (vm.isContext(VmSafe.ForgeContext.ScriptBroadcast)) {
            vm.writeJson(vm.toString(address(fresh)), path, ".Stablecoin");
            console2.log("Test dollar replaced:", address(fresh));
        } else {
            console2.log("Simulation only: the address file was not changed.");
        }
    }

    function _isCurrent(address token) private view returns (bool) {
        (bool ok, bytes memory ret) = token.staticcall(abi.encodeWithSignature("COOLDOWN()"));
        return ok && ret.length == 32;
    }
}
