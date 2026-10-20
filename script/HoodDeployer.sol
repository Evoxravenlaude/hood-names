// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {ENSRegistry} from "../contracts/registry/ENSRegistry.sol";
import {ENS} from "../contracts/registry/ENS.sol";
import {BaseRegistrarImplementation} from "../contracts/ethregistrar/BaseRegistrarImplementation.sol";
import {ReverseRegistrar} from "../contracts/reverseRegistrar/ReverseRegistrar.sol";
import {HoodPublicResolver} from "../contracts/hood/HoodPublicResolver.sol";
import {NameWrapper} from "../contracts/wrapper/NameWrapper.sol";
import {INameWrapper} from "../contracts/wrapper/INameWrapper.sol";
import {StaticMetadataService} from "../contracts/wrapper/StaticMetadataService.sol";
import {IMetadataService} from "../contracts/wrapper/IMetadataService.sol";
import {IBaseRegistrar} from "../contracts/ethregistrar/IBaseRegistrar.sol";
import {HoodUniversalResolver} from "../contracts/hood/HoodUniversalResolver.sol";
import {HoodBaseRegistrar} from "../contracts/hood/HoodBaseRegistrar.sol";
import {HoodResolverPolicy} from "../contracts/hood/HoodResolverPolicy.sol";
import {GatewayProvider} from "../contracts/ccipRead/GatewayProvider.sol";

import {NameEncoding} from "../contracts/hood/NameEncoding.sol";
import {HoodNameLens} from "../contracts/hood/HoodNameLens.sol";
import {HoodNameRules} from "../contracts/hood/HoodNameRules.sol";
import {HoodNameGuard} from "../contracts/hood/HoodNameGuard.sol";
import {NameRulesExtensions} from "./NameRulesExtensions.sol";
import {CommonBase} from "forge-std/Base.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ISanctionsList} from "../contracts/hood/HoodRegistrarController.sol";
import {SignedDiscountValidator} from "../contracts/hood/DiscountValidators.sol";
import {HoodPriceOracle, IAggregatorV3} from "../contracts/hood/HoodPriceOracle.sol";
import {HoodPointsLedger} from "../contracts/hood/HoodPointsLedger.sol";
import {HoodGiftCard} from "../contracts/hood/HoodGiftCard.sol";
import {HoodReferralHub} from "../contracts/hood/HoodReferralHub.sol";
import {HoodRegistrarController} from "../contracts/hood/HoodRegistrarController.sol";

/// @notice Deploys and wires the whole system. Shared by the deploy script
///         and the tests so that both exercise the same setup.
///         Whoever calls `_deployAll` ends up owning every contract and the
///         registry root; hand both to a multisig before mainnet use.
abstract contract HoodDeployer is CommonBase, NameRulesExtensions {
    struct Config {
        // The name registrations sit under: a TLD such as "hood", or a
        // name such as "names.example.eth". Lowercase ASCII, dot-separated.
        string parentName;
        // Optional modules. Off by default: the launch product is names.
        bool enableReferrals;
        bool enableGiftCards;
        // Sanctions oracle (Chainalysis-compatible), or zero to skip screening
        address sanctionsList;
        // If set, deploys a signed-attestation validator with this signer and
        // registers a "verified" discount of verifiedDiscountBps (10000 = free)
        address discountSigner;
        uint16 verifiedDiscountBps;
        // shortest label a discount applies to
        uint8 discountMinLabelLength;
        // attoUSD per second for 1, 2, 3, 4 and 5+ character labels
        uint256[5] rentPrices;
        // ETH/USD feed, or zero to use fallbackEthUsd
        address usdFeed;
        uint256 maxStaleness;
        // ETH/USD with 8 decimals, used when usdFeed is zero
        uint256 fallbackEthUsd;
        // release premium in attoUSD and the days it decays over
        uint256 startPremium;
        uint256 premiumDays;
        uint256 minCommitmentAge;
        uint256 maxCommitmentAge;
        // smallest paid registration (USD, 18 decimals) that counts towards referral tiers
        uint256 minCountedReferralUSD;
        // Chainlink L2 sequencer uptime feed, or zero if the chain has none
        address sequencerFeed;
        uint256 sequencerGracePeriod;
        // address allowed to pause sales in an incident, or zero for none
        address guardian;
        // USD stablecoin accepted for payment, or zero for none
        address stablecoin;
        // Let gift cards be sold for ETH at the owner-set fallback rate when
        // there is no live feed. Testnet only.
        bool giftCardFallbackSales;
        string wrapperMetadataUri;
        string giftCardUri;
        string[] batchGatewayUrls;
    }

    struct Deployment {
        ENSRegistry registry;
        HoodBaseRegistrar base;
        ReverseRegistrar reverseRegistrar;
        HoodPublicResolver resolver;
        NameWrapper wrapper;
        StaticMetadataService metadata;
        HoodUniversalResolver universalResolver;
        HoodResolverPolicy policy;
        HoodNameLens lens;
        HoodNameRules rules;
        HoodNameGuard guard;
        SignedDiscountValidator verifiedValidator;
        GatewayProvider gateways;
        bytes32 parentNode;
        HoodPriceOracle oracle;
        HoodPointsLedger ledger;
        HoodGiftCard giftCard;
        HoodReferralHub hub;
        HoodRegistrarController controller;
    }

    bytes32 internal constant REVERSE_LABELHASH = keccak256("reverse");
    bytes32 internal constant ADDR_LABELHASH = keccak256("addr");
    bytes32 internal constant REVERSE_NODE =
        keccak256(abi.encodePacked(bytes32(0), REVERSE_LABELHASH));

    /// @dev Placeholder launch settings. Prices and referral tiers are not
    ///      final; change them here or through the owner functions later.
    bytes32 internal constant VERIFIED_DISCOUNT = keccak256("verified");

    function _defaultConfig() internal pure returns (Config memory c) {
        c.parentName = "hood";
        c.verifiedDiscountBps = 10_000;
        c.discountMinLabelLength = 5;
        c.rentPrices = [
            uint256(20294266869609), // 1 char  (unreachable while min length is 3)
            20294266869609, //          2 chars (unreachable while min length is 3)
            20294266869609, //          3 chars: $640 a year
            5073566717402, //           4 chars: $160 a year
            158548959918 //             5+ chars: $5 a year (rounded down so a year never exceeds $5)
        ];
        c.maxStaleness = 1 days;
        c.fallbackEthUsd = 3000e8;
        c.startPremium = 100_000_000e18;
        c.premiumDays = 21;
        c.sequencerGracePeriod = 1 hours;
        c.minCommitmentAge = 60;
        c.maxCommitmentAge = 1 days;
        c.minCountedReferralUSD = 4e18;
        c.wrapperMetadataUri = "https://metadata.example/name/0x{id}";
        c.giftCardUri = "https://metadata.example/giftcard/{id}";
    }

    function _defaultTiers()
        internal
        pure
        returns (HoodReferralHub.Tier[] memory tiers)
    {
        tiers = new HoodReferralHub.Tier[](3);
        tiers[0] = HoodReferralHub.Tier(0, 500, 500); //    5% to referrer, 5% off for buyer
        tiers[1] = HoodReferralHub.Tier(10, 1000, 500); //  from 10 referrals: 10% / 5%
        tiers[2] = HoodReferralHub.Tier(100, 1500, 500); // from 100 referrals: 15% / 5%
    }

    function _deployAll(
        address deployer,
        Config memory c,
        HoodReferralHub.Tier[] memory tiers
    ) internal returns (Deployment memory d) {
        _checkParentName(c.parentName);

        // 1. Registry. The deployer owns the root node.
        d.registry = new ENSRegistry();

        // 2. Reverse registrar owns addr.reverse. This must exist before any
        //    contract that claims its own reverse record in its constructor.
        d.reverseRegistrar = new ReverseRegistrar(ENS(address(d.registry)));
        d.registry.setSubnodeOwner(bytes32(0), REVERSE_LABELHASH, deployer);
        d.registry.setSubnodeOwner(
            REVERSE_NODE,
            ADDR_LABELHASH,
            address(d.reverseRegistrar)
        );

        // 3. Base registrar owns the TLD.
        //    The parent may be several labels deep ("names.example.eth"):
        //    the deployer owns every node above it, the registrar owns it.
        d.parentNode = NameEncoding.namehash(c.parentName);
        d.base = new HoodBaseRegistrar(ENS(address(d.registry)), d.parentNode);
        {
            string[] memory parts = NameEncoding.labels(c.parentName);
            bytes32 node;
            for (uint256 i = parts.length; i > 0; i--) {
                bytes32 labelhash = keccak256(bytes(parts[i - 1]));
                d.registry.setSubnodeOwner(
                    node,
                    labelhash,
                    i == 1 ? address(d.base) : deployer
                );
                node = keccak256(abi.encodePacked(node, labelhash));
            }
        }

        // 4. Name wrapper, for subnames and fuses.
        d.metadata = new StaticMetadataService(c.wrapperMetadataUri);
        d.wrapper = new NameWrapper(
            ENS(address(d.registry)),
            d.base,
            IMetadataService(address(d.metadata)),
            d.parentNode,
            NameEncoding.dnsEncode(c.parentName)
        );
        d.base.addController(address(d.wrapper));
        d.policy = new HoodResolverPolicy(
            ENS(address(d.registry)),
            INameWrapper(address(d.wrapper))
        );
        d.base.setPolicy(d.policy);

        // 5. Pricing, points, gift cards, referrals.
        d.oracle = new HoodPriceOracle(
            c.rentPrices,
            IAggregatorV3(c.usdFeed),
            c.maxStaleness,
            c.fallbackEthUsd,
            c.startPremium,
            c.premiumDays
        );
        if (c.enableGiftCards) {
            d.ledger = new HoodPointsLedger();
            d.giftCard = new HoodGiftCard(c.giftCardUri, d.oracle, d.ledger);
            d.ledger.setMinter(address(d.giftCard), true);
            if (c.giftCardFallbackSales)
                d.giftCard.setFallbackSalesAllowed(true);
        }
        if (c.enableReferrals)
            d.hub = new HoodReferralHub(tiers, c.minCountedReferralUSD);

        d.rules = _deployNameRules();
        d.guard = new HoodNameGuard(d.rules, d.base, ENS(address(d.registry)));

        // 6. Registrar controller. It starts paused.
        d.controller = new HoodRegistrarController(
            d.base,
            d.oracle,
            c.minCommitmentAge,
            c.maxCommitmentAge,
            d.reverseRegistrar,
            ENS(address(d.registry)),
            d.hub,
            d.ledger,
            string.concat(".", c.parentName),
            d.guard
        );
        d.guard.setController(address(d.controller), true);
        d.base.addController(address(d.controller));
        // Renewals go through the wrapper so wrapped names stay in step.
        d.wrapper.setController(address(d.controller), true);
        d.controller.setNameWrapper(INameWrapper(address(d.wrapper)));
        d.reverseRegistrar.setController(address(d.controller), true);
        if (c.enableReferrals) d.hub.setController(address(d.controller), true);
        if (c.enableGiftCards)
            d.ledger.setController(address(d.controller), true);
        if (c.sanctionsList != address(0))
            d.controller.setSanctionsList(ISanctionsList(c.sanctionsList));
        if (c.discountSigner != address(0)) {
            d.verifiedValidator = new SignedDiscountValidator(
                address(d.controller),
                c.discountSigner
            );
            d.controller.setDiscount(
                VERIFIED_DISCOUNT,
                true,
                address(d.verifiedValidator),
                c.verifiedDiscountBps,
                c.discountMinLabelLength
            );
        }

        // 7. Public resolver, trusted by the controller and reverse registrar.
        d.resolver = new HoodPublicResolver(
            ENS(address(d.registry)),
            INameWrapper(address(d.wrapper)),
            address(d.controller),
            address(d.reverseRegistrar)
        );
        d.reverseRegistrar.setDefaultResolver(address(d.resolver));
        d.policy.setTrustedResolver(address(d.resolver), true);
        d.policy.setDefaultResolver(address(d.resolver));

        // 8. Universal resolver, used by SDKs for one-call resolution.
        d.gateways = new GatewayProvider(deployer, c.batchGatewayUrls);
        d.universalResolver = new HoodUniversalResolver(
            deployer,
            ENS(address(d.registry)),
            IBaseRegistrar(address(d.base)),
            d.policy,
            d.parentNode,
            d.gateways
        );

        if (c.sequencerFeed != address(0))
            d.oracle.setSequencerFeed(
                IAggregatorV3(c.sequencerFeed),
                c.sequencerGracePeriod
            );
        if (c.guardian != address(0)) {
            d.controller.setGuardian(c.guardian);
            if (c.enableGiftCards) d.giftCard.setGuardian(c.guardian);
        }
        d.lens = new HoodNameLens(
            ENS(address(d.registry)),
            d.base,
            INameWrapper(address(d.wrapper)),
            d.policy,
            d.guard
        );

        // 9. Stablecoin payment.
        if (c.stablecoin != address(0)) {
            d.controller.setPaymentToken(c.stablecoin, true);
            if (c.enableGiftCards) d.giftCard.setPaymentToken(c.stablecoin, true);
        }

        // 10. The controller is paused from construction. Registration
        //     stays closed until names have been reserved: open it with
        //     OpenRegistration once ReserveNames has run and been checked.
    }

    /// @dev Deploys the name rules and loads the generated character tables
    ///      from nametables/ (see tools/gen-name-tables.mjs).
    function _deployNameRules() internal returns (HoodNameRules rules) {
        string memory meta = vm.readFile("nametables/meta.json");
        rules = new HoodNameRules(vm.parseJsonUint(meta, ".latinBit"));

        string[] memory files = vm.parseJsonStringArray(meta, ".pageFiles");
        for (uint256 i = 0; i < files.length; i++)
            rules.addPage(vm.parseBytes(vm.readFile(files[i])));

        uint256[] memory starts = vm.parseJsonUintArray(meta, ".rangeStarts");
        uint256[] memory ends = vm.parseJsonUintArray(meta, ".rangeEnds");
        uint256[] memory scripts = vm.parseJsonUintArray(meta, ".rangeScripts");
        HoodNameRules.Range[] memory ranges = new HoodNameRules.Range[](starts.length);
        for (uint256 i = 0; i < starts.length; i++)
            ranges[i] = HoodNameRules.Range(
                uint24(starts[i]),
                uint24(ends[i]),
                uint8(scripts[i])
            );
        rules.addRanges(ranges);
        rules.addGroups(vm.parseJsonUintArray(meta, ".groups"));
        rules.addPatterns(vm.parseJsonBytesArray(meta, ".patterns"));
        // From here on the tables can only grow: what an existing name looks
        // like can no longer be changed under its holder.
        rules.seal();
        // Alphabets added after launch, through the same append-only path a
        // live deployment uses, so both end up with identical tables.
        _applyNameExtensions(rules);
    }

    /// @dev Lowercase letters, digits, hyphens and dots only, and not the
    ///      reverse namespace. An uppercase parent would hash to a node no
    ///      wallet computes.
    function _checkParentName(string memory parentName) internal pure {
        bytes memory b = bytes(parentName);
        for (uint256 i = 0; i < b.length; i++) {
            bytes1 ch = b[i];
            bool ok = (ch >= "a" && ch <= "z") ||
                (ch >= "0" && ch <= "9") ||
                ch == "-" ||
                ch == ".";
            require(ok, "parent name: lowercase ASCII only");
        }
        string[] memory parts = NameEncoding.labels(parentName);
        require(
            keccak256(bytes(parts[parts.length - 1])) != REVERSE_LABELHASH,
            "parent name: reverse is taken"
        );
    }

    /// @notice Hands the whole system to a new owner, for example the chain
    ///         operator's multisig: the registry root and every node above
    ///         the parent name, plus ownership of every contract.
    ///
    /// Contracts with two-step ownership only record the new owner as
    /// pending; the new owner finishes by calling `acceptOwnership()` on
    /// each. UNTIL THEN THE OLD OWNER STILL CONTROLS THOSE CONTRACTS (prices,
    /// reserved names, proceeds, resolver policy). Run `_handOverProblem`
    /// afterwards and treat the handover as incomplete until it returns an
    /// empty string.
    ///
    /// One-step items (registry nodes, registrar, wrapper, reverse registrar,
    /// gateway provider) move immediately and cannot be recovered from a
    /// mistyped address, so `newOwner` must be a deployed contract such as
    /// a multisig unless `allowEOA` is set.
    ///
    /// Every step is skipped if `from` no longer holds the item, so a run
    /// that stopped half way can simply be run again.
    /// @param from The current owner, which must be the caller.
    /// @param newGuardian Pause guardian chosen by the new owner, or zero.
    function _handOver(
        Deployment memory d,
        string memory parentName,
        address from,
        address newOwner,
        address newGuardian,
        bool allowEOA
    ) internal {
        require(newOwner != address(0), "new owner required");
        require(newOwner != from, "new owner is the current owner");
        require(
            allowEOA || newOwner.code.length > 0,
            "new owner is not a contract"
        );

        // The old guardian was chosen by the old owner.
        if (d.controller.owner() == from && d.controller.guardian() != newGuardian)
            d.controller.setGuardian(newGuardian);
        if (
            address(d.giftCard) != address(0) &&
            d.giftCard.owner() == from &&
            d.giftCard.guardian() != newGuardian
        ) d.giftCard.setGuardian(newGuardian);

        // Two-step ownership.
        _offer(address(d.controller), from, newOwner);
        _offer(address(d.oracle), from, newOwner);
        _offer(address(d.policy), from, newOwner);
        _offer(address(d.rules), from, newOwner);
        _offer(address(d.guard), from, newOwner);
        _offer(address(d.hub), from, newOwner);
        _offer(address(d.ledger), from, newOwner);
        _offer(address(d.giftCard), from, newOwner);
        _offer(address(d.verifiedValidator), from, newOwner);

        // One-step ownership.
        if (d.base.owner() == from) d.base.transferOwnership(newOwner);
        if (d.reverseRegistrar.owner() == from)
            d.reverseRegistrar.transferOwnership(newOwner);
        if (d.wrapper.owner() == from) d.wrapper.transferOwnership(newOwner);
        if (d.gateways.owner() == from) d.gateways.transferOwnership(newOwner);

        // The contracts' own reverse records, claimed for the deployer at
        // construction.
        _moveNode(d, d.reverseRegistrar.node(address(d.wrapper)), from, newOwner);
        _moveNode(d, d.reverseRegistrar.node(address(d.resolver)), from, newOwner);
        _moveNode(
            d,
            d.reverseRegistrar.node(address(d.universalResolver)),
            from,
            newOwner
        );

        // Registry nodes above the parent, then the reverse node and the root.
        bytes32[] memory nodes = _ancestorNodes(parentName);
        for (uint256 i = 0; i < nodes.length; i++)
            _moveNode(d, nodes[i], from, newOwner);
        _moveNode(d, REVERSE_NODE, from, newOwner);
        _moveNode(d, bytes32(0), from, newOwner);

        // Nothing may be left behind: wrong key, or an earlier run that
        // named a different new owner.
        string memory problem = _handOverProblemPending(d, parentName, newOwner);
        require(bytes(problem).length == 0, string.concat("handover failed: ", problem));
    }

    /// @dev Like `_handOverProblem`, but a two-step contract counts once the
    ///      new owner is its pending owner.
    function _handOverProblemPending(
        Deployment memory d,
        string memory parentName,
        address newOwner
    ) internal view returns (string memory) {
        address[9] memory twoStep = [
            address(d.controller),
            address(d.oracle),
            address(d.policy),
            address(d.rules),
            address(d.guard),
            address(d.hub),
            address(d.ledger),
            address(d.giftCard),
            address(d.verifiedValidator)
        ];
        for (uint256 i = 0; i < twoStep.length; i++) {
            if (twoStep[i] == address(0)) continue;
            Ownable2Step ownable = Ownable2Step(twoStep[i]);
            if (ownable.owner() != newOwner && ownable.pendingOwner() != newOwner)
                return "a contract was not offered to the new owner";
        }
        return _oneStepProblem(d, parentName, newOwner);
    }

    function _offer(address target, address from, address newOwner) private {
        if (target == address(0)) return;
        Ownable2Step ownable = Ownable2Step(target);
        if (ownable.owner() == from && ownable.pendingOwner() != newOwner)
            ownable.transferOwnership(newOwner);
    }

    function _moveNode(
        Deployment memory d,
        bytes32 node,
        address from,
        address newOwner
    ) private {
        if (d.registry.owner(node) == from) d.registry.setOwner(node, newOwner);
    }

    /// @dev Namehashes of every name strictly above the parent, e.g. for
    ///      "names.example.eth": "example.eth" and "eth".
    function _ancestorNodes(
        string memory parentName
    ) internal pure returns (bytes32[] memory nodes) {
        string[] memory parts = NameEncoding.labels(parentName);
        nodes = new bytes32[](parts.length - 1);
        bytes32 node;
        for (uint256 i = parts.length; i > 1; i--) {
            node = keccak256(abi.encodePacked(node, keccak256(bytes(parts[i - 1]))));
            nodes[i - 2] = node;
        }
    }

    /// @notice Empty if `owner` holds everything; otherwise the first thing it
    ///         does not hold. Use it to confirm a handover is complete.
    function _handOverProblem(
        Deployment memory d,
        string memory parentName,
        address owner
    ) internal view returns (string memory) {
        if (d.controller.owner() != owner) return "controller not accepted";
        if (d.oracle.owner() != owner) return "price oracle not accepted";
        if (d.policy.owner() != owner) return "resolver policy not accepted";
        if (d.rules.owner() != owner) return "name rules not accepted";
        if (d.guard.owner() != owner) return "name guard not accepted";
        if (!d.rules.isSealed()) return "name rules not sealed";
        if (!d.guard.controllers(address(d.controller)))
            return "controller not authorised on the name guard";
        if (address(d.hub) != address(0) && d.hub.owner() != owner)
            return "referral hub not accepted";
        if (address(d.ledger) != address(0) && d.ledger.owner() != owner)
            return "points ledger not accepted";
        if (address(d.giftCard) != address(0) && d.giftCard.owner() != owner)
            return "gift card not accepted";
        if (
            address(d.verifiedValidator) != address(0) &&
            d.verifiedValidator.owner() != owner
        ) return "discount validator not accepted";
        return _oneStepProblem(d, parentName, owner);
    }

    function _oneStepProblem(
        Deployment memory d,
        string memory parentName,
        address owner
    ) private view returns (string memory) {
        if (d.base.owner() != owner) return "base registrar";
        if (d.reverseRegistrar.owner() != owner) return "reverse registrar";
        if (d.wrapper.owner() != owner) return "name wrapper";
        if (d.gateways.owner() != owner) return "gateway provider";
        if (d.registry.owner(bytes32(0)) != owner) return "registry root";
        if (d.registry.owner(REVERSE_NODE) != owner) return "reverse node";
        bytes32[] memory nodes = _ancestorNodes(parentName);
        for (uint256 i = 0; i < nodes.length; i++)
            if (d.registry.owner(nodes[i]) != owner) return "ancestor node";
        if (d.registry.owner(d.base.baseNode()) != address(d.base))
            return "registrar does not own the parent name";
        if (
            d.registry.owner(d.reverseRegistrar.node(address(d.wrapper))) != owner ||
            d.registry.owner(d.reverseRegistrar.node(address(d.resolver))) != owner ||
            d.registry.owner(d.reverseRegistrar.node(address(d.universalResolver))) !=
            owner
        ) return "a contract's reverse record";
        if (address(d.wrapper.upgradeContract()) != address(0))
            return "name wrapper has an upgrade target set";
        return "";
    }
}
