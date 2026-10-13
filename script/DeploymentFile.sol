// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {Script} from "forge-std/Script.sol";
import {HoodDeployer} from "./HoodDeployer.sol";
import {ENSRegistry} from "../contracts/registry/ENSRegistry.sol";
import {ReverseRegistrar} from "../contracts/reverseRegistrar/ReverseRegistrar.sol";
import {NameWrapper} from "../contracts/wrapper/NameWrapper.sol";
import {HoodBaseRegistrar} from "../contracts/hood/HoodBaseRegistrar.sol";
import {HoodRegistrarController} from "../contracts/hood/HoodRegistrarController.sol";
import {HoodPriceOracle} from "../contracts/hood/HoodPriceOracle.sol";
import {HoodResolverPolicy} from "../contracts/hood/HoodResolverPolicy.sol";
import {HoodReferralHub} from "../contracts/hood/HoodReferralHub.sol";
import {HoodPointsLedger} from "../contracts/hood/HoodPointsLedger.sol";
import {HoodGiftCard} from "../contracts/hood/HoodGiftCard.sol";
import {SignedDiscountValidator} from "../contracts/hood/DiscountValidators.sol";
import {HoodPublicResolver} from "../contracts/hood/HoodPublicResolver.sol";
import {HoodUniversalResolver} from "../contracts/hood/HoodUniversalResolver.sol";
import {HoodNameRules} from "../contracts/hood/HoodNameRules.sol";
import {HoodNameLens} from "../contracts/hood/HoodNameLens.sol";
import {HoodNameGuard} from "../contracts/hood/HoodNameGuard.sol";
import {GatewayProvider} from "../contracts/ccipRead/GatewayProvider.sol";

/// @notice Loads a deployment from deployments/<chainId>.json.
abstract contract DeploymentFile is Script, HoodDeployer {
    function _load()
        internal
        view
        returns (Deployment memory d, string memory parentName)
    {
        string memory json = vm.readFile(
            string.concat("deployments/", vm.toString(block.chainid), ".json")
        );
        require(
            vm.parseJsonUint(json, ".chainId") == block.chainid,
            "deployments file is for another chain"
        );
        d.registry = ENSRegistry(vm.parseJsonAddress(json, ".ENSRegistry"));
        d.base = HoodBaseRegistrar(vm.parseJsonAddress(json, ".BaseRegistrar"));
        d.reverseRegistrar = ReverseRegistrar(
            vm.parseJsonAddress(json, ".ReverseRegistrar")
        );
        d.wrapper = NameWrapper(vm.parseJsonAddress(json, ".NameWrapper"));
        d.controller = HoodRegistrarController(
            payable(vm.parseJsonAddress(json, ".HoodRegistrarController"))
        );
        d.oracle = HoodPriceOracle(vm.parseJsonAddress(json, ".HoodPriceOracle"));
        d.policy = HoodResolverPolicy(
            vm.parseJsonAddress(json, ".HoodResolverPolicy")
        );
        d.hub = HoodReferralHub(vm.parseJsonAddress(json, ".HoodReferralHub"));
        d.ledger = HoodPointsLedger(vm.parseJsonAddress(json, ".HoodPointsLedger"));
        d.giftCard = HoodGiftCard(
            payable(vm.parseJsonAddress(json, ".HoodGiftCard"))
        );
        d.verifiedValidator = SignedDiscountValidator(
            vm.parseJsonAddress(json, ".SignedDiscountValidator")
        );
        d.resolver = HoodPublicResolver(vm.parseJsonAddress(json, ".PublicResolver"));
        d.universalResolver = HoodUniversalResolver(
            vm.parseJsonAddress(json, ".UniversalResolver")
        );
        d.rules = HoodNameRules(vm.parseJsonAddress(json, ".HoodNameRules"));
        d.guard = HoodNameGuard(vm.parseJsonAddress(json, ".HoodNameGuard"));
        d.gateways = GatewayProvider(vm.parseJsonAddress(json, ".GatewayProvider"));
        d.lens = HoodNameLens(vm.parseJsonAddress(json, ".HoodNameLens"));
        parentName = vm.parseJsonString(json, ".parentName");
    }

    /// @notice Stops unless the deployment is whole and wired. The address
    ///         file is written when a deployment is sent, so if sending
    ///         stopped part way the file can name contracts that were never
    ///         created. Every script that acts on the file checks first.
    function _requireComplete(Deployment memory d) internal view {
        address[13] memory required = [
            address(d.registry),
            address(d.base),
            address(d.reverseRegistrar),
            address(d.wrapper),
            address(d.controller),
            address(d.oracle),
            address(d.policy),
            address(d.resolver),
            address(d.universalResolver),
            address(d.rules),
            address(d.guard),
            address(d.gateways),
            address(d.lens)
        ];
        for (uint256 i = 0; i < required.length; i++)
            require(required[i].code.length > 0, "deployment incomplete: a contract is missing");
        address[4] memory optional = [
            address(d.hub),
            address(d.ledger),
            address(d.giftCard),
            address(d.verifiedValidator)
        ];
        for (uint256 i = 0; i < optional.length; i++)
            require(
                optional[i] == address(0) || optional[i].code.length > 0,
                "deployment incomplete: an optional contract is missing"
            );

        require(d.registry.owner(d.base.baseNode()) == address(d.base), "registrar does not own the parent name");
        require(address(d.base.policy()) == address(d.policy), "registrar has no resolver policy");
        require(d.base.controllers(address(d.controller)), "controller not authorised on the registrar");
        require(d.base.controllers(address(d.wrapper)), "wrapper not authorised on the registrar");
        require(d.wrapper.controllers(address(d.controller)), "controller not authorised on the wrapper");
        require(address(d.controller.nameWrapper()) == address(d.wrapper), "controller has no wrapper");
        require(address(d.controller.guard()) == address(d.guard), "controller uses another name guard");
        require(d.guard.controllers(address(d.controller)), "controller not authorised on the name guard");
        require(d.rules.isSealed(), "name rules are not sealed");
        require(d.policy.defaultResolver() == address(d.resolver), "default resolver is not set");
        require(d.policy.trustedResolvers(address(d.resolver)), "public resolver is not trusted");
        require(
            d.reverseRegistrar.controllers(address(d.controller)),
            "controller not authorised on the reverse registrar"
        );
    }
}

