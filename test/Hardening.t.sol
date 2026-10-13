// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {BaseTest} from "./Base.t.sol";
import {IHoodRegistrarController} from "../contracts/hood/IHoodRegistrarController.sol";
import {HoodRegistrarController, IETHRegistrarControllerCompat} from "../contracts/hood/HoodRegistrarController.sol";
import {HoodPriceOracle, IAggregatorV3} from "../contracts/hood/HoodPriceOracle.sol";
import {PaymentAcceptor} from "../contracts/hood/PaymentAcceptor.sol";
import {MockFeed} from "./Mocks.sol";

/// A resolver whose addr() misbehaves in a chosen way.
contract HostileResolver {
    uint256 public mode; // 0 = revert, 1 = empty return, 2 = dirty upper bits, 3 = burn gas

    function setMode(uint256 _mode) external {
        mode = _mode;
    }

    fallback() external {
        if (mode == 0) revert("no");
        if (mode == 1) {
            assembly {
                return(0, 0)
            }
        }
        if (mode == 2) {
            assembly {
                mstore(0, not(0))
                return(0, 32)
            }
        }
        while (true) {}
    }
}

/// Regression tests for issues found in the independent review.
contract HardeningTest is BaseTest {
    IHoodRegistrarController.Payment internal ETH_PAYMENT =
        IHoodRegistrarController.Payment(address(0), false, 0);

    function test_NameCannotReferItselfThroughItsOwnRecords() public {
        // Bob registers "attacker", names "attacker" as the referrer, and sets
        // the address record to a second wallet in the same transaction.
        bytes[] memory data = new bytes[](1);
        data[0] = abi.encodeWithSignature(
            "setAddr(bytes32,address)",
            _node("attacker"),
            carol
        );
        IHoodRegistrarController.Registration memory r = _registration(
            "attacker",
            bob,
            _ref("attacker")
        );
        r.data = data;
        _commit(bob, r);

        uint256 price = _priceWei("attacker");
        uint256 before = bob.balance;
        vm.prank(bob);
        d.controller.register{value: 1 ether}(r);

        assertEq(before - bob.balance, price, "full price, no discount");
        assertEq(d.hub.balances(carol, address(0)), 0, "no commission");
        assertEq(d.hub.referralCount(_ref("attacker")), 0);
    }

    function test_CheapRegistrationsDoNotCountTowardsTiers() public {
        _registerETH(alice, "alice", bytes32(0), 1 ether);

        // A 28-day registration of a $5/yr name costs about $0.38.
        IHoodRegistrarController.Registration memory r = _registration(
            "bobby",
            bob,
            _ref("alice")
        );
        r.duration = 28 days;
        _commit(bob, r);
        vm.prank(bob);
        d.controller.register{value: 1 ether}(r);

        assertGt(d.hub.balances(alice, address(0)), 0, "commission still paid");
        assertEq(d.hub.referralCount(_ref("alice")), 0, "but not counted");

        // A full year counts.
        _registerETH(bob, "bobby2", _ref("alice"), 1 ether);
        assertEq(d.hub.referralCount(_ref("alice")), 1);
    }

    function test_RegistrationPaidWithPointsDoesNotCount() public {
        _registerETH(alice, "alice", bytes32(0), 1 ether);
        uint256[] memory one = new uint256[](1);
        one[0] = 1;
        d.giftCard.mintPromo(bob, one, one);
        vm.prank(bob);
        d.giftCard.redeem(one, one);

        IHoodRegistrarController.Registration memory r = _registration(
            "bobby",
            bob,
            _ref("alice")
        );
        _commit(bob, r);
        vm.prank(bob);
        d.controller.registerWithPayment(
            r,
            IHoodRegistrarController.Payment(address(usdg), true, 1e6)
        );
        assertEq(d.hub.referralCount(_ref("alice")), 0);
    }

    function test_NewOwnerOfExpiredNameDoesNotInheritReferralStatus() public {
        _registerETH(alice, "alice", bytes32(0), 1 ether);
        d.hub.setPartnerRate(_ref("alice"), true, 3000, 1000);
        _registerETH(bob, "bobby", _ref("alice"), 1 ether);
        assertEq(d.hub.referralCount(_ref("alice")), 1);

        vm.warp(d.base.nameExpires(_id("alice")) + 90 days + 22 days);
        _registerETH(carol, "alice", bytes32(0), 1 ether);

        assertEq(d.hub.referralCount(_ref("alice")), 0);
        (uint16 referrerBps, uint16 refereeBps) = d.hub.rates(_ref("alice"));
        assertEq(referrerBps, 500, "back to the base tier");
        assertEq(refereeBps, 500);
    }

    function test_ReleasePremiumEarnsNoCommissionOrDiscount() public {
        _registerETH(alice, "alice", bytes32(0), 1 ether);
        _registerETH(carol, "carol", bytes32(0), 1 ether);
        // Keep alice.hood alive so it can refer while carol.hood lapses.
        vm.prank(alice);
        d.controller.renew{value: 1 ether}("alice", 2 * YEAR, bytes32(0));

        vm.warp(d.base.nameExpires(_id("carol")) + 90 days + 20 days);
        IHoodRegistrarController.Registration memory r = _registration(
            "carol",
            bob,
            _ref("alice")
        );
        _commit(bob, r);

        // Quote after the commit wait, because the premium decays by the second.
        IHoodRegistrarController.Quote memory q = d.controller.quoteRegistration(
            "carol",
            bob,
            YEAR,
            _ref("alice"),
            bob,
            ETH_PAYMENT
        );
        assertGt(q.usdPremium, q.usdBase, "premium dominates the price");
        uint256 rent = d.oracle.usdToWei(q.usdBase);
        assertEq(q.referrerFee, (rent * 500) / 10_000, "5% of rent only");
        assertEq(q.refereeDiscount, (rent * 500) / 10_000);

        vm.deal(bob, q.amountDue);
        vm.prank(bob);
        d.controller.register{value: q.amountDue}(r);
        assertEq(bob.balance, 0, "quote was exact");
        assertEq(d.hub.balances(alice, address(0)), q.referrerFee);
    }

    function test_RentPriceEqualsChargeWhilePremiumIsActive() public {
        _registerETH(alice, "alice", bytes32(0), 1 ether);
        uint256 released = d.base.nameExpires(_id("alice")) + 90 days;

        for (uint256 i = 1; i <= 40; i++) {
            vm.warp(released + i * 11 hours + i * 37);
            (uint256 baseWei, uint256 premiumWei) = _price("alice");
            IHoodRegistrarController.Quote memory q = d
                .controller
                .quoteRegistration("alice", bob, YEAR, bytes32(0), bob, ETH_PAYMENT);
            assertEq(baseWei + premiumWei, q.amountDue);
        }
    }

    function _price(string memory label) internal view returns (uint256, uint256) {
        (bool ok, bytes memory ret) = address(d.controller).staticcall(
            abi.encodeWithSignature("rentPrice(string,uint256)", label, YEAR)
        );
        require(ok);
        return abi.decode(ret, (uint256, uint256));
    }

    function test_FeedOutageDoesNotBlockStablecoinOrPointsPayments() public {
        _registerETH(alice, "alice", bytes32(0), 1 ether);

        MockFeed feed = new MockFeed();
        feed.set(3000e8, block.timestamp);
        d.oracle.setFeed(IAggregatorV3(address(feed)), 1 hours);
        skip(2 hours); // feed is now stale

        vm.expectRevert();
        vm.prank(alice);
        d.controller.renew{value: 1 ether}("alice", YEAR, bytes32(0));

        uint256 expires = d.base.nameExpires(_id("alice"));
        vm.prank(alice);
        d.controller.renewWithPayment(
            "alice",
            YEAR,
            bytes32(0),
            IHoodRegistrarController.Payment(address(usdg), false, 5e6)
        );
        assertEq(d.base.nameExpires(_id("alice")), expires + YEAR);

        IHoodRegistrarController.Registration memory r = _registration(
            "bobby",
            bob,
            bytes32(0)
        );
        _commit(bob, r);
        vm.prank(bob);
        d.controller.registerWithPayment(
            r,
            IHoodRegistrarController.Payment(address(usdg), false, 5e6)
        );
        assertEq(d.base.ownerOf(_id("bobby")), bob);
    }

    function test_HostileReferrerResolverCannotBlockRegistrations() public {
        _registerETH(alice, "alice", bytes32(0), 1 ether);
        HostileResolver hostile = new HostileResolver();
        vm.prank(alice);
        d.registry.setResolver(_node("alice"), address(hostile));

        string[4] memory labels = ["bobby0", "bobby1", "bobby2", "bobby3"];
        for (uint256 mode = 0; mode < 4; mode++) {
            hostile.setMode(mode);
            assertEq(d.guard.referrerPayee(_ref("alice")), address(0));

            uint256 price = _priceWei(labels[mode]);
            uint256 before = bob.balance;
            _registerETH(bob, labels[mode], _ref("alice"), 1 ether);
            assertEq(d.base.ownerOf(_id(labels[mode])), bob);
            assertEq(before - bob.balance, price, "treated as no referrer");
        }
    }

    function test_RevertWhen_UnknownReverseRecordBits() public {
        IHoodRegistrarController.Registration memory r = _registration(
            "alice",
            alice,
            bytes32(0)
        );
        r.reverseRecord = 2;
        vm.expectRevert(
            abi.encodeWithSelector(
                HoodRegistrarController.UnknownReverseRecordBits.selector,
                2
            )
        );
        d.controller.makeCommitment(r);
    }

    function test_OwnershipCannotBeRenounced() public {
        vm.expectRevert(PaymentAcceptor.RenounceDisabled.selector);
        d.controller.renounceOwnership();
        vm.expectRevert(PaymentAcceptor.RenounceDisabled.selector);
        d.giftCard.renounceOwnership();
    }

    function test_FeedNeedsAStalenessWindow() public {
        MockFeed feed = new MockFeed();
        vm.expectRevert(HoodPriceOracle.InvalidStaleness.selector);
        d.oracle.setFeed(IAggregatorV3(address(feed)), 0);
    }

    function test_AdvertisesTheENSControllerInterface() public view {
        // Interface id of ENS IETHRegistrarController in ens-contracts v1.7.0.
        assertTrue(
            d.controller.supportsInterface(
                type(IETHRegistrarControllerCompat).interfaceId
            )
        );
        assertTrue(
            d.controller.supportsInterface(
                type(IHoodRegistrarController).interfaceId
            )
        );
    }
}
