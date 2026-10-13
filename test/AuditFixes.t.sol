// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {BaseTest} from "./Base.t.sol";
import {MockFeed} from "./Mocks.sol";
import {IHoodRegistrarController} from "../contracts/hood/IHoodRegistrarController.sol";
import {HoodRegistrarController} from "../contracts/hood/HoodRegistrarController.sol";
import {HoodNameGuard} from "../contracts/hood/HoodNameGuard.sol";
import {HoodNameRules} from "../contracts/hood/HoodNameRules.sol";
import {HoodResolverPolicy} from "../contracts/hood/HoodResolverPolicy.sol";
import {HoodGiftCard} from "../contracts/hood/HoodGiftCard.sol";
import {HoodPriceOracle, IAggregatorV3} from "../contracts/hood/HoodPriceOracle.sol";
import {PaymentAcceptor} from "../contracts/hood/PaymentAcceptor.sol";
import {ENS} from "../contracts/registry/ENS.sol";
import {INameWrapper} from "../contracts/wrapper/INameWrapper.sol";

/// A stablecoin that keeps 1% of every transfer.
contract FeeToken is ERC20 {
    constructor() ERC20("Fee", "FEE") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function _transfer(address from, address to, uint256 amount) internal override {
        uint256 fee = amount / 100;
        super._transfer(from, address(0xdead), fee);
        super._transfer(from, to, amount - fee);
    }
}

/// Regression tests for the second audit round.
contract AuditFixesTest is BaseTest {
    bytes internal constant PAY_ALICE_DNS = hex"0370617905616c69636504686f6f6400";

    IHoodRegistrarController.Payment internal ETH_PAYMENT =
        IHoodRegistrarController.Payment(address(0), false, 0);

    function _one(string memory a) internal pure returns (string[] memory l) {
        l = new string[](1);
        l[0] = a;
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

    /* Launch window */

    function test_ControllerIsClosedFromTheMomentItExists() public {
        HoodRegistrarController fresh = new HoodRegistrarController(
            d.base,
            d.oracle,
            60,
            1 days,
            d.reverseRegistrar,
            ENS(address(d.registry)),
            d.hub,
            d.ledger,
            ".hood",
            d.guard
        );
        assertTrue(fresh.paused());
        vm.expectRevert(PaymentAcceptor.Paused.selector);
        fresh.commit(keccak256("early"));
    }

    /* Reserved names */

    function test_TwoReservedSpellingsShareOneReservation() public {
        // "paypal" and "paypa1" look the same, so they share a skeleton.
        d.guard.setReservedLabels(_one("paypal"), true);
        d.guard.setReservedLabels(_one("paypa1"), true);
        // Repeating a call changes nothing.
        d.guard.setReservedLabels(_one("paypal"), true);

        d.guard.setReservedLabels(_one("paypa1"), false);
        assertTrue(d.guard.isReserved("paypal"), "the other spelling still holds it");
        assertFalse(d.controller.available("paypa1"));

        d.guard.setReservedLabels(_one("paypal"), false);
        assertFalse(d.guard.isReserved("paypal"));
        // Releasing twice does not underflow or reserve anything.
        d.guard.setReservedLabels(_one("paypal"), false);
        assertTrue(d.controller.available("paypal"));
    }

    function test_ReservedAndLookalikeStateSurviveANewController() public {
        _registerETH(alice, "alice", bytes32(0), 1 ether);
        d.guard.setReservedLabels(_one("robinhood"), true);

        HoodRegistrarController next = new HoodRegistrarController(
            d.base,
            d.oracle,
            60,
            1 days,
            d.reverseRegistrar,
            ENS(address(d.registry)),
            d.hub,
            d.ledger,
            ".hood",
            d.guard
        );
        d.guard.setController(address(next), true);
        d.guard.setController(address(d.controller), false);
        d.base.addController(address(next));
        d.base.removeController(address(d.controller));
        next.unpause();

        assertFalse(next.available("robinhood"));
        assertFalse(next.available("r0binhood"));
        assertFalse(next.available("a1ice"), "lookalike of a live name");
        assertTrue(next.available("bobby"));

        // The retired controller can no longer take skeletons.
        IHoodRegistrarController.Registration memory r = _registration("bobby", bob, bytes32(0));
        _commit(bob, r);
        vm.expectRevert(HoodNameGuard.NotController.selector);
        vm.prank(bob);
        d.controller.register{value: 1 ether}(r);
    }

    function test_OnlyAControllerCanTakeASkeleton() public {
        vm.expectRevert(HoodNameGuard.NotController.selector);
        d.guard.admit("alice", keccak256("alice"), false);
    }

    /* Pricing by look */

    function test_ANameIsPricedOnTheShortestNameItLooksLike() public view {
        // "rnrnrn" reads as "mmm": six characters, priced as three.
        (bool ok, , uint256 length, uint256 priceLength) = d.rules.check("rnrnrn");
        assertTrue(ok);
        assertEq(length, 6);
        assertEq(priceLength, 3);
        assertEq(
            d.controller.rentPrice("rnrnrn", YEAR).base,
            d.controller.rentPrice("abc", YEAR).base
        );
        // "corn" reads as "com" and takes its place, so it costs the same.
        assertEq(
            d.controller.rentPrice("corn", YEAR).base,
            d.controller.rentPrice("com", YEAR).base
        );
        // Spelling equivalents are not lookalikes: "ss" is not a short "ß".
        assertEq(
            d.controller.rentPrice("class", YEAR).base,
            d.controller.rentPrice("alice", YEAR).base
        );
        assertEq(
            d.controller.rentPrice("boss", YEAR).base,
            d.controller.rentPrice("abcd", YEAR).base
        );
        // An ordinary long name is unaffected.
        assertEq(
            d.controller.rentPrice("alexander", YEAR).base,
            d.controller.rentPrice("alice", YEAR).base
        );
    }

    function test_LookalikeOfAJustReleasedNamePaysTheSamePremium() public {
        _registerETH(alice, "alice", bytes32(0), 1 ether);
        uint256 expires = d.base.nameExpires(_id("alice"));
        vm.warp(expires + 90 days + 1 days);

        assertTrue(d.controller.available("a1ice"));
        uint256 premium = d.controller.rentPrice("alice", YEAR).premium;
        assertGt(premium, 1000 ether, "about $50m a day after release");
        assertEq(d.controller.rentPrice("a1ice", YEAR).premium, premium);

        IHoodRegistrarController.Registration memory r = _registration("a1ice", bob, bytes32(0));
        _commit(bob, r);
        vm.expectRevert(HoodRegistrarController.InsufficientValue.selector);
        vm.prank(bob);
        d.controller.register{value: 1 ether}(r);
    }

    /* Who a name can go to, and for how long */

    function test_RevertWhen_OwnerIsNobodyOrAContractOfTheSystem() public {
        address[3] memory bad = [address(0), address(d.controller), address(d.wrapper)];
        for (uint256 i = 0; i < bad.length; i++) {
            IHoodRegistrarController.Registration memory r = _registration(
                "bobby",
                bad[i],
                bytes32(0)
            );
            r.reverseRecord = 0;
            r.data = new bytes[](0);
            _commit(bob, r);
            vm.expectRevert(
                abi.encodeWithSelector(
                    HoodRegistrarController.InvalidOwner.selector,
                    bad[i]
                )
            );
            vm.prank(bob);
            d.controller.register{value: 1 ether}(r);
        }
    }

    function test_RevertWhen_SettingAPrimaryNameWhileBuyingForSomeoneElse() public {
        IHoodRegistrarController.Registration memory r = _registration("carol", carol, bytes32(0));
        _commit(bob, r);
        vm.expectRevert(HoodRegistrarController.ReverseRecordNotForOwner.selector);
        vm.prank(bob);
        d.controller.register{value: 1 ether}(r);
    }

    function test_RevertWhen_TermRunsPastTheHorizon() public {
        IHoodRegistrarController.Registration memory r = _registration("bobby", bob, bytes32(0));
        r.duration = 3651 days;
        _commit(bob, r);
        vm.expectRevert(
            abi.encodeWithSelector(
                HoodRegistrarController.DurationTooLong.selector,
                3651 days
            )
        );
        vm.prank(bob);
        d.controller.register{value: 100 ether}(r);

        _registerETH(alice, "alice", bytes32(0), 1 ether);
        vm.startPrank(alice);
        d.controller.renew{value: 1 ether}("alice", 9 * YEAR, bytes32(0));
        vm.expectRevert(
            abi.encodeWithSelector(HoodRegistrarController.DurationTooLong.selector, YEAR)
        );
        d.controller.renew{value: 1 ether}("alice", YEAR, bytes32(0));
        vm.stopPrank();
    }

    /* Payments */

    function test_PointsCoverANameInFullWhileTheFeedIsDown() public {
        uint256[] memory ids = new uint256[](1);
        uint256[] memory amounts = new uint256[](1);
        ids[0] = 1;
        amounts[0] = 1;
        d.giftCard.mintPromo(bob, ids, amounts);
        vm.prank(bob);
        d.giftCard.redeem(ids, amounts);

        MockFeed feed = new MockFeed();
        feed.set(3000e8, block.timestamp);
        d.oracle.setFeed(IAggregatorV3(address(feed)), 1 hours);
        skip(2 hours);

        IHoodRegistrarController.Registration memory r = _registration("bobby", bob, bytes32(0));
        _commit(bob, r);
        vm.prank(bob);
        d.controller.registerWithPayment(
            r,
            IHoodRegistrarController.Payment(address(0), true, 0)
        );
        assertEq(d.base.ownerOf(_id("bobby")), bob);
    }

    function test_RevertWhen_TokenDeliversLessThanCharged() public {
        FeeToken fee = new FeeToken();
        d.controller.setPaymentToken(address(fee), true);
        fee.mint(bob, 100e6);
        vm.prank(bob);
        fee.approve(address(d.controller), type(uint256).max);

        IHoodRegistrarController.Registration memory r = _registration("bobby", bob, bytes32(0));
        _commit(bob, r);
        vm.expectRevert(
            abi.encodeWithSelector(
                HoodRegistrarController.ShortTransfer.selector,
                4_950_000,
                5_000_000
            )
        );
        vm.prank(bob);
        d.controller.registerWithPayment(
            r,
            IHoodRegistrarController.Payment(address(fee), false, 10e6)
        );
    }

    function test_CommissionCanBeWithdrawnToAnotherAddress() public {
        _registerETH(alice, "alice", bytes32(0), 1 ether);
        _registerETH(bob, "bobby", _ref("alice"), 1 ether);
        uint256 owed = d.hub.balances(alice, address(0));
        assertGt(owed, 0);
        vm.prank(alice);
        d.hub.withdrawTo(address(0), carol);
        assertEq(carol.balance, 1000 ether + owed);
        assertEq(d.hub.balances(alice, address(0)), 0);
    }

    function test_GiftCardsAreNotSoldForEthWithoutALiveRate() public {
        d.giftCard.setFallbackSalesAllowed(false);
        uint256[] memory ids = new uint256[](1);
        uint256[] memory amounts = new uint256[](1);
        ids[0] = 2;
        amounts[0] = 1;
        vm.expectRevert(HoodGiftCard.NoLiveRate.selector);
        vm.prank(bob);
        d.giftCard.buy{value: 1 ether}(bob, ids, amounts);

        // Stablecoin sales need no rate.
        vm.prank(bob);
        d.giftCard.buyWithToken(address(usdg), 100e6, bob, ids, amounts);
        assertEq(d.giftCard.balanceOf(bob, 2), 1);
    }

    /* Referrals */

    function test_ReferrerOnAResolverTheOwnerNeverApprovedEarnsNothing() public {
        _registerETH(alice, "alice", bytes32(0), 1 ether);
        assertEq(d.guard.referrerPayee(_ref("alice")), alice);

        // A second, untrusted copy of the resolver, pointing somewhere else.
        address other = address(
            new FixedAddrResolver(carol)
        );
        vm.prank(alice);
        d.registry.setResolver(_node("alice"), other);
        assertEq(d.guard.referrerPayee(_ref("alice")), address(0));

        vm.prank(alice);
        d.policy.approveResolver(_node("alice"), other);
        assertEq(d.guard.referrerPayee(_ref("alice")), carol);
    }

    /* Subnames */

    function test_SubnamesStopResolvingWhenTheParentChangesHands() public {
        _registerETH(alice, "alice", bytes32(0), 1 ether);
        bytes32 sub = keccak256(abi.encodePacked(_node("alice"), keccak256("pay")));
        vm.startPrank(alice);
        d.registry.setSubnodeRecord(
            _node("alice"),
            keccak256("pay"),
            alice,
            address(d.resolver),
            0
        );
        d.resolver.setAddr(sub, alice);
        vm.stopPrank();
        _approveSub(alice, sub);
        assertTrue(_resolves(PAY_ALICE_DNS, sub));

        // Sold. The seller still owns the subname in the registry, but it no
        // longer resolves: the buyer has not vouched for it.
        vm.prank(alice);
        d.base.transferFrom(alice, bob, _id("alice"));
        assertFalse(_resolves(PAY_ALICE_DNS, sub));

        // The buyer can adopt it deliberately.
        _approveSub(bob, sub);
        assertTrue(_resolves(PAY_ALICE_DNS, sub));
    }

    function test_ApprovalByAnyoneElseIsNeverConsulted() public {
        _registerETH(alice, "alice", bytes32(0), 1 ether);
        bytes32 sub = keccak256(abi.encodePacked(_node("alice"), keccak256("pay")));
        vm.startPrank(alice);
        d.registry.setSubnodeRecord(
            _node("alice"),
            keccak256("pay"),
            carol,
            address(d.resolver),
            0
        );
        vm.stopPrank();
        vm.prank(carol);
        d.resolver.setAddr(sub, carol);
        _approveSub(carol, sub);
        assertFalse(_resolves(PAY_ALICE_DNS, sub));
    }

    function test_OldApprovalDoesNotReviveWhatALaterOwnerDidToASubname() public {
        _registerETH(alice, "alice", bytes32(0), 1 ether);
        bytes32 sub = keccak256(abi.encodePacked(_node("alice"), keccak256("pay")));
        vm.startPrank(alice);
        d.registry.setSubnodeRecord(
            _node("alice"),
            keccak256("pay"),
            alice,
            address(d.resolver),
            0
        );
        d.resolver.setAddr(sub, alice);
        vm.stopPrank();
        _approveSub(alice, sub);

        // Alice sells to Bob. Bob takes the subname, points it at himself,
        // never approves it, and hands the name back.
        vm.prank(alice);
        d.base.transferFrom(alice, bob, _id("alice"));
        vm.startPrank(bob);
        d.registry.setSubnodeOwner(_node("alice"), keccak256("pay"), bob);
        d.resolver.setAddr(sub, bob);
        d.base.transferFrom(bob, alice, _id("alice"));
        vm.stopPrank();

        // Alice approved the subname as she left it, not as it is now.
        assertFalse(_resolves(PAY_ALICE_DNS, sub));

        // Nor does swapping only the resolver get through.
        vm.prank(bob);
        d.registry.setOwner(sub, alice);
        assertTrue(_resolves(PAY_ALICE_DNS, sub), "restored exactly: Alice's own records");
        (bytes memory result, ) = d.universalResolver.resolve(
            PAY_ALICE_DNS,
            abi.encodeWithSignature("addr(bytes32)", sub)
        );
        assertEq(abi.decode(result, (address)), alice);
        FixedAddrResolver other = new FixedAddrResolver(bob);
        vm.prank(alice);
        d.registry.setResolver(sub, address(other));
        assertFalse(_resolves(PAY_ALICE_DNS, sub));
    }

    function test_WithdrawnSubnameApprovalStopsResolution() public {
        _registerETH(alice, "alice", bytes32(0), 1 ether);
        bytes32 sub = keccak256(abi.encodePacked(_node("alice"), keccak256("pay")));
        vm.startPrank(alice);
        d.registry.setSubnodeRecord(_node("alice"), keccak256("pay"), carol, address(d.resolver), 0);
        vm.stopPrank();
        vm.prank(carol);
        d.resolver.setAddr(sub, carol);
        _approveSub(alice, sub);
        assertTrue(_resolves(PAY_ALICE_DNS, sub));

        bytes32[] memory subs = new bytes32[](1);
        subs[0] = sub;
        vm.prank(alice);
        d.policy.approveSubnames(subs, false);
        assertFalse(_resolves(PAY_ALICE_DNS, sub));
    }

    /* Resolver policy */

    function test_RevertWhen_DefaultResolverIsNotTrusted() public {
        vm.expectRevert(HoodResolverPolicy.DefaultNotTrusted.selector);
        d.policy.setDefaultResolver(address(0xBEEF));
    }

    /* Name tables */

    function test_TablesAreSealedAtDeployment() public {
        assertTrue(d.rules.isSealed());

        bytes[] memory patterns = new bytes[](1);
        patterns[0] = "ab";
        vm.expectRevert(HoodNameRules.Sealed.selector);
        d.rules.addPatterns(patterns);

        // A page that would change what an existing character means.
        bytes memory page = abi.encodePacked(
            hex"00",
            bytes3(uint24(0x61)), // "a"
            uint8(1),
            uint8(1),
            bytes8("b")
        );
        vm.expectRevert(
            abi.encodeWithSelector(HoodNameRules.AlreadyResolves.selector, 0x61)
        );
        d.rules.addPage(page);

        // A script group that would let existing alphabets mix.
        uint256[] memory groups = new uint256[](1);
        groups[0] = (1 << 1) | (1 << 2); // Latin with Cyrillic
        vm.expectRevert(HoodNameRules.BadGroup.selector);
        d.rules.addGroups(groups);
    }

    function test_NewCharactersCanStillBeAddedAfterSealing() public {
        // Thai ko kai, in a new script with its own group.
        assertFalse(d.guard.valid(unicode"กกก"));
        bytes memory page = abi.encodePacked(
            hex"00",
            bytes3(uint24(0x0E01)),
            uint8(20),
            uint8(3),
            bytes8(bytes3(unicode"ก"))
        );
        d.rules.addPage(page);
        uint256[] memory groups = new uint256[](1);
        groups[0] = 1 << 20;
        d.rules.addGroups(groups);
        assertTrue(d.guard.valid(unicode"กกก"));
        // Existing names read exactly as before.
        (bool ok, bytes memory skel) = d.rules.skeleton("a1ice");
        assertTrue(ok);
        assertEq(skel, "alice");
    }

    function test_ALargePageCanStillBeAddedAfterSealing() public {
        // 500 private-use characters in one call, within a block's gas.
        bytes memory page = new bytes(1 + 500 * 13);
        for (uint256 i = 0; i < 500; i++) {
            uint256 cp = 0xE000 + i;
            uint256 o = 1 + i * 13;
            page[o] = bytes1(uint8(cp >> 16));
            page[o + 1] = bytes1(uint8(cp >> 8));
            page[o + 2] = bytes1(uint8(cp));
            page[o + 3] = bytes1(uint8(21));
            page[o + 4] = bytes1(uint8(1));
            page[o + 5] = "z";
        }
        uint256 gasBefore = gasleft();
        d.rules.addPage(page);
        assertLt(gasBefore - gasleft(), 6_000_000);
    }

    function test_CheckingTheLongestNamesStaysAffordable() public view {
        string memory m = "mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm";
        assertEq(bytes(m).length, 63);
        uint256 gasBefore = gasleft();
        (bool ok, , uint256 length, uint256 priceLength) = d.rules.check(m);
        uint256 used = gasBefore - gasleft();
        assertTrue(ok);
        assertEq(length, 63);
        assertEq(priceLength, 63);
        assertLt(used, 700_000);
    }

    function test_NamesThatReadAsAddressesAreRefused() public view {
        assertFalse(d.guard.valid("0x52908400098527886e0f7030069857d2e4169ee7"));
        assertFalse(d.guard.valid("0xdeadbeef00"));
        // Written with the letter o, which looks the same.
        assertFalse(d.guard.valid("oxdeadbeefoo"));
        assertTrue(d.guard.valid("0xgreat"), "not hex");
        assertTrue(d.guard.valid("oxford"));
    }

    function test_AlmostExactDoublesInOtherAlphabetsCollideWithLatin() public {
        _registerETH(alice, "wow", bytes32(0), 1 ether);
        // Cyrillic sha reads as w.
        (bool ok, bytes memory skel) = d.rules.skeleton(unicode"шош");
        if (ok) {
            (, bytes memory latin) = d.rules.skeleton("wow");
            assertEq(skel, latin);
            assertFalse(d.controller.available(unicode"шош"));
        }
    }

    /* Handover */

    function test_HandOverCanBeRunAgainAndAppointsTheNewGuardian() public {
        address operator = address(new Operator());
        address guardian = makeAddr("operator guardian");
        _handOver(d, config.parentName, address(this), operator, guardian, false);
        _handOver(d, config.parentName, address(this), operator, guardian, false);
        assertEq(d.controller.guardian(), guardian);
        assertEq(d.guard.pendingOwner(), operator);
        assertEq(d.base.owner(), operator);
        assertEq(d.registry.owner(bytes32(0)), operator);
    }
}

contract Operator {}

contract FixedAddrResolver {
    address internal immutable target;

    constructor(address _target) {
        target = _target;
    }

    function addr(bytes32) external view returns (address) {
        return target;
    }
}
