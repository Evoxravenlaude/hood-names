// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {BaseTest} from "./Base.t.sol";
import {IHoodRegistrarController} from "../contracts/hood/IHoodRegistrarController.sol";
import {NameEncoding} from "../contracts/hood/NameEncoding.sol";
import {HoodDeployer} from "../script/HoodDeployer.sol";
import {PaymentAcceptor} from "../contracts/hood/PaymentAcceptor.sol";

/// The suffix is a deployment choice: here names sit under an ENS-style
/// parent three labels deep instead of a TLD.
contract EnsParentTest is BaseTest {
    // DNS wire format of "alice.names.example.eth" and "pay.alice.names.example.eth".
    bytes internal constant ALICE_DNS = hex"05616c696365056e616d6573076578616d706c650365746800";
    bytes internal constant PAY_DNS = hex"0370617905616c696365056e616d6573076578616d706c650365746800";

    function _configure(Config memory c) internal pure override {
        c.parentName = "names.example.eth";
    }

    function test_EncodingHelpers() public pure {
        assertEq(
            NameEncoding.namehash("eth"),
            0x93cdeb708b7545dc668eb9280176169d1c33cfd8ed6f04690a0bcc88a93fc4ae
        );
        assertEq(NameEncoding.dnsEncode("hood"), hex"04686f6f6400");
        assertEq(
            NameEncoding.dnsEncode("alice.names.example.eth"),
            hex"05616c696365056e616d6573076578616d706c650365746800"
        );
    }

    function test_RegisterResolveAndPrimaryNameUnderAnEnsParent() public {
        _registerETH(alice, "alice", bytes32(0), 1 ether);
        assertEq(d.base.ownerOf(_id("alice")), alice);
        assertEq(_node("alice"), NameEncoding.namehash("alice.names.example.eth"));

        (bytes memory result, ) = d.universalResolver.resolve(
            ALICE_DNS,
            abi.encodeWithSignature("addr(bytes32)", _node("alice"))
        );
        assertEq(abi.decode(result, (address)), alice);

        (string memory primary, , ) = d.universalResolver.reverse(abi.encodePacked(alice), 60);
        assertEq(primary, "alice.names.example.eth");
    }

    function test_LifecycleRulesHoldUnderAnEnsParent() public {
        _registerETH(alice, "alice", bytes32(0), 1 ether);

        // Transfer hands over control and the buyer sees no records.
        vm.prank(alice);
        d.base.transferFrom(alice, bob, _id("alice"));
        assertEq(d.registry.owner(_node("alice")), bob);
        assertEq(d.resolver.addr(_node("alice")), address(0));

        // Wrap, issue a subname, and watch both lapse at expiry.
        vm.startPrank(bob);
        d.resolver.setAddr(_node("alice"), bob);
        d.base.safeTransferFrom(
            bob,
            address(d.wrapper),
            _id("alice"),
            abi.encode("alice", bob, uint16(0), address(d.resolver))
        );
        assertEq(d.wrapper.names(_node("alice")), ALICE_DNS);
        bytes32 sub = d.wrapper.setSubnodeRecord(
            _node("alice"), "pay", carol, address(d.resolver), 0, 0, 0
        );
        vm.stopPrank();
        vm.prank(carol);
        d.resolver.setAddr(sub, carol);
        _approveSub(bob, sub);
        (bytes memory result, ) = d.universalResolver.resolve(
            PAY_DNS,
            abi.encodeWithSignature("addr(bytes32)", sub)
        );
        assertEq(abi.decode(result, (address)), carol);

        assertFalse(d.universalResolver.isLapsed(ALICE_DNS));
        vm.warp(d.base.nameExpires(_id("alice")) + 1);
        assertTrue(d.universalResolver.isLapsed(ALICE_DNS));
        assertTrue(d.universalResolver.isLapsed(PAY_DNS));
        // Names above or beside the parent are not this service's concern.
        assertFalse(d.universalResolver.isLapsed(hex"076578616d706c650365746800"));
        assertFalse(d.universalResolver.isLapsed(hex"05616c6963650365746800"));
    }
}

/// The launch configuration: names only, no referrals, no gift cards.
contract LeanLaunchTest is BaseTest {
    function setUp() public override {
        vm.warp(1_760_000_000);
        Config memory c = _defaultConfig();
        d = _deployAll(address(this), c, _defaultTiers());
        assertTrue(d.controller.paused(), "deployments start closed");
        d.controller.unpause();
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
    }

    function test_OptionalModulesAreNotDeployed() public view {
        assertEq(address(d.hub), address(0));
        assertEq(address(d.giftCard), address(0));
        assertEq(address(d.ledger), address(0));
        assertEq(address(d.controller.referralHub()), address(0));
        assertEq(address(d.controller.pointsLedger()), address(0));
    }

    function test_RegistrationWorksAndIgnoresReferrerAndPoints() public {
        _registerETH(alice, "alice", bytes32(0), 1 ether);

        IHoodRegistrarController.Registration memory r = _registration("bobby", bob, _ref("alice"));
        _commit(bob, r);
        uint256 price = _priceWei("bobby");
        uint256 before = bob.balance;
        vm.prank(bob);
        d.controller.registerWithPayment{value: 1 ether}(
            r,
            IHoodRegistrarController.Payment(address(0), true, 0)
        );
        assertEq(before - bob.balance, price, "list price, nothing else happens");

        vm.prank(bob);
        d.controller.renew{value: 1 ether}("bobby", YEAR, bytes32(0));
    }
}

/// Handing the whole system to another owner, such as the chain operator.
contract HandOverTest is BaseTest {
    address internal operator = makeAddr("operator-multisig");

    function _configure(Config memory c) internal pure override {
        c.parentName = "names.example.eth";
        c.discountSigner = address(0xBEEF);
    }

    function _accept() internal {
        vm.startPrank(operator);
        d.controller.acceptOwnership();
        d.oracle.acceptOwnership();
        d.policy.acceptOwnership();
        d.rules.acceptOwnership();
        d.guard.acceptOwnership();
        d.hub.acceptOwnership();
        d.ledger.acceptOwnership();
        d.giftCard.acceptOwnership();
        d.verifiedValidator.acceptOwnership();
        vm.stopPrank();
    }

    function test_HandOverRequiresAContractUnlessAllowed() public {
        vm.expectRevert("new owner is not a contract");
        this.handOverExternal(false);
    }

    function handOverExternal(bool allowEOA) external {
        _handOver(d, config.parentName, address(this), operator, address(0), allowEOA);
    }

    function test_HandOverIsIncompleteUntilAccepted() public {
        d.controller.setGuardian(alice);
        _handOver(d, config.parentName, address(this), operator, address(0), true);
        assertEq(d.controller.guardian(), address(0), "old guardian removed");
        assertEq(
            _handOverProblem(d, config.parentName, operator),
            "controller not accepted"
        );
        _accept();
        assertEq(_handOverProblem(d, config.parentName, operator), "");
    }

    function test_HandOverLeavesThePreviousOwnerWithNothing() public {
        _handOver(d, config.parentName, address(this), operator, address(0), true);
        _accept();
        assertEq(_handOverProblem(d, config.parentName, operator), "");

        // Including the gateway list and the contracts' own reverse records.
        assertEq(d.gateways.owner(), operator);
        assertEq(d.registry.owner(d.reverseRegistrar.node(address(d.wrapper))), operator);
        assertEq(
            d.registry.owner(d.reverseRegistrar.node(address(d.universalResolver))),
            operator
        );
        string[] memory urls = new string[](0);
        vm.expectRevert();
        d.gateways.setGateways(urls);

        // Registry: root, every node above the parent, and the reverse node.
        assertEq(d.registry.owner(bytes32(0)), operator);
        assertEq(d.registry.owner(NameEncoding.namehash("eth")), operator);
        assertEq(d.registry.owner(NameEncoding.namehash("example.eth")), operator);
        assertEq(d.registry.owner(NameEncoding.namehash("reverse")), operator);
        assertEq(d.registry.owner(d.parentNode), address(d.base), "registrar keeps the parent");

        address[11] memory owners = [
            d.rules.owner(),
            d.base.owner(),
            d.reverseRegistrar.owner(),
            d.wrapper.owner(),
            d.controller.owner(),
            d.oracle.owner(),
            d.policy.owner(),
            d.hub.owner(),
            d.ledger.owner(),
            d.giftCard.owner(),
            d.verifiedValidator.owner()
        ];
        for (uint256 i = 0; i < owners.length; i++) assertEq(owners[i], operator);

        // The previous owner (this contract) can no longer do anything.
        vm.expectRevert();
        d.base.addController(address(this));
        vm.expectRevert(PaymentAcceptor.NotOwnerOrGuardian.selector);
        d.controller.pause();
        vm.expectRevert("Ownable: caller is not the owner");
        d.oracle.setFallbackEthUsd(1e8);
        vm.expectRevert("Ownable: caller is not the owner");
        d.policy.setDefaultResolver(address(0));
        vm.expectRevert();
        d.registry.setSubnodeOwner(bytes32(0), keccak256("evil"), address(this));

        // The new owner can, and the service keeps working for users.
        vm.prank(operator);
        d.controller.setGuardian(operator);
        _registerETH(alice, "alice", bytes32(0), 1 ether);
        assertEq(d.base.ownerOf(_id("alice")), alice);

        // Proceeds now go to the new owner.
        uint256 held = address(d.controller).balance;
        d.controller.withdraw();
        assertEq(operator.balance, held);
    }
}
