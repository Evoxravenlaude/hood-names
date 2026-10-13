// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {BaseTest} from "./Base.t.sol";
import {IHoodRegistrarController} from "../contracts/hood/IHoodRegistrarController.sol";

/// What happens to a name's records when it changes hands through expiry.
/// In stock ENS the previous owner's records survive re-registration, so a
/// name bought after expiry can keep paying its old owner.
contract LifecycleTest is BaseTest {
    function setUp() public override {
        super.setUp();
        _registerETH(alice, "alice", bytes32(0), 1 ether);
        vm.prank(alice);
        d.resolver.setText(_node("alice"), "url", "https://alice.example");
        vm.warp(d.base.nameExpires(_id("alice")) + 90 days + 22 days);
    }

    function test_ReRegistrationWithSameResolverClearsOldRecords() public {
        IHoodRegistrarController.Registration memory r = _registration(
            "alice",
            bob,
            bytes32(0)
        );
        r.data = new bytes[](0); // Bob sets no records of his own.
        r.reverseRecord = 0;
        _commit(bob, r);
        vm.prank(bob);
        d.controller.register{value: 1 ether}(r);

        assertEq(d.resolver.addr(_node("alice")), address(0), "old address gone");
        assertEq(d.resolver.text(_node("alice"), "url"), "", "old text gone");
    }

    function test_ReRegistrationWithoutResolverDropsOldResolver() public {
        IHoodRegistrarController.Registration memory r = _registration(
            "alice",
            bob,
            bytes32(0)
        );
        r.resolver = address(0);
        r.data = new bytes[](0);
        r.reverseRecord = 0;
        _commit(bob, r);
        vm.prank(bob);
        d.controller.register{value: 1 ether}(r);

        assertEq(d.registry.owner(_node("alice")), bob);
        assertEq(
            d.registry.resolver(_node("alice")),
            address(0),
            "no longer points at the previous owner's resolver"
        );
    }

    function test_OldRecordsDoNotReappearIfResolverIsSetLater() public {
        IHoodRegistrarController.Registration memory r = _registration(
            "alice",
            bob,
            bytes32(0)
        );
        r.resolver = address(0);
        r.data = new bytes[](0);
        r.reverseRecord = 0;
        _commit(bob, r);
        vm.prank(bob);
        d.controller.register{value: 1 ether}(r);

        // Bob later points the name back at the same public resolver.
        vm.prank(bob);
        d.registry.setResolver(_node("alice"), address(d.resolver));
        assertEq(d.resolver.addr(_node("alice")), address(0));
        assertEq(d.resolver.text(_node("alice"), "url"), "");
    }

    function test_NewOwnersRecordsApplyAfterReRegistration() public {
        _registerETH(bob, "alice", bytes32(0), 1 ether);
        assertEq(d.resolver.addr(_node("alice")), bob);
        assertEq(d.resolver.text(_node("alice"), "url"), "");
    }

    function test_OldOwnersPrimaryNameStopsVerifying() public {
        _registerETH(bob, "alice", bytes32(0), 1 ether);
        // Alice's reverse record still says alice.hood, but the name now
        // resolves to Bob, so a verified reverse lookup must not return it.
        try d.universalResolver.reverse(abi.encodePacked(alice), 60) returns (
            string memory primary,
            address,
            address
        ) {
            assertEq(primary, "", "stale primary name must not verify");
        } catch {}
    }

    function test_OldOwnerParkingResolverBeforeLapseDoesNotHelp() public {
        // Rewind: alice still owns the name. She unsets the resolver, then
        // lets it lapse. The new owner later points at the public resolver.
        vm.warp(block.timestamp - 90 days - 22 days - 1 days);
        vm.prank(alice);
        d.registry.setResolver(_node("alice"), address(0));
        vm.warp(d.base.nameExpires(_id("alice")) + 90 days + 22 days);

        IHoodRegistrarController.Registration memory r = _registration(
            "alice",
            bob,
            bytes32(0)
        );
        r.resolver = address(0);
        r.data = new bytes[](0);
        r.reverseRecord = 0;
        _commit(bob, r);
        vm.prank(bob);
        d.controller.register{value: 1 ether}(r);
        vm.prank(bob);
        d.registry.setResolver(_node("alice"), address(d.resolver));

        assertEq(d.resolver.addr(_node("alice")), address(0));
        assertEq(d.resolver.text(_node("alice"), "url"), "");
    }

    function test_FirstRegistrationIsUnaffected() public {
        _registerETH(bob, "bobby", bytes32(0), 1 ether);
        assertEq(d.resolver.addr(_node("bobby")), bob);
    }
}
