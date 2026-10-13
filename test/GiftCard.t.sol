// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {BaseTest} from "./Base.t.sol";
import {IHoodRegistrarController} from "../contracts/hood/IHoodRegistrarController.sol";
import {HoodGiftCard} from "../contracts/hood/HoodGiftCard.sol";
import {HoodPointsLedger} from "../contracts/hood/HoodPointsLedger.sol";

contract GiftCardTest is BaseTest {
    function _one(uint256 v) internal pure returns (uint256[] memory a) {
        a = new uint256[](1);
        a[0] = v;
    }

    function _buyFor(address buyer, address to, uint256 id, uint256 n) internal {
        uint256 cost = d.giftCard.priceInETH(_one(id), _one(n));
        vm.prank(buyer);
        d.giftCard.buy{value: cost}(to, _one(id), _one(n));
    }

    function test_BuyGiftRedeemAndRegisterForFree() public {
        // Alice buys a $5 card for Bob.
        uint256 cost = d.giftCard.priceInETH(_one(1), _one(1));
        assertApproxEqRel(cost, uint256(5 ether) / 3000, 1e12);
        uint256 before = alice.balance;
        vm.prank(alice);
        d.giftCard.buy{value: cost + 1 ether}(bob, _one(1), _one(1));
        assertEq(before - alice.balance, cost, "excess refunded");
        assertEq(d.giftCard.balanceOf(bob, 1), 1);

        // Bob redeems it into points.
        vm.prank(bob);
        d.giftCard.redeem(_one(1), _one(1));
        assertEq(d.giftCard.balanceOf(bob, 1), 0);
        assertEq(d.ledger.balanceOf(bob), 5e18);

        // And registers a $5 name with nothing but points.
        IHoodRegistrarController.Registration memory r = _registration(
            "bobby",
            bob,
            bytes32(0)
        );
        _commit(bob, r);
        uint256 bobBefore = bob.balance;
        vm.prank(bob);
        d.controller.registerWithPayment(
            r,
            IHoodRegistrarController.Payment(address(0), true, 0)
        );
        assertEq(d.base.ownerOf(_id("bobby")), bob);
        assertEq(bob.balance, bobBefore, "nothing charged");
        assertLt(d.ledger.balanceOf(bob), 1e12, "points spent");
    }

    function test_PointsPartlyCoverAnExpensiveName() public {
        _buyFor(bob, bob, 2, 1); // $100
        vm.prank(bob);
        d.giftCard.redeem(_one(2), _one(1));

        // 4-character name: $160 a year, so $60 is left to pay.
        IHoodRegistrarController.Registration memory r = _registration(
            "bobb",
            bob,
            bytes32(0)
        );
        _commit(bob, r);
        uint256 before = usdg.balanceOf(bob);
        vm.prank(bob);
        d.controller.registerWithPayment(
            r,
            IHoodRegistrarController.Payment(address(usdg), true, 60e6)
        );
        assertEq(before - usdg.balanceOf(bob), 60e6);
        assertEq(d.ledger.balanceOf(bob), 0);
    }

    function test_PointsAreOnlySpentWhenAsked() public {
        _buyFor(bob, bob, 1, 1);
        vm.prank(bob);
        d.giftCard.redeem(_one(1), _one(1));

        uint256 price = _priceWei("bobby");
        uint256 before = bob.balance;
        _registerETH(bob, "bobby", bytes32(0), 1 ether);
        assertEq(before - bob.balance, price);
        assertEq(d.ledger.balanceOf(bob), 5e18, "points untouched");
    }

    function test_PointsPayForRenewal() public {
        _registerETH(bob, "bobby", bytes32(0), 1 ether);
        _buyFor(bob, bob, 1, 2);
        vm.prank(bob);
        d.giftCard.redeem(_one(1), _one(2));

        uint256 expires = d.base.nameExpires(_id("bobby"));
        uint256 before = bob.balance;
        vm.prank(bob);
        d.controller.renewWithPayment(
            "bobby",
            YEAR,
            bytes32(0),
            IHoodRegistrarController.Payment(address(0), true, 0)
        );
        assertEq(bob.balance, before);
        assertEq(d.base.nameExpires(_id("bobby")), expires + YEAR);
        assertApproxEqRel(d.ledger.balanceOf(bob), 5e18, 1e12);
    }

    function test_ReferralAppliesToWhatIsLeftAfterPoints() public {
        _registerETH(alice, "alice", bytes32(0), 1 ether);
        _buyFor(bob, bob, 2, 1); // $100
        vm.prank(bob);
        d.giftCard.redeem(_one(2), _one(1));

        IHoodRegistrarController.Registration memory r = _registration(
            "bobb",
            bob,
            _ref("alice")
        );
        _commit(bob, r);
        uint256 before = usdg.balanceOf(bob);
        vm.prank(bob);
        d.controller.registerWithPayment(
            r,
            IHoodRegistrarController.Payment(address(usdg), true, 60e6)
        );
        // $60 due after points; 5% off for the buyer, 5% to the referrer.
        assertEq(before - usdg.balanceOf(bob), 57e6);
        assertEq(d.hub.balances(alice, address(usdg)), 3e6);
    }

    function test_BuyWithStablecoin() public {
        uint256 before = usdg.balanceOf(alice);
        vm.prank(alice);
        d.giftCard.buyWithToken(address(usdg), 105e6, carol, _ids12(), _ids11());
        assertEq(before - usdg.balanceOf(alice), 105e6);
        assertEq(d.giftCard.balanceOf(carol, 1), 1);
        assertEq(d.giftCard.balanceOf(carol, 2), 1);

        vm.expectRevert(
            abi.encodeWithSelector(
                HoodGiftCard.MaxAmountExceeded.selector,
                105e6,
                104e6
            )
        );
        vm.prank(alice);
        d.giftCard.buyWithToken(address(usdg), 104e6, carol, _ids12(), _ids11());
    }

    function _ids12() internal pure returns (uint256[] memory a) {
        a = new uint256[](2);
        a[0] = 1;
        a[1] = 2;
    }

    function _ids11() internal pure returns (uint256[] memory a) {
        a = new uint256[](2);
        a[0] = 1;
        a[1] = 1;
    }

    function test_CardsAreTransferable() public {
        _buyFor(alice, alice, 1, 1);
        vm.prank(alice);
        d.giftCard.safeTransferFrom(alice, bob, 1, 1, "");
        vm.prank(bob);
        d.giftCard.redeem(_one(1), _one(1));
        assertEq(d.ledger.balanceOf(bob), 5e18);
    }

    function test_PromoMint() public {
        d.giftCard.mintPromo(carol, _one(2), _one(3));
        assertEq(d.giftCard.balanceOf(carol, 2), 3);

        vm.expectRevert("Ownable: caller is not the owner");
        vm.prank(carol);
        d.giftCard.mintPromo(carol, _one(2), _one(3));
    }

    function test_FaceValueCannotChange() public {
        vm.expectRevert(
            abi.encodeWithSelector(HoodGiftCard.CardAlreadyDefined.selector, 1)
        );
        d.giftCard.defineCard(1, 10e18);
    }

    function test_RevertWhen_UnknownCardOrUnderpaid() public {
        vm.expectRevert(
            abi.encodeWithSelector(HoodGiftCard.UnknownCard.selector, 99)
        );
        vm.prank(alice);
        d.giftCard.buy{value: 1 ether}(alice, _one(99), _one(1));

        uint256 cost = d.giftCard.priceInETH(_one(1), _one(1));
        vm.expectRevert(HoodGiftCard.InsufficientValue.selector);
        vm.prank(alice);
        d.giftCard.buy{value: cost - 1}(alice, _one(1), _one(1));
    }

    function test_RevertWhen_RedeemingCardsYouDoNotHold() public {
        vm.expectRevert("ERC1155: burn amount exceeds balance");
        vm.prank(bob);
        d.giftCard.redeem(_one(1), _one(1));
    }

    function test_LedgerAccessControl() public {
        vm.expectRevert(HoodPointsLedger.NotMinter.selector);
        vm.prank(alice);
        d.ledger.credit(alice, 1e18);

        vm.expectRevert(HoodPointsLedger.NotController.selector);
        vm.prank(alice);
        d.ledger.deduct(bob, 1);
    }

    function test_GiftCardProceedsGoToOwner() public {
        _buyFor(alice, alice, 2, 1);
        uint256 held = address(d.giftCard).balance;
        uint256 before = address(this).balance;
        d.giftCard.withdraw();
        assertEq(address(this).balance - before, held);
    }
}
