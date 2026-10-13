// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {BaseTest} from "./Base.t.sol";
import {IHoodRegistrarController} from "../contracts/hood/IHoodRegistrarController.sol";
import {HoodResolverPolicy} from "../contracts/hood/HoodResolverPolicy.sol";
import {SellerResolver} from "./UnsexyFixes.t.sol";

/// The same guarantees, checked along every NameWrapper path and for custom
/// resolvers. Regression tests for the second independent review.
contract WrapperPathsTest is BaseTest {
    bytes internal constant ALICE_DNS = hex"05616c69636504686f6f6400";
    SellerResolver internal custom;

    function setUp() public override {
        super.setUp();
        _registerETH(alice, "alice", bytes32(0), 1 ether);
        custom = new SellerResolver(alice);
    }

    function _wrap(address resolver) internal {
        vm.prank(alice);
        d.base.safeTransferFrom(
            alice,
            address(d.wrapper),
            _id("alice"),
            abi.encode("alice", alice, uint16(0), resolver)
        );
    }

    /// Address the universal resolver returns, or zero if it does not resolve.
    function _resolved() internal view returns (address) {
        try
            d.universalResolver.resolve(
                ALICE_DNS,
                abi.encodeWithSignature("addr(bytes32)", _node("alice"))
            )
        returns (bytes memory result, address) {
            return abi.decode(result, (address));
        } catch {
            return address(0);
        }
    }

    /* Renewal of wrapped names */

    function test_WrappedNameRenewedThroughControllerStaysAlive() public {
        _wrap(address(d.resolver));
        uint256 oldExpiry = d.base.nameExpires(_id("alice"));

        vm.prank(alice);
        d.controller.renew{value: 1 ether}("alice", 5 * YEAR, bytes32(0));
        assertEq(d.base.nameExpires(_id("alice")), oldExpiry + 5 * YEAR);
        (, , uint64 wrapperExpiry) = d.wrapper.getData(uint256(_node("alice")));
        assertEq(wrapperExpiry, oldExpiry + 5 * YEAR + 90 days, "wrapper in step");

        // Well past the original expiry and its grace period.
        vm.warp(oldExpiry + 200 days);
        assertEq(d.wrapper.ownerOf(uint256(_node("alice"))), alice);
        assertEq(_resolved(), alice, "still resolves");
        vm.prank(alice);
        d.resolver.setText(_node("alice"), "url", "https://alice.example");
        vm.prank(alice);
        d.wrapper.unwrapETH2LD(keccak256("alice"), alice, alice);
        assertEq(d.base.ownerOf(_id("alice")), alice);
    }

    function test_WrappedNameRenewedWithStablecoinAndByAStranger() public {
        _wrap(address(d.resolver));
        uint256 oldExpiry = d.base.nameExpires(_id("alice"));
        vm.prank(bob);
        d.controller.renewWithPayment(
            "alice",
            YEAR,
            bytes32(0),
            IHoodRegistrarController.Payment(address(usdg), false, 5e6)
        );
        (, , uint64 wrapperExpiry) = d.wrapper.getData(uint256(_node("alice")));
        assertEq(wrapperExpiry, oldExpiry + YEAR + 90 days);
    }

    /* Unwrapping to a buyer */

    function test_UnwrapToBuyerCannotLeaveSellerInControl() public {
        _wrap(address(d.resolver));
        // NFT to bob, but alice names herself as the registry controller.
        vm.prank(alice);
        d.wrapper.unwrapETH2LD(keccak256("alice"), bob, alice);

        assertEq(d.base.ownerOf(_id("alice")), bob);
        assertEq(d.registry.owner(_node("alice")), bob, "holder is in control");
        assertEq(_resolved(), address(0), "seller's records are gone");
        vm.expectRevert();
        vm.prank(alice);
        d.resolver.setAddr(_node("alice"), alice);
    }

    /* Custom resolvers */

    function test_OwnerCanUseACustomResolverAfterApprovingIt() public {
        vm.startPrank(alice);
        d.registry.setResolver(_node("alice"), address(custom));
        vm.stopPrank();
        assertEq(_resolved(), address(0), "not honoured until approved");

        vm.prank(alice);
        d.policy.approveResolver(_node("alice"), address(custom));
        assertEq(_resolved(), alice);
    }

    function test_OnlyTheOwnerCanApproveAResolver() public {
        vm.expectRevert(HoodResolverPolicy.NotNameOwner.selector);
        vm.prank(bob);
        d.policy.approveResolver(_node("alice"), address(custom));
    }

    function test_CustomResolverApprovalLapsesOnUnwrappedSale() public {
        vm.startPrank(alice);
        d.registry.setResolver(_node("alice"), address(custom));
        d.policy.approveResolver(_node("alice"), address(custom));
        assertEq(_resolved(), alice);
        d.base.transferFrom(alice, bob, _id("alice"));
        vm.stopPrank();
        assertEq(_resolved(), address(0));
    }

    function test_CustomResolverCannotFollowAWrappedSale() public {
        _wrap(address(custom));
        vm.prank(alice);
        d.policy.approveResolver(_node("alice"), address(custom));
        assertEq(_resolved(), alice, "works for the owner who approved it");

        vm.prank(alice);
        d.wrapper.safeTransferFrom(alice, bob, uint256(_node("alice")), 1, "");
        assertEq(_resolved(), address(0), "not for the buyer");

        // Nor after the buyer unwraps to themselves.
        vm.prank(bob);
        d.wrapper.unwrapETH2LD(keccak256("alice"), bob, bob);
        assertEq(d.registry.resolver(_node("alice")), address(custom));
        assertEq(_resolved(), address(0));
    }

    function test_CustomResolverCannotFollowWrapStraightToBuyer() public {
        vm.startPrank(alice);
        d.base.setApprovalForAll(address(d.wrapper), true);
        d.wrapper.wrapETH2LD("alice", bob, 0, address(custom));
        vm.stopPrank();
        assertEq(_resolved(), address(0));
    }

    function test_CustomResolverCannotFollowUnwrapToBuyer() public {
        _wrap(address(custom));
        vm.startPrank(alice);
        d.policy.approveResolver(_node("alice"), address(custom));
        d.wrapper.unwrapETH2LD(keccak256("alice"), bob, bob);
        vm.stopPrank();
        assertEq(_resolved(), address(0));
    }

    function test_BuyerCanReApproveTheSameResolverDeliberately() public {
        vm.startPrank(alice);
        d.registry.setResolver(_node("alice"), address(custom));
        d.policy.approveResolver(_node("alice"), address(custom));
        d.base.transferFrom(alice, bob, _id("alice"));
        vm.stopPrank();

        vm.startPrank(bob);
        d.registry.setResolver(_node("alice"), address(custom));
        d.policy.approveResolver(_node("alice"), address(custom));
        vm.stopPrank();
        assertEq(_resolved(), alice, "an informed choice by the new owner");
    }

    /* Manager and self-transfer */

    function test_SelfTransferChangesNothing() public {
        vm.startPrank(alice);
        d.registry.setTTL(_node("alice"), 300);
        d.base.transferFrom(alice, alice, _id("alice"));
        vm.stopPrank();
        assertEq(d.registry.ttl(_node("alice")), 300);
        assertEq(d.resolver.addr(_node("alice")), alice);
    }

    function test_ManagerKeepsItsOwnRecordsUntilTheNFTMoves() public {
        vm.prank(alice);
        d.base.reclaim(_id("alice"), carol); // carol manages, alice holds
        assertEq(d.resolver.addr(_node("alice")), address(0), "manager starts empty");
        vm.prank(carol);
        d.resolver.setAddr(_node("alice"), carol);
        assertEq(_resolved(), carol);

        vm.prank(alice);
        d.base.transferFrom(alice, bob, _id("alice"));
        assertEq(d.registry.owner(_node("alice")), bob);
        assertEq(_resolved(), address(0));
    }

    /* Re-registration back to a previous holder */

    function test_NameReRegisteredToAPreviousOwnerStartsClean() public {
        vm.prank(alice);
        d.resolver.setText(_node("alice"), "url", "https://alice.example");
        vm.warp(d.base.nameExpires(_id("alice")) + 90 days + 22 days);

        // Bob registers the lapsed name with alice as owner and his own address record.
        bytes[] memory data = new bytes[](1);
        data[0] = abi.encodeWithSignature(
            "setAddr(bytes32,address)",
            _node("alice"),
            bob
        );
        IHoodRegistrarController.Registration memory r = _registration(
            "alice",
            alice,
            bytes32(0)
        );
        r.data = data;
        r.reverseRecord = 0;
        _commit(bob, r);
        vm.prank(bob);
        d.controller.register{value: 1 ether}(r);

        assertEq(d.resolver.addr(_node("alice")), bob, "new record applies");
        assertEq(d.resolver.text(_node("alice"), "url"), "", "old ones do not mix in");
    }

    function test_ReferrerStopsEarningAtTheMomentOfExpiry() public {
        vm.warp(d.base.nameExpires(_id("alice")));
        assertEq(d.guard.referrerPayee(_ref("alice")), address(0));
    }
}
