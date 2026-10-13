// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {Script, console2} from "forge-std/Script.sol";
import {VmSafe} from "forge-std/Vm.sol";
import {IAggregatorV3} from "../contracts/hood/HoodPriceOracle.sol";
import {TestUSD} from "../contracts/testnet/TestUSD.sol";
import {HoodDeployer} from "./HoodDeployer.sol";

/// @notice Deploys the full system.
///
///   forge script script/Deploy.s.sol --rpc-url robinhood_testnet --broadcast
///
/// Environment:
///   PRIVATE_KEY        deployer key (required)
///   PARENT_NAME        name registrations sit under (default "hood"); may be
///                      an ENS name such as "names.example.eth"
///   ENABLE_REFERRALS, ENABLE_GIFT_CARDS   optional modules (default false)
///   SANCTIONS_LIST     Chainalysis-compatible sanctions oracle (optional)
///   DISCOUNT_SIGNER    signer for the "verified" free-name attestation (optional)
///   ETH_USD_FEED       Chainlink-style ETH/USD feed (required on mainnet 4663;
///                      on other chains the fallback rate is used if unset)
///   FALLBACK_ETH_USD   ETH/USD with 8 decimals, e.g. 300000000000 for $3,000 (optional)
///   SEQUENCER_UPTIME_FEED  Chainlink L2 sequencer uptime feed (optional)
///   BATCH_GATEWAY_URLS comma-separated CCIP-Read batch gateways (optional)
///   GUARDIAN           address allowed to pause new sales (required on mainnet)
///   OVERWRITE          set true to replace an existing deployments/<chainId>.json
///   STABLECOIN         USD stablecoin to accept, e.g. USDG (optional)
///   TEST_STABLECOIN    testnets only: deploy a free-to-mint test dollar and
///                      accept it, when STABLECOIN is unset (default false)
///   WRAPPER_METADATA_URI, GIFT_CARD_URI (required on mainnet)
contract Deploy is Script, HoodDeployer {
    function run() external returns (Deployment memory d) {
        uint256 key = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(key);

        Config memory c = _defaultConfig();
        c.parentName = vm.envOr("PARENT_NAME", c.parentName);
        c.enableReferrals = vm.envOr("ENABLE_REFERRALS", false);
        c.enableGiftCards = vm.envOr("ENABLE_GIFT_CARDS", false);
        c.sanctionsList = vm.envOr("SANCTIONS_LIST", address(0));
        c.discountSigner = vm.envOr("DISCOUNT_SIGNER", address(0));
        c.usdFeed = vm.envOr("ETH_USD_FEED", address(0));
        // A fixed ETH/USD rate goes stale the moment the market moves, which
        // would let ETH payers and gift-card buyers pay the wrong amount.
        // It is acceptable on testnet only.
        require(
            c.usdFeed != address(0) || block.chainid != 4663,
            "ETH_USD_FEED is required on Robinhood Chain mainnet"
        );
        c.fallbackEthUsd = vm.envOr("FALLBACK_ETH_USD", c.fallbackEthUsd);
        c.stablecoin = vm.envOr("STABLECOIN", address(0));
        c.sequencerFeed = vm.envOr("SEQUENCER_UPTIME_FEED", address(0));
        c.guardian = vm.envOr("GUARDIAN", address(0));
        c.wrapperMetadataUri = vm.envOr(
            "WRAPPER_METADATA_URI",
            c.wrapperMetadataUri
        );
        c.giftCardUri = vm.envOr("GIFT_CARD_URI", c.giftCardUri);

        bool mainnet = block.chainid == 4663;
        c.giftCardFallbackSales = !mainnet && c.usdFeed == address(0);
        if (c.usdFeed != address(0)) {
            // A wrong feed address would otherwise only show up as failed
            // purchases after launch.
            (, int256 answer, , uint256 updatedAt, ) = IAggregatorV3(c.usdFeed)
                .latestRoundData();
            require(answer > 0, "ETH_USD_FEED returned no price");
            require(
                updatedAt <= block.timestamp &&
                    block.timestamp - updatedAt <= c.maxStaleness,
                "ETH_USD_FEED is stale"
            );
            uint256 unit = 10 ** uint256(IAggregatorV3(c.usdFeed).decimals());
            require(
                uint256(answer) > 100 * unit && uint256(answer) < 1_000_000 * unit,
                "ETH_USD_FEED price is not plausible for ETH/USD"
            );
        }
        if (c.sequencerFeed != address(0)) {
            // A wrong address here would make every ETH-priced sale revert.
            (, int256 status, uint256 upSince, , ) = IAggregatorV3(c.sequencerFeed)
                .latestRoundData();
            require(status == 0 && upSince != 0, "SEQUENCER_UPTIME_FEED does not report the sequencer as up");
        }
        {
            string[] memory none = new string[](0);
            c.batchGatewayUrls = vm.envOr("BATCH_GATEWAY_URLS", ",", none);
        }
        if (mainnet) {
            require(c.guardian != address(0), "GUARDIAN is required on mainnet");
            require(
                !_contains(c.wrapperMetadataUri, "metadata.example"),
                "WRAPPER_METADATA_URI is still the placeholder"
            );
            require(
                !c.enableGiftCards || !_contains(c.giftCardUri, "metadata.example"),
                "GIFT_CARD_URI is still the placeholder"
            );
        }

        string memory path = string.concat(
            "deployments/",
            vm.toString(block.chainid),
            ".json"
        );
        // The address file is what every later script trusts. Never replace
        // one by accident.
        require(
            !vm.exists(path) || vm.envOr("OVERWRITE", false),
            "deployments file exists; set OVERWRITE=true to replace it"
        );

        vm.startBroadcast(key);
        if (
            c.stablecoin == address(0) &&
            !mainnet &&
            vm.envOr("TEST_STABLECOIN", false)
        ) c.stablecoin = address(new TestUSD());
        d = _deployAll(deployer, c, _defaultTiers());
        vm.stopBroadcast();

        string memory o = "deployment";
        // Names are identified by chain id + registry address + node. Clients
        // must use this registry explicitly and never fall back to another
        // service that happens to use the same TLD.
        vm.serializeUint(o, "chainId", block.chainid);
        vm.serializeUint(o, "deployBlock", block.number);
        vm.serializeString(o, "parentName", c.parentName);
        vm.serializeBytes32(o, "parentNode", d.parentNode);
        vm.serializeAddress(o, "HoodNameLens", address(d.lens));
        vm.serializeAddress(o, "HoodNameRules", address(d.rules));
        vm.serializeAddress(o, "HoodNameGuard", address(d.guard));
        vm.serializeAddress(o, "GatewayProvider", address(d.gateways));
        vm.serializeAddress(
            o,
            "SignedDiscountValidator",
            address(d.verifiedValidator)
        );
        vm.serializeAddress(o, "ENSRegistry", address(d.registry));
        vm.serializeAddress(o, "BaseRegistrar", address(d.base));
        vm.serializeAddress(o, "ReverseRegistrar", address(d.reverseRegistrar));
        vm.serializeAddress(o, "PublicResolver", address(d.resolver));
        vm.serializeAddress(o, "NameWrapper", address(d.wrapper));
        vm.serializeAddress(o, "StaticMetadataService", address(d.metadata));
        vm.serializeAddress(o, "UniversalResolver", address(d.universalResolver));
        vm.serializeAddress(o, "HoodPriceOracle", address(d.oracle));
        vm.serializeAddress(o, "HoodResolverPolicy", address(d.policy));
        vm.serializeAddress(o, "HoodPointsLedger", address(d.ledger));
        vm.serializeAddress(o, "HoodGiftCard", address(d.giftCard));
        vm.serializeAddress(o, "HoodReferralHub", address(d.hub));
        vm.serializeAddress(o, "Stablecoin", c.stablecoin);
        string memory json = vm.serializeAddress(
            o,
            "HoodRegistrarController",
            address(d.controller)
        );

        console2.log("Deployer:", deployer);
        // A simulation deploys nothing, so it must not leave an address file
        // that later scripts would act on.
        if (vm.isContext(VmSafe.ForgeContext.ScriptBroadcast)) {
            vm.writeJson(json, path);
            console2.log("Addresses written to", path);
        } else {
            console2.log("Simulation only: no address file written.");
        }
        console2.log("Registration is PAUSED. Run ReserveNames, check it, then OpenRegistration.");
    }

    function _contains(
        string memory text,
        string memory needle
    ) private pure returns (bool) {
        return vm.indexOf(text, needle) != type(uint256).max;
    }
}
