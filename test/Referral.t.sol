// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {BaseTest} from "./Base.t.sol";
import {IHoodRegistrarController} from "../contracts/hood/IHoodRegistrarController.sol";
import {HoodReferralHub} from "../contracts/hood/HoodReferralHub.sol";

contract ReferralTest is BaseTest {
    function setUp() public override {
        super.setUp();
        // alice.hood exists and resolves to alice, so "alice" is a valid referrer.
        _registerETH(alice, "alice", bytes32(0), 1 ether);
        vm.prank(carol);
        d.controller.withdraw();
    }

    function test_ReferralPaysReferrerAndDiscountsBuyer() public {
        uint256 price = _priceWei("bobby");
        uint256 before = bob.balance;

        _registerETH(bob, "bobby", _ref("alice"), 1 ether);

        uint256 fee = (price * 500) / 10_000;
        uint256 discount = (price * 500) / 10_000;
        assertEq(before - bob.balance, price - discount, "buyer pays 95%");
        assertEq(d.hub.balances(alice, address(0)), fee, "referrer earns 5%");
        assertEq(address(d.hub).balance, fee);
        assertEq(
            address(d.controller).balance,
            price - discount - fee,
            "protocol keeps 90%"
        );
        assertEq(d.hub.referralCount(_ref("alice")), 1);

        uint256 aliceBefore = alice.balance;
        vm.prank(alice);
        d.hub.withdraw(address(0));
        assertEq(alice.balance - aliceBefore, fee);
        assertEq(d.hub.balances(alice, address(0)), 0);

        vm.expectRevert(HoodReferralHub.NothingToWithdraw.selector);
        vm.prank(alice);
        d.hub.withdraw(address(0));
    }

    function test_QuoteMatchesCharge() public {
        IHoodRegistrarController.Quote memory q = d.controller.quoteRegistration(
            "bobby",
            bob,
            YEAR,
            _ref("alice"),
            bob,
            IHoodRegistrarController.Payment(address(0), false, 0)
        );
        assertEq(q.referrerPayee, alice);
        uint256 before = bob.balance;
        _registerETH(bob, "bobby", _ref("alice"), q.amountDue);
        assertEq(before - bob.balance, q.amountDue);
    }

    function test_ReferralInStablecoin() public {
        IHoodRegistrarController.Registration memory r = _registration(
            "bobby",
            bob,
            _ref("alice")
        );
        _commit(bob, r);
        uint256 before = usdg.balanceOf(bob);
        vm.prank(bob);
        d.controller.registerWithPayment(
            r,
            IHoodRegistrarController.Payment(address(usdg), false, 5e6)
        );

        assertEq(before - usdg.balanceOf(bob), 4.75e6, "buyer pays $4.75");
        assertEq(d.hub.balances(alice, address(usdg)), 0.25e6);
        assertEq(usdg.balanceOf(address(d.hub)), 0.25e6);
        assertEq(usdg.balanceOf(address(d.controller)), 4.5e6);

        uint256 aliceBefore = usdg.balanceOf(alice);
        vm.prank(alice);
        d.hub.withdraw(address(usdg));
        assertEq(usdg.balanceOf(alice) - aliceBefore, 0.25e6);
    }

    function test_SelfReferralEarnsNothing() public {
        uint256 price = _priceWei("alice2");
        uint256 before = alice.balance;
        _registerETH(alice, "alice2", _ref("alice"), 1 ether);
        assertEq(before - alice.balance, price, "no discount");
        assertEq(d.hub.referralCount(_ref("alice")), 0);
        assertEq(d.hub.balances(alice, address(0)), 0);
    }

    function test_BuyingForTheReferrerEarnsNothing() public {
        // Bob pays, but the name goes to alice, who is also the referrer.
        IHoodRegistrarController.Registration memory r = _registration(
            "alice3",
            alice,
            _ref("alice")
        );
        r.reverseRecord = 0;
        _commit(bob, r);
        uint256 price = _priceWei("alice3");
        uint256 before = bob.balance;
        vm.prank(bob);
        d.controller.register{value: 1 ether}(r);
        assertEq(before - bob.balance, price);
        assertEq(d.hub.referralCount(_ref("alice")), 0);
    }

    function test_UnknownReferrerIsIgnored() public {
        uint256 price = _priceWei("bobby");
        uint256 before = bob.balance;
        _registerETH(bob, "bobby", _ref("nobody"), 1 ether);
        assertEq(before - bob.balance, price);
        assertEq(address(d.hub).balance, 0);
    }

    function test_ExpiredReferrerIsIgnored() public {
        vm.warp(d.base.nameExpires(_id("alice")) + 1);
        assertEq(d.guard.referrerPayee(_ref("alice")), address(0));
        uint256 price = _priceWei("bobby");
        uint256 before = bob.balance;
        _registerETH(bob, "bobby", _ref("alice"), 1 ether);
        assertEq(before - bob.balance, price);
    }

    function test_ReferrerWithoutAddressRecordIsIgnored() public {
        vm.prank(alice);
        d.resolver.setAddr(_node("alice"), address(0));
        assertEq(d.guard.referrerPayee(_ref("alice")), address(0));
    }

    function test_CommissionFollowsTheAddressRecord() public {
        vm.prank(alice);
        d.resolver.setAddr(_node("alice"), carol);
        _registerETH(bob, "bobby", _ref("alice"), 1 ether);
        assertGt(d.hub.balances(carol, address(0)), 0);
        assertEq(d.hub.balances(alice, address(0)), 0);
    }

    function test_RateRisesWithReferralCount() public {
        HoodReferralHub.Tier[] memory tiers = new HoodReferralHub.Tier[](2);
        tiers[0] = HoodReferralHub.Tier(0, 500, 500);
        tiers[1] = HoodReferralHub.Tier(2, 1000, 500);
        d.hub.setTiers(tiers);

        (uint16 r0, ) = d.hub.rates(_ref("alice"));
        assertEq(r0, 500);

        _registerETH(bob, "bobby", _ref("alice"), 1 ether);
        _registerETH(bob, "bobby2", _ref("alice"), 1 ether);
        (uint16 r2, uint16 e2) = d.hub.rates(_ref("alice"));
        assertEq(r2, 1000, "second tier reached after two referrals");
        assertEq(e2, 500);

        uint256 earned = d.hub.balances(alice, address(0));
        uint256 price = _priceWei("carol");
        _registerETH(carol, "carol", _ref("alice"), 1 ether);
        assertEq(
            d.hub.balances(alice, address(0)) - earned,
            (price * 1000) / 10_000
        );
    }

    function test_PartnerRateOverridesTiers() public {
        d.hub.setPartnerRate(_ref("alice"), true, 3000, 1000);
        uint256 price = _priceWei("bobby");
        uint256 before = bob.balance;
        _registerETH(bob, "bobby", _ref("alice"), 1 ether);
        assertEq(before - bob.balance, price - (price * 1000) / 10_000);
        assertEq(d.hub.balances(alice, address(0)), (price * 3000) / 10_000);
    }

    function test_RenewalPaysNoCommission() public {
        uint256 price = _priceWei("alice");
        uint256 before = bob.balance;
        vm.prank(bob);
        d.controller.renew{value: 1 ether}("alice", YEAR, _ref("alice"));
        assertEq(before - bob.balance, price);
        assertEq(address(d.hub).balance, 0);
    }

    function test_RatesAreCapped() public {
        vm.expectRevert(HoodReferralHub.RateTooHigh.selector);
        d.hub.setPartnerRate(_ref("alice"), true, 3000, 2001);

        HoodReferralHub.Tier[] memory tiers = new HoodReferralHub.Tier[](1);
        tiers[0] = HoodReferralHub.Tier(0, 5000, 1);
        vm.expectRevert(HoodReferralHub.RateTooHigh.selector);
        d.hub.setTiers(tiers);
    }

    function test_TiersMustStartAtZeroAndIncrease() public {
        HoodReferralHub.Tier[] memory tiers = new HoodReferralHub.Tier[](2);
        tiers[0] = HoodReferralHub.Tier(1, 500, 500);
        tiers[1] = HoodReferralHub.Tier(2, 500, 500);
        vm.expectRevert(HoodReferralHub.InvalidTiers.selector);
        d.hub.setTiers(tiers);

        tiers[0] = HoodReferralHub.Tier(0, 500, 500);
        tiers[1] = HoodReferralHub.Tier(0, 500, 500);
        vm.expectRevert(HoodReferralHub.InvalidTiers.selector);
        d.hub.setTiers(tiers);
    }

    function test_OnlyControllerCanRecord() public {
        vm.expectRevert(HoodReferralHub.NotController.selector);
        vm.prank(alice);
        d.hub.record(_ref("alice"), alice, address(0), 0, 0);
    }
}
