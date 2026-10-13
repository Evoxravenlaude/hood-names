// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {Test} from "forge-std/Test.sol";
import {TestUSD} from "../contracts/testnet/TestUSD.sol";

contract TestUSDTest is Test {
    TestUSD internal token;
    address internal alice = makeAddr("alice");

    function setUp() public {
        vm.warp(1_760_000_000);
        token = new TestUSD();
    }

    function test_ClaimOncePerSixHours() public {
        vm.prank(alice);
        token.claim();
        assertEq(token.balanceOf(alice), 1_000e6);
        assertEq(token.nextClaimAt(alice), block.timestamp + 6 hours);

        skip(6 hours - 1);
        vm.expectRevert(abi.encodeWithSelector(TestUSD.TooSoon.selector, token.nextClaimAt(alice)));
        vm.prank(alice);
        token.claim();

        skip(1);
        vm.prank(alice);
        token.claim();
        assertEq(token.balanceOf(alice), 2_000e6);
    }

    function test_CooldownIsPerAddress() public {
        vm.prank(alice);
        token.claim();
        vm.prank(makeAddr("bob"));
        token.claim();
        assertEq(token.totalSupply(), 2_000e6);
    }

    function test_RefusesMainnet() public {
        vm.chainId(4663);
        vm.expectRevert(TestUSD.NotOnMainnet.selector);
        new TestUSD();
    }
}
