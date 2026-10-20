// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {BaseTest} from "./Base.t.sol";
import {HoodNameRules} from "../contracts/hood/HoodNameRules.sol";
import {HoodNameGuard} from "../contracts/hood/HoodNameGuard.sol";
import {HoodNameRulesV1} from "./fixtures/HoodNameRulesV1.sol";

/// Alphabets added after launch: Georgian, Armenian and Ethiopic (any
/// rules version), and with version 2 the Indic scripts, Thai and Lao
/// (written with combining marks) and Arabic and Hebrew (right to left).
contract AlphabetsTest is BaseTest {
    struct Vector {
        bytes label;
        uint256 length;
        bool ok;
        uint256 priceLength;
        bytes skeleton;
    }

    function test_EveryAddedAlphabetCanBeUsed() public view {
        string[18] memory names = [
            unicode"नमस्ते", unicode"বাংলা", unicode"ਪੰਜਾਬ", unicode"ગુજરાત", unicode"ଓଡ଼ିଆ", unicode"தமிழ்",
            unicode"తెలుగు", unicode"ಕನ್ನಡ", unicode"മലയാളം", unicode"සිංහල", unicode"สวัสดี", unicode"ສະບາຍດີ",
            unicode"გამარჯობა", unicode"բարեւ", unicode"ሰላም", unicode"مرحبا", unicode"سلام", unicode"שלום"
        ];
        for (uint256 i = 0; i < names.length; i++) assertTrue(d.guard.valid(names[i]), names[i]);
    }

    function test_AddedAlphabetsAreNotMixed() public view {
        assertFalse(d.guard.valid(unicode"नमस्तेabc"));
        assertFalse(d.guard.valid(unicode"สวัสดีनमस"));
        assertFalse(d.guard.valid(unicode"მარjob"));
    }

    function test_RightToLeftNamesAreLettersOnly() public view {
        assertTrue(d.guard.valid(unicode"مرحبا"));
        assertFalse(d.guard.valid(unicode"مرحبا1"));
        assertFalse(d.guard.valid(unicode"1مرحبا"));
        assertFalse(d.guard.valid(unicode"مر-حبا"));
        assertFalse(d.guard.valid(unicode"שלום2"));
        // Left-to-right alphabets keep their digits.
        assertTrue(d.guard.valid(unicode"नमस्ते2"));
    }

    /// Marks typed out of canonical order, doubled, or with nothing to sit
    /// on draw like the proper spelling, so they are refused.
    function test_MarksOnlyInCanonicalOrder() public view {
        // Thai: sara uu (class 103) before mai ek (class 107) is canonical.
        assertTrue(d.guard.valid("\u0e1b\u0e39\u0e48"));
        assertFalse(d.guard.valid("\u0e1b\u0e48\u0e39"));
        assertTrue(d.guard.valid("\u0e01\u0e38\u0e49\u0e07"));
        assertFalse(d.guard.valid("\u0e01\u0e49\u0e38\u0e07"));
        // Devanagari: nukta (7) before virama (9).
        assertTrue(d.guard.valid("\u0915\u093c\u094d\u0937"));
        assertFalse(d.guard.valid("\u0915\u094d\u093c\u0937"));
        // Doubled mark, a mark first, a mark after a digit or hyphen.
        assertFalse(d.guard.valid(unicode"ก่่ก"));
        assertFalse(d.guard.valid(unicode"ाकक"));
        assertFalse(d.guard.valid(unicode"क1्क"));
        assertFalse(d.guard.valid(unicode"क-्क"));
    }

    /// A lookalike from another script does not make ordinary words cheaper.
    function test_WordsArePricedByTheirOwnScript() public view {
        (, , , uint256 a) = d.rules.check(unicode"वित्त");
        (, , , uint256 b) = d.rules.check(unicode"उत्तर");
        (, , , uint256 c) = d.rules.check(unicode"सप्ट");
        assertEq(a, 5);
        assertEq(b, 5);
        assertEq(c, 4);
    }

    function test_LettersThatAreExactLatinDoublesAreRefused() public view {
        // Armenian oh, ho and seh are drawn exactly as o, h and u.
        assertFalse(d.guard.valid(unicode"օօօ"));
        assertFalse(d.guard.valid(unicode"հօս"));
        // Arabic alef and heh pass for l and o.
        assertFalse(d.guard.valid(unicode"اها"));
    }

    /// The two spellings of the same look cannot both be registered, and the
    /// long spelling is priced like the short one.
    function test_TwoSpellingsOfOneLookCollide() public {
        address alice = makeAddr("alice");
        vm.deal(alice, 10 ether);
        string memory om = unicode"ओम्"; // independent vowel o
        string memory spelled = unicode"अोम्"; // a + vowel sign o: drawn the same
        (bool ok1, bytes32 s1, uint256 len1, uint256 price1) = d.rules.check(om);
        (bool ok2, bytes32 s2, uint256 len2, uint256 price2) = d.rules.check(spelled);
        assertTrue(ok1 && ok2);
        assertEq(s1, s2);
        assertEq(len1, 3);
        assertEq(len2, 4);
        assertEq(price1, 3);
        assertEq(price2, 3, "priced as the three-character name it looks like");

        _registerETH(alice, om, bytes32(0), _priceWei(om));
        assertFalse(d.guard.available(spelled));
        assertEq(d.guard.similarTo(spelled), _ref(om));

        // Thai sara ae, and two sara e.
        (, bytes32 t1, , uint256 tp1) = d.rules.check(unicode"แกก");
        (, bytes32 t2, , uint256 tp2) = d.rules.check(unicode"เเกก");
        assertEq(t1, t2);
        assertEq(tp1, tp2);
    }

    function test_ANameInAnAddedAlphabetRegistersAndResolves() public {
        address alice = makeAddr("alice");
        vm.deal(alice, 10 ether);
        string memory label = unicode"नमस्ते";
        _registerETH(alice, label, bytes32(0), _priceWei(label));
        assertEq(d.base.ownerOf(_id(label)), alice);
    }

    function test_CheckingAnAddedAlphabetStaysAffordable() public view {
        string memory long = unicode"अोअोअोअोअोअोअोअोअोअोअोअोअोअोअोअोअोअोअोअोअोअोअोअोअोअोअोअोअोअोअो";
        uint256 gasBefore = gasleft();
        (bool ok, , , uint256 priceLength) = d.rules.check(long);
        uint256 used = gasBefore - gasleft();
        assertTrue(ok);
        assertEq(priceLength, 31);
        assertLt(used, 1_500_000);
    }

    function test_PatternsAfterSealingMustStartWithAnExtensionCode() public {
        bytes[] memory p = new bytes[](1);
        p[0] = hex"6162"; // "ab": would reprice launch names
        vm.expectRevert(abi.encodeWithSelector(HoodNameRules.BadRecord.selector, 0));
        d.rules.addExtensionPatterns(p);
        p[0] = hex"c3a9c280"; // starts with U+00E9: in range, allowed
        d.rules.addExtensionPatterns(p);
        p[0] = hex"c680c280"; // U+0180: out of range
        vm.expectRevert(abi.encodeWithSelector(HoodNameRules.BadRecord.selector, 0));
        d.rules.addExtensionPatterns(p);
        p[0] = hex"c280e0a4"; // ends part-way through a character
        vm.expectRevert(abi.encodeWithSelector(HoodNameRules.BadRecord.selector, 0));
        d.rules.addExtensionPatterns(p);
        // At most eight pattern pages in all.
        p[0] = hex"c3a9c281";
        bool capped;
        for (uint256 k = 0; k < 20 && !capped; k++) {
            try d.rules.addExtensionPatterns(p) {} catch (bytes memory err) {
                assertEq(bytes4(err), HoodNameRules.TooManyPatternPages.selector);
                capped = true;
            }
        }
        assertTrue(capped);
        vm.expectRevert();
        d.rules.extensionPatternPages(8);
        vm.prank(makeAddr("stranger"));
        vm.expectRevert("Ownable: caller is not the owner");
        d.rules.addExtensionPatterns(p);
    }

    function test_ExtensionPatternsWaitForSealing() public {
        HoodNameRules fresh = new HoodNameRules(2);
        bytes[] memory p = new bytes[](1);
        p[0] = hex"c280c281";
        vm.expectRevert(HoodNameRules.NotSealed.selector);
        fresh.addExtensionPatterns(p);
    }

    function test_ApplyingExtensionsTwiceChangesNothing() public {
        (uint256 applied, uint256 skipped) = _applyNameExtensions(d.rules);
        assertEq(applied, 0);
        assertEq(skipped, 0);
    }

    /// The live testnet runs the launch version of the rules. The added
    /// alphabets apply to it unchanged, right-to-left ones are skipped, and
    /// every label reads exactly as it did before.
    function test_ExtendingTheLaunchContract() public {
        HoodNameRulesV1 v1 = _launchRules();
        HoodNameRules asRules = HoodNameRules(address(v1));
        assertEq(_rulesVersion(asRules), 1);
        assertFalse(_ok(v1, unicode"ሰላም"));

        uint256 gasBefore = gasleft();
        (uint256 applied, uint256 skipped) = _applyNameExtensions(asRules);
        uint256 used = gasBefore - gasleft();
        emit log_named_uint("gas to extend the launch contract", used);
        assertLt(used, 16_000_000);
        assertEq(applied, 1);
        assertEq(skipped, 2);
        assertTrue(_ok(v1, unicode"ሰላም"));
        assertTrue(_ok(v1, unicode"გამარჯობა"));
        assertTrue(_ok(v1, unicode"բարեւ"));
        assertFalse(_ok(v1, unicode"नमस्ते"), "marks wait for version 2");
        assertFalse(_ok(v1, unicode"مرحبا"), "right-to-left waits for version 2");

        // Every launch sample: same verdict and skeleton as at launch, unless
        // it uses an added alphabet.
        Vector[] memory before = abi.decode(
            vm.parseJson(vm.readFile("test/fixtures/launch-vectors.json"), ".vectors"),
            (Vector[])
        );
        uint256 nowAllowed;
        for (uint256 i = 0; i < before.length; i++) {
            (bool ok, bytes memory skel) = v1.skeleton(string(before[i].label));
            if (before[i].ok) {
                assertTrue(ok, string(before[i].label));
                assertEq(skel, before[i].skeleton, string(before[i].label));
            } else if (ok) {
                nowAllowed++;
            }
        }
        assertEq(nowAllowed, 0, "no refused launch sample becomes allowed on the launch contract");
    }

    /// A run that stopped part-way (page sent, groups not) is finished by
    /// running again, instead of failing on the page that is already there.
    function test_APartialRunIsFinishedByRunningAgain() public {
        HoodNameRulesV1 v1 = _launchRules();
        string memory meta = vm.readFile("nametables/ext-1/meta.json");
        v1.addPage(vm.parseBytes(vm.readFile(vm.parseJsonStringArray(meta, ".pageFiles")[0])));
        assertFalse(_ok(v1, unicode"ሰላም"));
        (uint256 applied, ) = _applyNameExtensions(HoodNameRules(address(v1)));
        assertEq(applied, 1);
        assertTrue(_ok(v1, unicode"ሰላም"));
        (uint256 pagesNow, , ) = v1.counts();
        (applied, ) = _applyNameExtensions(HoodNameRules(address(v1)));
        assertEq(applied, 0);
        (uint256 pagesAfter, , ) = v1.counts();
        assertEq(pagesAfter, pagesNow);
    }

    /// On version 2 the pricing patterns go first and are never sent twice.
    function test_PatternsAreSentOnceAndFirst() public {
        HoodNameRules fresh = _sealedV2();
        string memory meta = vm.readFile("nametables/ext-2/meta.json");
        // A run that sent only the patterns.
        fresh.addExtensionPatterns(vm.parseJsonBytesArray(meta, ".patterns"));
        _applyNameExtensions(fresh);
        assertEq(fresh.extensionPatternPages(0).code.length > 0, true);
        vm.expectRevert();
        fresh.extensionPatternPages(1);
        (, , , uint256 price) = fresh.check(unicode"अोम्");
        assertEq(price, 3);
    }

    function _sealedV2() private returns (HoodNameRules rules) {
        string memory meta = vm.readFile("nametables/meta.json");
        rules = new HoodNameRules(vm.parseJsonUint(meta, ".latinBit"));
        string[] memory files = vm.parseJsonStringArray(meta, ".pageFiles");
        for (uint256 i = 0; i < files.length; i++) rules.addPage(vm.parseBytes(vm.readFile(files[i])));
        uint256[] memory starts = vm.parseJsonUintArray(meta, ".rangeStarts");
        uint256[] memory ends = vm.parseJsonUintArray(meta, ".rangeEnds");
        uint256[] memory scripts = vm.parseJsonUintArray(meta, ".rangeScripts");
        HoodNameRules.Range[] memory ranges = new HoodNameRules.Range[](starts.length);
        for (uint256 i = 0; i < starts.length; i++) ranges[i] = HoodNameRules.Range(uint24(starts[i]), uint24(ends[i]), uint8(scripts[i]));
        rules.addRanges(ranges);
        rules.addGroups(vm.parseJsonUintArray(meta, ".groups"));
        rules.addPatterns(vm.parseJsonBytesArray(meta, ".patterns"));
        rules.seal();
    }

    function _ok(HoodNameRulesV1 r, string memory label) private view returns (bool ok) {
        (ok, , , ) = r.check(label);
    }

    /// The launch rules with the launch tables, sealed: what testnet runs.
    function _launchRules() private returns (HoodNameRulesV1 rules) {
        string memory meta = vm.readFile("nametables/meta.json");
        rules = new HoodNameRulesV1(vm.parseJsonUint(meta, ".latinBit"));
        string[] memory files = vm.parseJsonStringArray(meta, ".pageFiles");
        for (uint256 i = 0; i < files.length; i++) rules.addPage(vm.parseBytes(vm.readFile(files[i])));
        uint256[] memory starts = vm.parseJsonUintArray(meta, ".rangeStarts");
        uint256[] memory ends = vm.parseJsonUintArray(meta, ".rangeEnds");
        uint256[] memory scripts = vm.parseJsonUintArray(meta, ".rangeScripts");
        HoodNameRulesV1.Range[] memory ranges = new HoodNameRulesV1.Range[](starts.length);
        for (uint256 i = 0; i < starts.length; i++)
            ranges[i] = HoodNameRulesV1.Range(uint24(starts[i]), uint24(ends[i]), uint8(scripts[i]));
        rules.addRanges(ranges);
        rules.addGroups(vm.parseJsonUintArray(meta, ".groups"));
        rules.addPatterns(vm.parseJsonBytesArray(meta, ".patterns"));
        rules.seal();
    }
}
