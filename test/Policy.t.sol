// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {HoodNameGuard} from "../contracts/hood/HoodNameGuard.sol";
import {BaseTest} from "./Base.t.sol";
import {IHoodRegistrarController} from "../contracts/hood/IHoodRegistrarController.sol";
import {HoodRegistrarController, ISanctionsList} from "../contracts/hood/HoodRegistrarController.sol";
import {ERC721HolderDiscountValidator} from "../contracts/hood/DiscountValidators.sol";
import {HoodNameLens} from "../contracts/hood/HoodNameLens.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {MockSanctionsList, MockPass} from "./Mocks.sol";
import {SellerResolver} from "./UnsexyFixes.t.sol";
import {ReservedLists} from "../script/ReserveNames.s.sol";

/// Reserved names, verified-account discounts, sanctions screening and the
/// wallet-safety lens.
contract PolicyTest is BaseTest, ReservedLists {
    uint256 internal signerKey = 0xA11CE5;
    IHoodRegistrarController.Payment internal ETH_PAYMENT =
        IHoodRegistrarController.Payment(address(0), false, 0);

    function _configure(Config memory c) internal view override {
        c.discountSigner = vm.addr(signerKey);
    }

    function _labels(string memory a, string memory b) internal pure returns (string[] memory l) {
        l = new string[](2);
        l[0] = a;
        l[1] = b;
    }

    /// A signed attestation that `accountId` may register exactly `r`.
    function _attestation(
        IHoodRegistrarController.Registration memory r,
        bytes32 accountId,
        uint256 validUntil,
        uint256 key
    ) internal view returns (bytes memory) {
        bytes32 commitment = d.controller.makeCommitment(r);
        (uint8 v, bytes32 rr, bytes32 ss) = vm.sign(
            key,
            d.verifiedValidator.digest(
                r.owner,
                commitment,
                VERIFIED_DISCOUNT,
                accountId,
                validUntil
            )
        );
        return abi.encode(accountId, validUntil, abi.encodePacked(rr, ss, v));
    }

    function _proof(
        IHoodRegistrarController.Registration memory r,
        bytes32 accountId
    ) internal view returns (bytes memory) {
        return _attestation(r, accountId, block.timestamp + 1 hours, signerKey);
    }

    /* Reserved names */

    function test_ReservedNameCannotBeRegisteredByThePublic() public {
        d.guard.setReservedLabels(_labels("robinhood", "nvda"), true);
        assertFalse(d.controller.available("robinhood"));
        assertFalse(d.controller.available("nvda"));

        IHoodRegistrarController.Registration memory r = _registration("nvda", bob, bytes32(0));
        _commit(bob, r);
        vm.expectRevert(
            abi.encodeWithSelector(HoodNameGuard.NameReserved.selector, "nvda")
        );
        vm.prank(bob);
        d.controller.register{value: 1 ether}(r);
    }

    function test_OwnerIssuesAReservedNameToItsRightfulHolder() public {
        d.guard.setReservedLabels(_labels("robinhood", "nvda"), true);
        IHoodRegistrarController.Registration memory r = _registration("nvda", carol, bytes32(0));
        r.reverseRecord = 0;
        d.controller.registerReserved(r);

        assertEq(d.base.ownerOf(_id("nvda")), carol);
        assertEq(d.resolver.addr(_node("nvda")), carol);

        // Still protected if it ever lapses.
        vm.warp(d.base.nameExpires(_id("nvda")) + 90 days + 30 days);
        assertFalse(d.controller.available("nvda"));
    }

    function test_OnlyOwnerManagesReservedNames() public {
        IHoodRegistrarController.Registration memory r = _registration("nvda", bob, bytes32(0));
        r.reverseRecord = 0;
        string[] memory two = _labels("robinhood", "nvda");
        vm.startPrank(bob);
        vm.expectRevert("Ownable: caller is not the owner");
        d.guard.setReservedLabels(two, true);
        vm.expectRevert("Ownable: caller is not the owner");
        d.controller.registerReserved(r);
        vm.stopPrank();

        // And the owner cannot use the reserved path for ordinary names.
        vm.expectRevert(
            abi.encodeWithSelector(HoodNameGuard.NameNotReserved.selector, "nvda")
        );
        d.controller.registerReserved(r);
    }

    function test_ReleasedNameBecomesAvailable() public {
        d.guard.setReservedLabels(_labels("robinhood", "nvda"), true);
        d.guard.setReservedLabels(_labels("robinhood", "nvda"), false);
        assertTrue(d.controller.available("nvda"));
    }

    /* Verified-account discount */

    bytes32 internal constant BOB_ACCOUNT = keccak256("account:bob");

    function test_VerifiedAccountClaimsAFreeName() public {
        IHoodRegistrarController.Registration memory r = _registration("bobby", bob, bytes32(0));
        _commit(bob, r);
        uint256 before = bob.balance;
        bytes memory proof = _proof(r, BOB_ACCOUNT);
        vm.prank(bob);
        d.controller.registerWithDiscount(r, ETH_PAYMENT, VERIFIED_DISCOUNT, proof);
        assertEq(d.base.ownerOf(_id("bobby")), bob);
        assertEq(bob.balance, before, "free");
        assertTrue(d.controller.discountedRegistrants(bob));
        assertTrue(d.verifiedValidator.accountUsed(BOB_ACCOUNT));
    }

    function test_SponsorCanSubmitTheFreeNameForAVerifiedUser() public {
        // A relayer pays gas and submits; the attestation fixes the name and
        // the owner, so the relayer cannot change either.
        address relayer = makeAddr("relayer");
        IHoodRegistrarController.Registration memory r = _registration("bobby", bob, bytes32(0));
        r.reverseRecord = 0;
        _commit(relayer, r);
        bytes memory proof = _proof(r, BOB_ACCOUNT);
        vm.prank(relayer);
        d.controller.registerWithDiscount(r, ETH_PAYMENT, VERIFIED_DISCOUNT, proof);
        assertEq(d.base.ownerOf(_id("bobby")), bob);
        assertEq(d.resolver.addr(_node("bobby")), bob);
    }

    function test_AttestationCannotBeSpentOnADifferentName() public {
        // An attacker sees Bob's attestation for "bobby" and tries to burn
        // his one free name on a label Bob did not choose.
        IHoodRegistrarController.Registration memory wanted = _registration("bobby", bob, bytes32(0));
        bytes memory proof = _proof(wanted, BOB_ACCOUNT);

        IHoodRegistrarController.Registration memory junk = _registration("bob-is-a-scammer", bob, bytes32(0));
        junk.reverseRecord = 0;
        _commit(carol, junk);
        vm.expectRevert(
            abi.encodeWithSelector(HoodRegistrarController.InvalidDiscount.selector, VERIFIED_DISCOUNT)
        );
        vm.prank(carol);
        d.controller.registerWithDiscount(junk, ETH_PAYMENT, VERIFIED_DISCOUNT, proof);
        assertFalse(d.controller.discountedRegistrants(bob), "allowance intact");
    }

    function test_OneFreeNamePerAccountAcrossAddresses() public {
        test_VerifiedAccountClaimsAFreeName();
        // Same account, a second address.
        IHoodRegistrarController.Registration memory r = _registration("carol", carol, bytes32(0));
        _commit(carol, r);
        bytes memory proof = _proof(r, BOB_ACCOUNT);
        vm.expectRevert(
            abi.encodeWithSelector(HoodRegistrarController.InvalidDiscount.selector, VERIFIED_DISCOUNT)
        );
        vm.prank(carol);
        d.controller.registerWithDiscount(r, ETH_PAYMENT, VERIFIED_DISCOUNT, proof);
    }

    function test_OneDiscountedNamePerAddress() public {
        test_VerifiedAccountClaimsAFreeName();
        IHoodRegistrarController.Registration memory r = _registration("bobby2", bob, bytes32(0));
        _commit(bob, r);
        bytes memory proof = _proof(r, keccak256("account:other"));
        vm.expectRevert(
            abi.encodeWithSelector(HoodRegistrarController.DiscountAlreadyUsed.selector, bob)
        );
        vm.prank(bob);
        d.controller.registerWithDiscount(r, ETH_PAYMENT, VERIFIED_DISCOUNT, proof);
    }

    function test_RevertWhen_AttestationIsExpiredOrForged() public {
        IHoodRegistrarController.Registration memory r = _registration("bobby", bob, bytes32(0));
        _commit(bob, r);
        bytes memory expired = _attestation(r, BOB_ACCOUNT, block.timestamp - 1, signerKey);
        bytes memory forged = _attestation(r, BOB_ACCOUNT, block.timestamp + 1 hours, 0xBAD);

        bytes[2] memory proofs = [expired, forged];
        for (uint256 i = 0; i < 2; i++) {
            vm.expectRevert(
                abi.encodeWithSelector(
                    HoodRegistrarController.InvalidDiscount.selector,
                    VERIFIED_DISCOUNT
                )
            );
            vm.prank(bob);
            d.controller.registerWithDiscount(r, ETH_PAYMENT, VERIFIED_DISCOUNT, proofs[i]);
        }
        assertFalse(d.controller.discountedRegistrants(bob));
        assertFalse(d.verifiedValidator.accountUsed(BOB_ACCOUNT));
    }

    function test_ValidatorsOnlyAnswerTheController() public {
        vm.expectRevert();
        d.verifiedValidator.validateAndConsume(
            bob,
            bob,
            bytes32(0),
            VERIFIED_DISCOUNT,
            abi.encode(BOB_ACCOUNT, uint256(0), "")
        );
    }

    function test_DiscountDoesNotCoverShortNamesLongTermsOrThePremium() public {
        // Short, premium-priced names are excluded.
        IHoodRegistrarController.Registration memory r = _registration("bob", bob, bytes32(0));
        bytes memory proof = _proof(r, BOB_ACCOUNT);
        vm.expectRevert(
            abi.encodeWithSelector(HoodRegistrarController.InvalidDiscount.selector, VERIFIED_DISCOUNT)
        );
        vm.prank(bob);
        d.controller.registerWithDiscount(r, ETH_PAYMENT, VERIFIED_DISCOUNT, proof);

        // So are terms over a year.
        r = _registration("bobby", bob, bytes32(0));
        r.duration = 2 * YEAR;
        proof = _proof(r, BOB_ACCOUNT);
        vm.expectRevert(
            abi.encodeWithSelector(
                HoodRegistrarController.DiscountDurationTooLong.selector,
                2 * YEAR
            )
        );
        vm.prank(bob);
        d.controller.registerWithDiscount(r, ETH_PAYMENT, VERIFIED_DISCOUNT, proof);

        // A released name's premium is still charged in full.
        _registerETH(alice, "alice", bytes32(0), 1 ether);
        vm.warp(d.base.nameExpires(_id("alice")) + 90 days + 20 days);
        r = _registration("alice", bob, bytes32(0));
        _commit(bob, r);
        proof = _proof(r, BOB_ACCOUNT);
        uint256 before = bob.balance;
        vm.prank(bob);
        d.controller.registerWithDiscount{value: 100 ether}(r, ETH_PAYMENT, VERIFIED_DISCOUNT, proof);
        assertGt(before - bob.balance, 0, "premium paid");
    }

    function test_DiscountedRegistrationEarnsNoReferral() public {
        _registerETH(alice, "alice", bytes32(0), 1 ether);
        d.controller.setDiscount(VERIFIED_DISCOUNT, true, address(d.verifiedValidator), 5000, 5);

        IHoodRegistrarController.Registration memory r = _registration("bobby", bob, _ref("alice"));
        _commit(bob, r);
        bytes memory proof = _proof(r, BOB_ACCOUNT);
        uint256 price = _priceWei("bobby");
        uint256 before = bob.balance;
        vm.prank(bob);
        d.controller.registerWithDiscount{value: 1 ether}(r, ETH_PAYMENT, VERIFIED_DISCOUNT, proof);
        assertApproxEqAbs(before - bob.balance, price / 2, 1, "half price, no further discount");
        assertEq(d.hub.balances(alice, address(0)), 0);
    }

    /* Pass-holder discount */

    function _passSetup() internal returns (MockPass pass, bytes32 key) {
        pass = new MockPass();
        ERC721HolderDiscountValidator validator = new ERC721HolderDiscountValidator(
            address(d.controller),
            IERC721(address(pass))
        );
        key = keccak256("pass-holder");
        d.controller.setDiscount(key, true, address(validator), 10_000, 5);
    }

    function test_PassHolderGetsOneFreeNamePerPass() public {
        (MockPass pass, bytes32 key) = _passSetup();
        IHoodRegistrarController.Registration memory r = _registration("bobby", bob, bytes32(0));
        _commit(bob, r);

        // Not a holder yet.
        vm.expectRevert(
            abi.encodeWithSelector(HoodRegistrarController.InvalidDiscount.selector, key)
        );
        vm.prank(bob);
        d.controller.registerWithDiscount(r, ETH_PAYMENT, key, abi.encode(uint256(1)));

        pass.mint(bob, 1);
        vm.prank(bob);
        d.controller.registerWithDiscount(r, ETH_PAYMENT, key, abi.encode(uint256(1)));
        assertEq(d.base.ownerOf(_id("bobby")), bob);

        // Passing the same token to a fresh address does not buy another.
        pass.move(1, carol);
        r = _registration("carol", carol, bytes32(0));
        _commit(carol, r);
        vm.expectRevert(
            abi.encodeWithSelector(HoodRegistrarController.InvalidDiscount.selector, key)
        );
        vm.prank(carol);
        d.controller.registerWithDiscount(r, ETH_PAYMENT, key, abi.encode(uint256(1)));
    }

    function test_NobodyCanSpendAPassHoldersDiscountForThem() public {
        (MockPass pass, bytes32 key) = _passSetup();
        pass.mint(bob, 1);
        IHoodRegistrarController.Registration memory junk = _registration("junk-name-for-bob", bob, bytes32(0));
        junk.reverseRecord = 0;
        _commit(carol, junk);
        vm.expectRevert(
            abi.encodeWithSelector(HoodRegistrarController.InvalidDiscount.selector, key)
        );
        vm.prank(carol);
        d.controller.registerWithDiscount(junk, ETH_PAYMENT, key, abi.encode(uint256(1)));
        assertFalse(d.controller.discountedRegistrants(bob));
    }

    function test_InactiveOrMalformedDiscountIsRejected() public {
        vm.expectRevert(
            abi.encodeWithSelector(HoodRegistrarController.InvalidDiscount.selector, bytes32("x"))
        );
        d.controller.setDiscount(bytes32("x"), true, address(d.verifiedValidator), 10_001, 5);
        vm.expectRevert(
            abi.encodeWithSelector(HoodRegistrarController.InvalidDiscount.selector, bytes32("x"))
        );
        d.controller.setDiscount(bytes32("x"), true, address(d.verifiedValidator), 0, 5);

        d.controller.setDiscount(VERIFIED_DISCOUNT, false, address(d.verifiedValidator), 10_000, 5);
        IHoodRegistrarController.Registration memory r = _registration("bobby", bob, bytes32(0));
        bytes memory proof = _proof(r, BOB_ACCOUNT);
        vm.expectRevert(
            abi.encodeWithSelector(
                HoodRegistrarController.InvalidDiscount.selector,
                VERIFIED_DISCOUNT
            )
        );
        vm.prank(bob);
        d.controller.registerWithDiscount(r, ETH_PAYMENT, VERIFIED_DISCOUNT, proof);
    }

    /* Sanctions screening */

    function test_SanctionedOwnerOrPayerCannotRegister() public {
        MockSanctionsList list = new MockSanctionsList();
        d.controller.setSanctionsList(ISanctionsList(address(list)));

        list.set(bob, true);
        IHoodRegistrarController.Registration memory r = _registration("bobby", bob, bytes32(0));
        _commit(bob, r);
        vm.expectRevert(
            abi.encodeWithSelector(HoodRegistrarController.Sanctioned.selector, bob)
        );
        vm.prank(bob);
        d.controller.register{value: 1 ether}(r);

        // A sanctioned payer registering for someone else is blocked too.
        r = _registration("carol", carol, bytes32(0));
        r.reverseRecord = 0;
        _commit(bob, r);
        vm.expectRevert(
            abi.encodeWithSelector(HoodRegistrarController.Sanctioned.selector, bob)
        );
        vm.prank(bob);
        d.controller.register{value: 1 ether}(r);

        list.set(bob, false);
        vm.prank(bob);
        d.controller.register{value: 1 ether}(r);
        assertEq(d.base.ownerOf(_id("carol")), carol);
    }

    /* Lens */

    function test_LensReportsEveryState() public {
        d.guard.setReservedLabels(_labels("robinhood", "nvda"), true);
        assertEq(uint8(d.lens.status("fresh").state), uint8(HoodNameLens.State.Available));
        assertEq(uint8(d.lens.status("ab").state), uint8(HoodNameLens.State.Invalid));
        assertEq(uint8(d.lens.status("Alice").state), uint8(HoodNameLens.State.Invalid));
        assertEq(uint8(d.lens.status("nvda").state), uint8(HoodNameLens.State.Reserved));

        _registerETH(alice, "alice", bytes32(0), 1 ether);
        HoodNameLens.Status memory s = d.lens.status("alice");
        assertEq(uint8(s.state), uint8(HoodNameLens.State.Active));
        assertEq(s.holder, alice);
        assertEq(s.manager, alice);
        assertEq(s.resolvedAddress, alice);
        assertTrue(s.resolverAllowed);
        assertFalse(s.wrapped);
        assertEq(s.heldSince, block.timestamp);
        assertEq(s.node, _node("alice"));

        vm.warp(s.expires + 1);
        s = d.lens.status("alice");
        assertEq(uint8(s.state), uint8(HoodNameLens.State.Grace));
        assertEq(s.resolvedAddress, address(0), "nothing to send to");

        vm.warp(s.expires + 90 days + 1);
        assertEq(uint8(d.lens.status("alice").state), uint8(HoodNameLens.State.Available));
    }

    function test_LensShowsARecentChangeOfHands() public {
        _registerETH(alice, "alice", bytes32(0), 1 ether);
        uint256 registeredAt = block.timestamp;
        skip(30 days);
        assertEq(d.lens.status("alice").heldSince, registeredAt);

        vm.prank(alice);
        d.base.transferFrom(alice, bob, _id("alice"));
        HoodNameLens.Status memory s = d.lens.status("alice");
        assertEq(s.holder, bob);
        assertEq(s.heldSince, block.timestamp, "wallets can warn: just changed hands");
        assertEq(s.resolvedAddress, address(0));
    }

    function test_LensReportsWrappedHolderAndDisallowedResolver() public {
        _registerETH(alice, "alice", bytes32(0), 1 ether);
        SellerResolver custom = new SellerResolver(alice);
        vm.startPrank(alice);
        d.registry.setResolver(_node("alice"), address(custom));
        HoodNameLens.Status memory s = d.lens.status("alice");
        assertFalse(s.resolverAllowed);
        assertEq(s.resolvedAddress, address(0));

        // Once approved it is flagged as custom and its answer is left to
        // the universal resolver.
        d.policy.approveResolver(_node("alice"), address(custom));
        s = d.lens.status("alice");
        assertTrue(s.resolverAllowed);
        assertTrue(s.customResolver);
        assertEq(s.resolvedAddress, address(0));

        d.registry.setResolver(_node("alice"), address(d.resolver));
        d.base.safeTransferFrom(
            alice,
            address(d.wrapper),
            _id("alice"),
            abi.encode("alice", alice, uint16(0), address(d.resolver))
        );
        vm.stopPrank();
        s = d.lens.status("alice");
        assertTrue(s.wrapped);
        assertEq(s.holder, alice);
        assertEq(s.resolvedAddress, alice);
        assertEq(s.heldSince, 0, "not tracked for wrapped names: unknown, not long-held");
    }

    /* Seed lists */

    function test_ReservedListsApplyAndCoverLookalikes() public {
        string[6] memory files = _files();
        uint256 total;
        for (uint256 i = 0; i < files.length; i++) {
            string[] memory all = _readLabels(files[i]);
            assertGt(all.length, 10, files[i]);
            string[] memory labels = _registrable(d.guard, all);
            for (uint256 j = 0; j < labels.length; j += 40)
                d.guard.setReservedLabels(_slice(labels, j, 40), true);
            total += labels.length;
        }
        assertGt(total, 450, "brand, support, regulators, 194 tickers, issuers");

        assertFalse(d.controller.available("robinhood"));
        assertFalse(d.controller.available("support"));
        assertFalse(d.controller.available("sec"));
        // Official Stock Token tickers and issuers.
        assertFalse(d.controller.available("nvda"));
        assertFalse(d.controller.available("aapl"));
        assertFalse(d.controller.available("tsla"));
        assertFalse(d.controller.available("nvidia"));
        assertFalse(d.controller.available("apple"));
        // And what looks like them.
        assertTrue(d.guard.isReserved("r0binhood"));
        assertTrue(d.guard.isReserved(unicode"robínhood"));
        assertTrue(d.guard.isReserved("supp0rt"));
        assertTrue(d.guard.isReserved("app1e"));
        assertTrue(d.guard.isReserved(unicode"nvidiá"));
        assertTrue(d.controller.available("alice"));
    }
}
