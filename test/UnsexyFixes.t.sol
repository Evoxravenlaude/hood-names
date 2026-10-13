// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {BaseTest} from "./Base.t.sol";
import {IHoodRegistrarController} from "../contracts/hood/IHoodRegistrarController.sol";
import {IUniversalResolver} from "../contracts/universalResolver/IUniversalResolver.sol";
import {HoodPriceOracle, IAggregatorV3} from "../contracts/hood/HoodPriceOracle.sol";
import {PaymentAcceptor} from "../contracts/hood/PaymentAcceptor.sol";
import {HoodRegistrarController} from "../contracts/hood/HoodRegistrarController.sol";
import {HostileResolver} from "./Hardening.t.sol";
import {MockFeed} from "./Mocks.sol";

/// A resolver that always answers with one fixed address.
contract SellerResolver {
    address internal immutable seller;

    constructor(address _seller) {
        seller = _seller;
    }

    function addr(bytes32) external view returns (address) {
        return seller;
    }

    function clearRecords(bytes32) external {}

    function supportsInterface(bytes4) external pure returns (bool) {
        return false;
    }
}

/// Transfers hand over control and the buyer gets a name with no inherited records.
contract TransferTest is BaseTest {
    function setUp() public override {
        super.setUp();
        _registerETH(alice, "alice", bytes32(0), 1 ether);
        vm.prank(alice);
        d.resolver.setText(_node("alice"), "url", "https://alice.example");
    }

    function test_TransferMovesControlAndClearsRecords() public {
        vm.prank(alice);
        d.base.transferFrom(alice, bob, _id("alice"));

        assertEq(d.base.ownerOf(_id("alice")), bob);
        assertEq(d.registry.owner(_node("alice")), bob, "control moved");
        assertEq(d.resolver.addr(_node("alice")), address(0), "seller address gone");
        assertEq(d.resolver.text(_node("alice"), "url"), "", "seller text gone");

        // The buyer can set records straight away, with no reclaim step.
        vm.prank(bob);
        d.resolver.setAddr(_node("alice"), bob);
        assertEq(d.resolver.addr(_node("alice")), bob);

        // The seller cannot.
        vm.expectRevert();
        vm.prank(alice);
        d.resolver.setAddr(_node("alice"), alice);
    }

    function test_MarketplaceStyleTransferBehavesTheSame() public {
        address marketplace = makeAddr("marketplace");
        vm.prank(alice);
        d.base.setApprovalForAll(marketplace, true);
        vm.prank(marketplace);
        d.base.safeTransferFrom(alice, bob, _id("alice"));

        assertEq(d.registry.owner(_node("alice")), bob);
        assertEq(d.resolver.addr(_node("alice")), address(0));
    }

    function test_SellersPrimaryNameStopsVerifyingAfterSale() public {
        vm.prank(alice);
        d.base.transferFrom(alice, bob, _id("alice"));
        vm.prank(bob);
        d.resolver.setAddr(_node("alice"), bob);

        try d.universalResolver.reverse(abi.encodePacked(alice), 60) returns (
            string memory primary,
            address,
            address
        ) {
            assertEq(primary, "");
        } catch {}
    }

    function test_SellerCannotKeepControlThroughASeparateManager() public {
        // Alice points registry control at a second wallet, then sells.
        vm.prank(alice);
        d.registry.setOwner(_node("alice"), carol);
        vm.prank(alice);
        d.base.transferFrom(alice, bob, _id("alice"));
        assertEq(d.registry.owner(_node("alice")), bob);
    }

    function test_WrappingAndUnwrappingKeepRecords() public {
        vm.startPrank(alice);
        d.base.safeTransferFrom(
            alice,
            address(d.wrapper),
            _id("alice"),
            abi.encode("alice", alice, uint16(0), address(d.resolver))
        );
        assertEq(d.resolver.addr(_node("alice")), alice, "kept on wrap");
        d.wrapper.unwrapETH2LD(keccak256("alice"), alice, alice);
        vm.stopPrank();
        assertEq(d.resolver.addr(_node("alice")), alice, "kept on unwrap");
        assertEq(d.resolver.text(_node("alice"), "url"), "https://alice.example");
    }

    function test_HostileResolverCannotBlockATransfer() public {
        HostileResolver hostile = new HostileResolver();
        vm.prank(alice);
        d.registry.setResolver(_node("alice"), address(hostile));

        for (uint256 mode = 0; mode < 4; mode++) {
            hostile.setMode(mode);
            address from = mode % 2 == 0 ? alice : bob;
            address to = mode % 2 == 0 ? bob : alice;
            vm.prank(from);
            d.base.transferFrom(from, to, _id("alice"));
            assertEq(d.base.ownerOf(_id("alice")), to);
            assertEq(d.registry.owner(_node("alice")), to);
            // The untrusted resolver is replaced, so it cannot keep answering.
            assertEq(d.registry.resolver(_node("alice")), address(d.resolver));
            vm.prank(to);
            d.registry.setResolver(_node("alice"), address(hostile));
        }
    }

    /* Ways a seller could try to make old records survive a sale */

    function test_ParkingTheResolverElsewhereBeforeSellingDoesNotHelp() public {
        // Alice unsets the resolver, sells, and the buyer points it back.
        vm.startPrank(alice);
        d.registry.setResolver(_node("alice"), address(0));
        d.base.transferFrom(alice, bob, _id("alice"));
        vm.stopPrank();

        assertEq(d.registry.resolver(_node("alice")), address(d.resolver), "default resolver");
        assertEq(d.resolver.addr(_node("alice")), address(0));
        assertEq(d.resolver.text(_node("alice"), "url"), "");
    }

    function test_SellersCustomResolverIsDroppedOnSale() public {
        SellerResolver custom = new SellerResolver(alice);
        vm.startPrank(alice);
        d.registry.setResolver(_node("alice"), address(custom));
        d.base.transferFrom(alice, bob, _id("alice"));
        vm.stopPrank();

        assertEq(d.registry.resolver(_node("alice")), address(d.resolver));
        (bytes memory result, ) = d.universalResolver.resolve(
            hex"05616c69636504686f6f6400",
            abi.encodeWithSignature("addr(bytes32)", _node("alice"))
        );
        assertEq(abi.decode(result, (address)), address(0), "does not pay the seller");
    }

    function test_SellingAWrappedNameHidesTheSellersRecords() public {
        vm.startPrank(alice);
        d.base.safeTransferFrom(
            alice,
            address(d.wrapper),
            _id("alice"),
            abi.encode("alice", alice, uint16(0), address(d.resolver))
        );
        d.wrapper.safeTransferFrom(alice, bob, uint256(_node("alice")), 1, "");
        vm.stopPrank();

        assertEq(d.wrapper.ownerOf(uint256(_node("alice"))), bob);
        assertEq(d.resolver.addr(_node("alice")), address(0));
        assertEq(d.resolver.text(_node("alice"), "url"), "");

        // Still hidden after the buyer unwraps.
        vm.prank(bob);
        d.wrapper.unwrapETH2LD(keccak256("alice"), bob, bob);
        assertEq(d.resolver.addr(_node("alice")), address(0));
    }

    function test_WrappingStraightToSomeoneElseHidesRecords() public {
        vm.startPrank(alice);
        d.base.setApprovalForAll(address(d.wrapper), true);
        d.wrapper.wrapETH2LD("alice", bob, 0, address(d.resolver));
        vm.stopPrank();
        assertEq(d.wrapper.ownerOf(uint256(_node("alice"))), bob);
        assertEq(d.resolver.addr(_node("alice")), address(0));
    }

    function test_UnwrappingToSomeoneElseHidesRecords() public {
        vm.startPrank(alice);
        d.base.safeTransferFrom(
            alice,
            address(d.wrapper),
            _id("alice"),
            abi.encode("alice", alice, uint16(0), address(d.resolver))
        );
        d.wrapper.unwrapETH2LD(keccak256("alice"), bob, bob);
        vm.stopPrank();
        assertEq(d.base.ownerOf(_id("alice")), bob);
        assertEq(d.resolver.addr(_node("alice")), address(0));
    }

    function test_SellersDelegatesLoseAccess() public {
        vm.prank(alice);
        d.resolver.approve(_node("alice"), carol, true);
        vm.prank(alice);
        d.base.transferFrom(alice, bob, _id("alice"));

        vm.expectRevert();
        vm.prank(carol);
        d.resolver.setAddr(_node("alice"), carol);
    }

    function test_RecordsReturnWhenANameComesBackFromAVault() public {
        address vault = makeAddr("vault");
        vm.prank(alice);
        d.base.transferFrom(alice, vault, _id("alice"));
        assertEq(d.resolver.addr(_node("alice")), address(0), "hidden while away");

        vm.prank(vault);
        d.base.transferFrom(vault, alice, _id("alice"));
        assertEq(d.resolver.addr(_node("alice")), alice, "restored");
        assertEq(d.resolver.text(_node("alice"), "url"), "https://alice.example");
    }

    function test_ClearRecordsStillWorks() public {
        vm.prank(alice);
        d.resolver.clearRecords(_node("alice"));
        assertEq(d.resolver.addr(_node("alice")), address(0));
        assertEq(d.resolver.text(_node("alice"), "url"), "");
    }
}

/// Expired names stop resolving through the universal resolver.
contract ExpiryResolutionTest is BaseTest {
    bytes internal constant ALICE_DNS = hex"05616c69636504686f6f6400";
    bytes internal constant PAY_ALICE_DNS = hex"0370617905616c69636504686f6f6400";
    bytes internal constant NOBODY_DNS = hex"066e6f626f647904686f6f6400";

    function setUp() public override {
        super.setUp();
        _registerETH(alice, "alice", bytes32(0), 1 ether);
    }

    function _resolves(bytes memory dnsName, bytes32 node) internal view returns (bool) {
        try
            d.universalResolver.resolve(
                dnsName,
                abi.encodeWithSignature("addr(bytes32)", node)
            )
        returns (bytes memory, address) {
            return true;
        } catch {
            return false;
        }
    }

    function test_NameStopsResolvingAtExpiryAndResumesOnRenewal() public {
        assertTrue(_resolves(ALICE_DNS, _node("alice")));

        uint256 expires = d.base.nameExpires(_id("alice"));
        vm.warp(expires - 1);
        assertTrue(_resolves(ALICE_DNS, _node("alice")), "last second of term");

        vm.warp(expires);
        assertFalse(_resolves(ALICE_DNS, _node("alice")), "exact moment of expiry");
        vm.warp(expires + 1);
        assertFalse(_resolves(ALICE_DNS, _node("alice")), "grace period");
        vm.expectRevert(
            abi.encodeWithSelector(
                IUniversalResolver.ResolverNotFound.selector,
                ALICE_DNS
            )
        );
        d.universalResolver.resolve(
            ALICE_DNS,
            abi.encodeWithSignature("addr(bytes32)", _node("alice"))
        );

        // Still renewable in grace, and resolution comes back.
        vm.prank(alice);
        d.controller.renew{value: 1 ether}("alice", YEAR, bytes32(0));
        assertTrue(_resolves(ALICE_DNS, _node("alice")), "renewed");
    }

    function test_LapsedNameIsNotReturnedAsAPrimaryName() public {
        (string memory primary, , ) = d.universalResolver.reverse(
            abi.encodePacked(alice),
            60
        );
        assertEq(primary, "alice.hood");

        vm.warp(d.base.nameExpires(_id("alice")) + 1);
        try d.universalResolver.reverse(abi.encodePacked(alice), 60) returns (
            string memory lapsed,
            address,
            address
        ) {
            assertEq(lapsed, "");
        } catch {}
    }

    function test_SubnamesLapseWithTheirParent() public {
        bytes32 sub = keccak256(abi.encodePacked(_node("alice"), keccak256("pay")));
        vm.startPrank(alice);
        d.registry.setSubnodeRecord(
            _node("alice"),
            keccak256("pay"),
            alice,
            address(d.resolver),
            0
        );
        d.resolver.setAddr(sub, carol);
        vm.stopPrank();
        assertFalse(_resolves(PAY_ALICE_DNS, sub), "not until the owner vouches for it");
        _approveSub(alice, sub);
        assertTrue(_resolves(PAY_ALICE_DNS, sub));

        vm.warp(d.base.nameExpires(_id("alice")) + 1);
        assertFalse(_resolves(PAY_ALICE_DNS, sub));
    }

    function test_UnregisteredNameDoesNotResolve() public view {
        assertFalse(_resolves(NOBODY_DNS, _node("nobody")));
        assertTrue(d.universalResolver.isLapsed(NOBODY_DNS));
        assertFalse(d.universalResolver.isLapsed(ALICE_DNS));
        // The TLD itself and names outside it are not this contract's concern.
        assertFalse(d.universalResolver.isLapsed(hex"04686f6f6400"));
        assertFalse(d.universalResolver.isLapsed(hex"05616c6963650365746800"));
    }
}

/// Pause switch and sequencer check.
contract IncidentControlsTest is BaseTest {
    address internal guardian = makeAddr("guardian");

    function setUp() public override {
        super.setUp();
        _registerETH(alice, "alice", bytes32(0), 1 ether);
        d.controller.setGuardian(guardian);
        d.giftCard.setGuardian(guardian);
    }

    function _one(uint256 v) internal pure returns (uint256[] memory a) {
        a = new uint256[](1);
        a[0] = v;
    }

    function test_PauseStopsRegistrationsButNotRenewals() public {
        IHoodRegistrarController.Registration memory r = _registration(
            "bobby",
            bob,
            bytes32(0)
        );
        _commit(bob, r);

        vm.prank(guardian);
        d.controller.pause();

        // No new commitments either, so nothing can be queued for reopening.
        vm.expectRevert(PaymentAcceptor.Paused.selector);
        d.controller.commit(keccak256("queued"));

        vm.expectRevert(PaymentAcceptor.Paused.selector);
        vm.prank(bob);
        d.controller.register{value: 1 ether}(r);
        vm.expectRevert(PaymentAcceptor.Paused.selector);
        vm.prank(bob);
        d.controller.registerWithPayment(
            r,
            IHoodRegistrarController.Payment(address(usdg), false, 5e6)
        );

        // Existing names are untouched: a name about to expire can still be
        // renewed, and records can still be edited.
        uint256 expires = d.base.nameExpires(_id("alice"));
        vm.warp(expires - 10 days);
        vm.startPrank(alice);
        d.controller.renew{value: 1 ether}("alice", 300 days, bytes32(0));
        d.resolver.setText(_node("alice"), "url", "https://alice.example");
        assertEq(d.base.nameExpires(_id("alice")), expires + 300 days);

        // But nobody can stock up on years while prices may be wrong.
        vm.expectRevert(HoodRegistrarController.RenewalTooLongWhilePaused.selector);
        d.controller.renew{value: 1 ether}("alice", YEAR, bytes32(0));
        vm.stopPrank();

        // Only the owner can resume.
        vm.expectRevert("Ownable: caller is not the owner");
        vm.prank(guardian);
        d.controller.unpause();
        d.controller.unpause();
        _commit(bob, r); // the earlier commitment has aged out by now
        vm.prank(bob);
        d.controller.register{value: 1 ether}(r);
        assertEq(d.base.ownerOf(_id("bobby")), bob);
    }

    function test_OnlyOwnerOrGuardianCanPause() public {
        vm.expectRevert(PaymentAcceptor.NotOwnerOrGuardian.selector);
        vm.prank(bob);
        d.controller.pause();
        d.controller.pause(); // owner
        assertTrue(d.controller.paused());
    }

    function test_PauseStopsGiftCardSalesButNotRedemption() public {
        d.giftCard.mintPromo(bob, _one(1), _one(1));
        vm.prank(guardian);
        d.giftCard.pause();

        vm.expectRevert(PaymentAcceptor.Paused.selector);
        vm.prank(bob);
        d.giftCard.buy{value: 1 ether}(bob, _one(1), _one(1));

        vm.prank(bob);
        d.giftCard.redeem(_one(1), _one(1));
        assertEq(d.ledger.balanceOf(bob), 5e18);
    }

    function test_SequencerDownBlocksETHPricingOnly() public {
        MockFeed price = new MockFeed();
        MockFeed sequencer = new MockFeed();
        price.set(3000e8, block.timestamp);
        sequencer.set(0, block.timestamp - 2 hours); // up for two hours
        d.oracle.setFeed(IAggregatorV3(address(price)), 1 days);
        d.oracle.setSequencerFeed(IAggregatorV3(address(sequencer)), 1 hours);
        assertEq(d.oracle.usdToWei(3000e18), 1 ether);

        sequencer.set(1, block.timestamp); // down
        vm.expectRevert(HoodPriceOracle.SequencerDown.selector);
        d.oracle.usdToWei(1e18);

        sequencer.set(0, block.timestamp); // just came back
        vm.expectRevert(
            abi.encodeWithSelector(
                HoodPriceOracle.SequencerGracePeriodNotOver.selector,
                block.timestamp
            )
        );
        d.oracle.usdToWei(1e18);

        // Stablecoin renewals do not need an ETH price and keep working.
        vm.prank(alice);
        d.controller.renewWithPayment(
            "alice",
            YEAR,
            bytes32(0),
            IHoodRegistrarController.Payment(address(usdg), false, 5e6)
        );

        skip(1 hours + 1);
        price.set(3000e8, block.timestamp);
        assertEq(d.oracle.usdToWei(3000e18), 1 ether, "trusted again after grace");
    }

    function test_UninitialisedSequencerFeedIsTreatedAsDown() public {
        MockFeed price = new MockFeed();
        MockFeed sequencer = new MockFeed(); // answer 0, startedAt 0
        price.set(3000e8, block.timestamp);
        d.oracle.setFeed(IAggregatorV3(address(price)), 1 days);
        d.oracle.setSequencerFeed(IAggregatorV3(address(sequencer)), 1 hours);
        vm.expectRevert(HoodPriceOracle.SequencerDown.selector);
        d.oracle.usdToWei(1e18);
    }

    function test_FeedTimestampFromTheFutureIsRejected() public {
        MockFeed price = new MockFeed();
        price.set(3000e8, block.timestamp + 1);
        d.oracle.setFeed(IAggregatorV3(address(price)), 1 days);
        vm.expectRevert(HoodPriceOracle.InvalidRate.selector);
        d.oracle.usdToWei(1e18);
    }
}
