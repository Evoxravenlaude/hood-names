// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {BaseTest} from "./Base.t.sol";

contract WrapperAndResolutionTest is BaseTest {
    // DNS wire format of "alice.hood" and "pay.alice.hood".
    bytes internal constant ALICE_DNS = hex"05616c69636504686f6f6400";
    bytes internal constant PAY_ALICE_DNS = hex"0370617905616c69636504686f6f6400";

    function setUp() public override {
        super.setUp();
        _registerETH(alice, "alice", bytes32(0), 1 ether);
    }

    function test_UniversalResolverForward() public view {
        (bytes memory result, address resolver) = d.universalResolver.resolve(
            ALICE_DNS,
            abi.encodeWithSignature("addr(bytes32)", _node("alice"))
        );
        assertEq(abi.decode(result, (address)), alice);
        assertEq(resolver, address(d.resolver));
    }

    function test_UniversalResolverReverse() public view {
        (string memory primary, address resolver, ) = d.universalResolver.reverse(
            abi.encodePacked(alice),
            60
        );
        assertEq(primary, "alice.hood");
        assertEq(resolver, address(d.resolver));
    }

    function test_WrapNameAndIssueSubname() public {
        // Wrap alice.hood by sending the NFT to the wrapper.
        vm.prank(alice);
        d.base.safeTransferFrom(
            alice,
            address(d.wrapper),
            _id("alice"),
            abi.encode("alice", alice, uint16(0), address(d.resolver))
        );
        assertEq(d.wrapper.ownerOf(uint256(_node("alice"))), alice);
        assertEq(d.base.ownerOf(_id("alice")), address(d.wrapper));
        assertEq(d.wrapper.names(_node("alice")), ALICE_DNS, "stored as .hood");

        // Issue pay.alice.hood to carol.
        vm.prank(alice);
        bytes32 sub = d.wrapper.setSubnodeRecord(
            _node("alice"),
            "pay",
            carol,
            address(d.resolver),
            0,
            0,
            0
        );
        assertEq(sub, keccak256(abi.encodePacked(_node("alice"), keccak256("pay"))));
        assertEq(d.wrapper.ownerOf(uint256(sub)), carol);

        // Carol controls its records.
        vm.prank(carol);
        d.resolver.setAddr(sub, carol);
        _approveSub(alice, sub);
        (bytes memory result, ) = d.universalResolver.resolve(
            PAY_ALICE_DNS,
            abi.encodeWithSignature("addr(bytes32)", sub)
        );
        assertEq(abi.decode(result, (address)), carol);

        // The parent's address record still resolves while wrapped.
        assertEq(d.resolver.addr(_node("alice")), alice);
    }

    function test_WrappedNameStillEarnsReferrals() public {
        vm.prank(alice);
        d.base.safeTransferFrom(
            alice,
            address(d.wrapper),
            _id("alice"),
            abi.encode("alice", alice, uint16(0), address(d.resolver))
        );
        _registerETH(bob, "bobby", _ref("alice"), 1 ether);
        assertGt(d.hub.balances(alice, address(0)), 0);
    }

    function test_UnwrapReturnsTheNFT() public {
        vm.startPrank(alice);
        d.base.safeTransferFrom(
            alice,
            address(d.wrapper),
            _id("alice"),
            abi.encode("alice", alice, uint16(0), address(d.resolver))
        );
        d.wrapper.unwrapETH2LD(keccak256("alice"), alice, alice);
        vm.stopPrank();
        assertEq(d.base.ownerOf(_id("alice")), alice);
    }

    function test_SubnameWithoutWrapper() public {
        vm.prank(alice);
        d.registry.setSubnodeRecord(
            _node("alice"),
            keccak256("vault"),
            bob,
            address(d.resolver),
            0
        );
        bytes32 sub = keccak256(
            abi.encodePacked(_node("alice"), keccak256("vault"))
        );
        assertEq(d.registry.owner(sub), bob);
    }

    function test_RegistrarIsLiveAndOwnsTheTLD() public view {
        assertEq(
            d.registry.owner(d.base.baseNode()),
            address(d.base),
            "base registrar owns .hood"
        );
        assertTrue(d.base.controllers(address(d.controller)));
        assertTrue(d.base.controllers(address(d.wrapper)));
        assertEq(d.registry.owner(bytes32(0)), address(this), "root owner");
    }
}
