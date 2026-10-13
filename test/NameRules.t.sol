// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {HoodNameGuard} from "../contracts/hood/HoodNameGuard.sol";
import {BaseTest} from "./Base.t.sol";
import {IHoodRegistrarController} from "../contracts/hood/IHoodRegistrarController.sol";
import {HoodRegistrarController} from "../contracts/hood/HoodRegistrarController.sol";
import {HoodNameRules} from "../contracts/hood/HoodNameRules.sol";
import {HoodNameLens} from "../contracts/hood/HoodNameLens.sol";

/// Names may use several alphabets, and no two live names may look alike.
contract NameRulesTest is BaseTest {
    // Field order is alphabetical, as the JSON decoder requires.
    struct Vector {
        bytes label;
        uint256 length;
        bool ok;
        uint256 priceLength;
        bytes skeleton;
    }

    /// The contract agrees with the generator's reference implementation on
    /// every sample: plain names, accents, digits-for-letters, six other
    /// scripts, mixed scripts, invisible characters, emoji, brand lookalikes.
    function test_ContractMatchesReferenceVectors() public view {
        Vector[] memory vectors = abi.decode(
            vm.parseJson(vm.readFile("nametables/vectors.json"), ".vectors"),
            (Vector[])
        );
        assertGt(vectors.length, 70);
        for (uint256 i = 0; i < vectors.length; i++) {
            string memory label = string(vectors[i].label);
            (bool ok, bytes memory skel) = d.rules.skeleton(label);
            assertEq(ok, vectors[i].ok, label);
            (bool ok2, bytes32 hash, uint256 length, uint256 priceLength) = d.rules
                .check(label);
            assertEq(ok2, ok);
            if (ok) {
                assertEq(skel, vectors[i].skeleton, label);
                assertEq(hash, keccak256(vectors[i].skeleton));
                assertEq(length, vectors[i].length, label);
                assertEq(priceLength, vectors[i].priceLength, label);
            }
        }
    }

    function _skel(string memory label) internal view returns (bytes memory skel) {
        bool ok;
        (ok, skel) = d.rules.skeleton(label);
        assertTrue(ok, label);
    }

    function _valid(string memory label) internal view returns (bool ok) {
        (ok, , , ) = d.rules.check(label);
    }

    function test_OtherAlphabetsAreAccepted() public view {
        assertTrue(_valid(unicode"привет"), "Cyrillic");
        assertTrue(_valid(unicode"ελλάδα"), "Greek");
        assertTrue(_valid(unicode"東京都"), "Han");
        assertTrue(_valid(unicode"こんにちは"), "Hiragana");
        assertTrue(_valid(unicode"東京タワー"), "Japanese: kanji with katakana");
        assertTrue(_valid(unicode"서울특별시"), "Hangul");
        assertTrue(_valid(unicode"señor"), "accented Latin");
    }

    function test_LookalikesShareASkeleton() public view {
        assertEq(_skel("g00gle"), _skel("google"), "zero for o");
        assertEq(_skel("paypa1"), _skel("paypal"), "one for l");
        assertEq(_skel(unicode"café"), _skel("cafe"), "accent");
        assertEq(_skel("modern"), _skel("modem"), "rn for m");
        assertEq(_skel("vvave"), _skel("wave"), "vv for w");
        assertEq(_skel(unicode"robínhood"), _skel("robinhood"));
        // Katakana that is drawn like a kanji.
        assertEq(_skel(unicode"カロエ"), _skel(unicode"力口工"));
        assertTrue(keccak256(_skel("alice")) != keccak256(_skel("alicia")));
    }

    function test_ImitationsOfLatinNamesInOtherAlphabetsAreRefused() public view {
        // All Cyrillic, but reads as "poe", "apple", "coco".
        assertFalse(_valid(unicode"рое"));
        assertFalse(_valid(unicode"аррӏе"));
        assertFalse(_valid(unicode"сосо"));
        // One Cyrillic letter slipped into a Latin name.
        assertFalse(_valid(unicode"rоbinhood"));
        assertFalse(_valid(unicode"nvdа"));
        // Mixed alphabets.
        assertFalse(_valid(unicode"αlice"));
        assertFalse(_valid(unicode"tokyo東京"));
    }

    function test_InvisibleAndDecomposedCharactersAreRefused() public view {
        assertFalse(_valid(string(hex"616c69e2808b6365")), "zero width space");
        assertFalse(_valid(string(hex"616c69e2808d6365")), "zero width joiner");
        assertFalse(_valid(string(hex"616c696365efbbbf")), "byte order mark");
        assertFalse(_valid(string(hex"65cc81636f6c65")), "e + combining accent");
        assertFalse(_valid(unicode"ａｌｉｃｅ"), "fullwidth");
        assertFalse(_valid(unicode"alice😀"), "emoji");
    }

    function _validBytes(bytes memory raw) internal view returns (bool) {
        return _valid(string(raw));
    }

    function test_MalformedUtf8IsRefused() public view {
        assertFalse(_validBytes(hex"616263ff"), "invalid byte");
        assertFalse(_validBytes(hex"6162c0af"), "overlong slash");
        assertFalse(_validBytes(hex"6162e0808a"), "overlong three-byte");
        assertFalse(_validBytes(hex"6162eda080"), "surrogate");
        assertFalse(_validBytes(hex"616263c3"), "truncated sequence");
        assertFalse(_validBytes(hex"616280"), "stray continuation byte");
        assertFalse(_validBytes(hex"6162f4908080"), "above U+10FFFF");
    }

    /* The registrar enforces one live name per skeleton */

    function test_LookalikeOfARegisteredNameCannotBeRegistered() public {
        _registerETH(alice, "google", bytes32(0), 1 ether);
        assertFalse(d.controller.available("g00gle"));
        assertFalse(d.controller.available(unicode"góogle"));
        assertEq(d.guard.similarTo("g00gle"), keccak256("google"));
        assertEq(
            uint8(d.lens.status("g00gle").state),
            uint8(HoodNameLens.State.Similar)
        );

        IHoodRegistrarController.Registration memory r = _registration("g00gle", bob, bytes32(0));
        _commit(bob, r);
        vm.expectRevert(
            abi.encodeWithSelector(
                HoodNameGuard.NameTooSimilar.selector,
                "g00gle",
                keccak256("google")
            )
        );
        vm.prank(bob);
        d.controller.register{value: 1 ether}(r);
    }

    function test_ItWorksInBothDirections() public {
        // Whoever registers first holds the look. The plain spelling gets no
        // special treatment: that is what "no lookalikes" means.
        _registerETH(bob, "paypa1", bytes32(0), 1 ether);
        assertFalse(d.controller.available("paypal"));
    }

    function test_HolderCanRenewAndReRegisterItsOwnName() public {
        _registerETH(alice, "google", bytes32(0), 1 ether);
        vm.prank(alice);
        d.controller.renew{value: 1 ether}("google", YEAR, bytes32(0));
        vm.warp(d.base.nameExpires(_id("google")) + 90 days + 22 days);
        _registerETH(alice, "google", bytes32(0), 1 ether);
        assertEq(d.base.ownerOf(_id("google")), alice);
    }

    function test_LookalikeBecomesAvailableOnlyAfterTheHolderIsReleased() public {
        _registerETH(alice, "google", bytes32(0), 1 ether);
        uint256 expires = d.base.nameExpires(_id("google"));

        vm.warp(expires + 1);
        assertFalse(d.controller.available("g00gle"), "holder is in its grace period");

        vm.warp(expires + 90 days + 22 days);
        assertTrue(d.controller.available("g00gle"));
        _registerETH(bob, "g00gle", bytes32(0), 1 ether);
        assertEq(d.guard.skeletonHolder(keccak256("google")), keccak256("g00gle"));

        // Now the original spelling is the lookalike.
        assertFalse(d.controller.available("google"));
        IHoodRegistrarController.Registration memory r = _registration("google", alice, bytes32(0));
        _commit(alice, r);
        vm.expectRevert();
        vm.prank(alice);
        d.controller.register{value: 1 ether}(r);
    }

    function test_ReservingANameReservesItsLookalikes() public {
        string[] memory labels = new string[](1);
        labels[0] = "robinhood";
        d.guard.setReservedLabels(labels, true);

        string[4] memory imitations = ["r0binhood", "robinh00d", unicode"robínhood", "robinhood"];
        for (uint256 i = 0; i < imitations.length; i++) {
            assertFalse(d.controller.available(imitations[i]), imitations[i]);
            assertTrue(d.guard.isReserved(imitations[i]), imitations[i]);
            IHoodRegistrarController.Registration memory r = _registration(imitations[i], bob, bytes32(0));
            _commit(bob, r);
            vm.expectRevert(
                abi.encodeWithSelector(
                    HoodNameGuard.NameReserved.selector,
                    imitations[i]
                )
            );
            vm.prank(bob);
            d.controller.register{value: 1 ether}(r);
        }
        // The Cyrillic-o imitation is not even a valid label.
        assertFalse(d.controller.valid(unicode"rоbinhood"));
    }

    function test_OwnerIssuesOnlyOneSpellingOfAReservedName() public {
        string[] memory labels = new string[](1);
        labels[0] = "robinhood";
        d.guard.setReservedLabels(labels, true);

        IHoodRegistrarController.Registration memory r = _registration("robinhood", carol, bytes32(0));
        r.reverseRecord = 0;
        d.controller.registerReserved(r);

        r = _registration("r0binhood", carol, bytes32(0));
        r.reverseRecord = 0;
        vm.expectRevert(
            abi.encodeWithSelector(
                HoodNameGuard.NameTooSimilar.selector,
                "r0binhood",
                keccak256("robinhood")
            )
        );
        d.controller.registerReserved(r);
    }

    function test_NonLatinNamesRegisterAndResolve() public {
        string memory label = unicode"東京タワー";
        _registerETH(alice, label, bytes32(0), 1 ether);
        assertEq(d.base.ownerOf(_id(label)), alice);
        assertEq(d.resolver.addr(_node(label)), alice);
        assertEq(
            d.resolver.name(d.reverseRegistrar.node(alice)),
            unicode"東京タワー.hood"
        );
        // Five characters, so it is priced as a five-character name.
        (uint256 usd, ) = d.oracle.priceUSD(label, 0, YEAR);
        assertApproxEqRel(usd, 5e18, 1e12);
        // Its katakana-for-kanji lookalike is taken with it.
        assertFalse(d.controller.available(unicode"東京夕ワー"));
    }

    function test_UppercaseIsNotStored() public {
        // Interfaces lowercase what the user types, as ENS interfaces do, so
        // "Alice" and "alice" are one name. The contract refuses the
        // uppercase form so that no second spelling can exist on-chain.
        assertFalse(d.controller.valid("Alice"));
        assertFalse(d.controller.valid("ALICE"));
        assertFalse(d.controller.valid(unicode"ПРИВЕТ"));
    }

    /* The table is append-only and owner-managed */

    function test_OnlyOwnerCanExtendTheTables() public {
        uint256[] memory masks = new uint256[](1);
        masks[0] = type(uint256).max;
        vm.expectRevert("Ownable: caller is not the owner");
        vm.prank(bob);
        d.rules.addGroups(masks);

        vm.expectRevert("Ownable: caller is not the owner");
        vm.prank(bob);
        d.rules.addPage(hex"00");

        vm.expectRevert(HoodNameRules.EmptyPage.selector);
        d.rules.addPage(hex"00");
        vm.expectRevert(HoodNameRules.EmptyPage.selector);
        d.rules.addPage(hex"0100006101016100000000000000");
    }

    function test_CheckingANameIsCheap() public view {
        uint256 gasBefore = gasleft();
        d.rules.check("alexander-the-great");
        uint256 used = gasBefore - gasleft();
        assertLt(used, 150_000);
    }
}
