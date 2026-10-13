// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {HoodNameGuard} from "../contracts/hood/HoodNameGuard.sol";
import {BaseTest} from "./Base.t.sol";
import {IHoodRegistrarController} from "../contracts/hood/IHoodRegistrarController.sol";
import {HoodRegistrarController} from "../contracts/hood/HoodRegistrarController.sol";
import {PaymentAcceptor} from "../contracts/hood/PaymentAcceptor.sol";
import {MockStablecoin} from "./Mocks.sol";

contract RegistrationTest is BaseTest {
    function test_RegisterWithETH_SetsOwnershipRecordsAndPrimaryName() public {
        uint256 price = _priceWei("alice");
        uint256 before = alice.balance;

        // Overpay by 1 ETH to check the refund.
        _registerETH(alice, "alice", bytes32(0), price + 1 ether);

        assertEq(d.base.ownerOf(_id("alice")), alice, "NFT owner");
        assertEq(d.registry.owner(_node("alice")), alice, "registry owner");
        assertEq(d.registry.resolver(_node("alice")), address(d.resolver));
        assertEq(d.resolver.addr(_node("alice")), alice, "addr record");
        assertEq(
            d.resolver.name(d.reverseRegistrar.node(alice)),
            "alice.hood",
            "primary name"
        );
        assertEq(d.base.nameExpires(_id("alice")), block.timestamp + YEAR);
        assertEq(alice.balance, before - price, "charged exactly the price");
        assertEq(address(d.controller).balance, price);
        assertFalse(d.controller.available("alice"));
    }

    function test_RegisterWithoutResolver() public {
        IHoodRegistrarController.Registration memory r = _registration(
            "plain",
            alice,
            bytes32(0)
        );
        r.resolver = address(0);
        r.data = new bytes[](0);
        r.reverseRecord = 0;
        _commit(alice, r);
        uint256 price = _priceWei("plain");
        vm.prank(alice);
        d.controller.register{value: price}(r);
        assertEq(d.base.ownerOf(_id("plain")), alice);
    }

    function test_PriceTiersInUSD() public view {
        (uint256 three, ) = d.oracle.priceUSD("abc", 0, YEAR);
        (uint256 four, ) = d.oracle.priceUSD("abcd", 0, YEAR);
        (uint256 five, ) = d.oracle.priceUSD("abcde", 0, YEAR);
        (uint256 long_, ) = d.oracle.priceUSD("averylongname", 0, YEAR);
        assertApproxEqRel(three, 640e18, 1e12);
        assertApproxEqRel(four, 160e18, 1e12);
        assertApproxEqRel(five, 5e18, 1e12);
        assertEq(long_, five);
        // $5 at the $3,000 fallback rate.
        assertApproxEqRel(_priceWei("alice"), uint256(5 ether) / 3000, 1e12);
    }

    function test_LabelValidity() public view {
        assertTrue(d.controller.valid("abc"));
        assertTrue(d.controller.valid("alice-2"));
        assertTrue(d.controller.valid("7eleven"), "leading digit");
        assertTrue(d.controller.valid(unicode"café"), "accented Latin");
        assertFalse(d.controller.valid("ab"), "too short");
        assertFalse(d.controller.valid("Alice"), "uppercase is folded by the interface, not stored");
        assertFalse(d.controller.valid("al ice"), "space");
        assertFalse(d.controller.valid("al.ice"), "dot");
        assertFalse(d.controller.valid("-alice"), "leading hyphen");
        assertFalse(d.controller.valid("alice-"), "trailing hyphen");
        assertFalse(d.controller.valid("xn--80ak6aa92e"), "punycode");
        assertFalse(d.controller.valid("0x1f9840a85d5af5bf1d1762f925bdaddc4201f984"), "reads like an address");
        // See test/NameRules.t.sol for alphabets and lookalikes.
    }

    function test_RevertWhen_NotCommitted() public {
        IHoodRegistrarController.Registration memory r = _registration(
            "alice",
            alice,
            bytes32(0)
        );
        vm.expectRevert();
        vm.prank(alice);
        d.controller.register{value: 1 ether}(r);
    }

    function test_RevertWhen_CommitmentTooNew() public {
        IHoodRegistrarController.Registration memory r = _registration(
            "alice",
            alice,
            bytes32(0)
        );
        vm.startPrank(alice);
        bytes32 commitment = d.controller.makeCommitment(r);
        d.controller.commit(commitment);
        skip(30);
        vm.expectRevert(
            abi.encodeWithSelector(
                HoodRegistrarController.CommitmentTooNew.selector,
                commitment,
                block.timestamp + 30,
                block.timestamp
            )
        );
        d.controller.register{value: 1 ether}(r);
        vm.stopPrank();
    }

    function test_RevertWhen_CommitmentTooOld() public {
        IHoodRegistrarController.Registration memory r = _registration(
            "alice",
            alice,
            bytes32(0)
        );
        _commit(alice, r);
        skip(1 days);
        vm.expectRevert();
        vm.prank(alice);
        d.controller.register{value: 1 ether}(r);
    }

    function test_RevertWhen_InsufficientValue() public {
        IHoodRegistrarController.Registration memory r = _registration(
            "alice",
            alice,
            bytes32(0)
        );
        _commit(alice, r);
        uint256 price = _priceWei("alice");
        vm.expectRevert(HoodRegistrarController.InsufficientValue.selector);
        vm.prank(alice);
        d.controller.register{value: price - 1}(r);
    }

    function test_RevertWhen_NameTaken() public {
        _registerETH(alice, "alice", bytes32(0), 1 ether);
        IHoodRegistrarController.Registration memory r = _registration(
            "alice",
            bob,
            bytes32(0)
        );
        _commit(bob, r);
        vm.expectRevert(
            abi.encodeWithSelector(
                HoodNameGuard.NameNotAvailable.selector,
                "alice"
            )
        );
        vm.prank(bob);
        d.controller.register{value: 1 ether}(r);
    }

    function test_RevertWhen_DurationTooShort() public {
        IHoodRegistrarController.Registration memory r = _registration(
            "alice",
            alice,
            bytes32(0)
        );
        r.duration = 27 days;
        vm.expectRevert(
            abi.encodeWithSelector(
                HoodRegistrarController.DurationTooShort.selector,
                27 days
            )
        );
        d.controller.makeCommitment(r);
    }

    function test_SomeoneElseCannotUseMyCommitmentForThemselves() public {
        // The commitment binds the owner, so a front-runner who copies the
        // reveal transaction can only register the name to the original owner.
        IHoodRegistrarController.Registration memory r = _registration(
            "alice",
            alice,
            bytes32(0)
        );
        r.reverseRecord = 0;
        _commit(alice, r);
        vm.prank(bob);
        d.controller.register{value: 1 ether}(r);
        assertEq(d.base.ownerOf(_id("alice")), alice);
    }

    /* Stablecoin payment */

    function test_RegisterWithStablecoin() public {
        IHoodRegistrarController.Registration memory r = _registration(
            "alice",
            alice,
            bytes32(0)
        );
        _commit(alice, r);
        uint256 before = usdg.balanceOf(alice);

        vm.prank(alice);
        d.controller.registerWithPayment(
            r,
            IHoodRegistrarController.Payment(address(usdg), false, 5e6)
        );

        assertEq(d.base.ownerOf(_id("alice")), alice);
        // $5 with 6 decimals, rounded up.
        assertEq(before - usdg.balanceOf(alice), 5e6);
        assertEq(usdg.balanceOf(address(d.controller)), 5e6);
    }

    function test_RevertWhen_StablecoinOverMaxAmount() public {
        IHoodRegistrarController.Registration memory r = _registration(
            "alice",
            alice,
            bytes32(0)
        );
        _commit(alice, r);
        vm.expectRevert(
            abi.encodeWithSelector(
                HoodRegistrarController.MaxTokenAmountExceeded.selector,
                5e6,
                4e6
            )
        );
        vm.prank(alice);
        d.controller.registerWithPayment(
            r,
            IHoodRegistrarController.Payment(address(usdg), false, 4e6)
        );
    }

    function test_RevertWhen_ETHSentWithStablecoinPayment() public {
        IHoodRegistrarController.Registration memory r = _registration(
            "alice",
            alice,
            bytes32(0)
        );
        _commit(alice, r);
        vm.expectRevert(HoodRegistrarController.UnexpectedValue.selector);
        vm.prank(alice);
        d.controller.registerWithPayment{value: 1}(
            r,
            IHoodRegistrarController.Payment(address(usdg), false, 5e6)
        );
    }

    function test_RevertWhen_TokenNotAccepted() public {
        MockStablecoin other = new MockStablecoin();
        IHoodRegistrarController.Registration memory r = _registration(
            "alice",
            alice,
            bytes32(0)
        );
        _commit(alice, r);
        vm.expectRevert(
            abi.encodeWithSelector(
                PaymentAcceptor.TokenNotAccepted.selector,
                address(other)
            )
        );
        vm.prank(alice);
        d.controller.registerWithPayment(
            r,
            IHoodRegistrarController.Payment(address(other), false, 5e6)
        );
    }

    /* Renewal */

    function test_RenewWithETHAndStablecoin() public {
        _registerETH(alice, "alice", bytes32(0), 1 ether);
        uint256 expires = d.base.nameExpires(_id("alice"));
        uint256 price = _priceWei("alice");

        // Anyone can renew any name.
        uint256 before = bob.balance;
        vm.prank(bob);
        d.controller.renew{value: 1 ether}("alice", YEAR, bytes32(0));
        assertEq(d.base.nameExpires(_id("alice")), expires + YEAR);
        assertEq(before - bob.balance, price);

        vm.prank(bob);
        d.controller.renewWithPayment(
            "alice",
            YEAR,
            bytes32(0),
            IHoodRegistrarController.Payment(address(usdg), false, 5e6)
        );
        assertEq(d.base.nameExpires(_id("alice")), expires + 2 * YEAR);
    }

    /* Expiry and release premium */

    function test_ExpiredNameCarriesDecayingPremium() public {
        _registerETH(alice, "alice", bytes32(0), 1 ether);
        uint256 expires = d.base.nameExpires(_id("alice"));

        vm.warp(expires + 1);
        assertFalse(d.controller.available("alice"), "in grace period");

        // Still renewable by the owner during grace.
        vm.prank(alice);
        d.controller.renew{value: 1 ether}("alice", 28 days, bytes32(0));
        expires = d.base.nameExpires(_id("alice"));

        vm.warp(expires + 90 days + 1);
        assertTrue(d.controller.available("alice"), "released");
        (, uint256 premiumAtRelease) = d.oracle.priceUSD("alice", expires, YEAR);
        assertApproxEqRel(premiumAtRelease, 100_000_000e18, 1e15);

        skip(1 days);
        (, uint256 premiumDayOne) = d.oracle.priceUSD("alice", expires, YEAR);
        assertApproxEqRel(premiumDayOne, 50_000_000e18, 1e15);

        skip(20 days);
        (, uint256 premiumEnd) = d.oracle.priceUSD("alice", expires, YEAR);
        assertEq(premiumEnd, 0, "premium gone after 21 days");

        // Bob takes the name at the base price.
        uint256 price = _priceWei("alice");
        uint256 before = bob.balance;
        _registerETH(bob, "alice", bytes32(0), 1 ether);
        assertEq(d.base.ownerOf(_id("alice")), bob);
        assertEq(before - bob.balance, price);
    }

    function test_PremiumIsChargedWhenRegisteringEarly() public {
        _registerETH(alice, "alice", bytes32(0), 1 ether);
        uint256 expires = d.base.nameExpires(_id("alice"));
        vm.warp(expires + 90 days + 20 days);

        IHoodRegistrarController.Registration memory r = _registration(
            "alice",
            bob,
            bytes32(0)
        );
        _commit(bob, r);
        IHoodRegistrarController.Quote memory q = d.controller.quoteRegistration(
            "alice",
            bob,
            YEAR,
            bytes32(0),
            bob,
            IHoodRegistrarController.Payment(address(0), false, 0)
        );
        assertGt(q.usdPremium, 0);

        uint256 before = bob.balance;
        vm.prank(bob);
        d.controller.register{value: q.amountDue}(r);
        assertEq(before - bob.balance, q.amountDue);
        assertGt(q.amountDue, _priceWei("alice"));
    }

    /* Withdrawal */

    function test_WithdrawGoesToOwner() public {
        _registerETH(alice, "alice", bytes32(0), 1 ether);
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

        uint256 ethHeld = address(d.controller).balance;
        uint256 before = address(this).balance;
        // Callable by anyone; funds only ever go to the owner.
        vm.prank(carol);
        d.controller.withdraw();
        assertEq(address(this).balance - before, ethHeld);

        vm.prank(carol);
        d.controller.withdrawToken(address(usdg));
        assertEq(usdg.balanceOf(address(this)), 5e6);
    }

    function test_OnlyOwnerCanChangeSettings() public {
        vm.startPrank(alice);
        vm.expectRevert("Ownable: caller is not the owner");
        d.controller.setPaymentToken(address(usdg), false);
        vm.expectRevert("Ownable: caller is not the owner");
        d.controller.setPriceOracle(d.oracle);
        vm.stopPrank();
    }
}
