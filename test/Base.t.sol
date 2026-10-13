// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {Test} from "forge-std/Test.sol";
import {HoodDeployer} from "../script/HoodDeployer.sol";
import {IHoodRegistrarController} from "../contracts/hood/IHoodRegistrarController.sol";
import {HoodReferralHub} from "../contracts/hood/HoodReferralHub.sol";
import {MockStablecoin} from "./Mocks.sol";

abstract contract BaseTest is Test, HoodDeployer {
    uint256 internal constant YEAR = 365 days;

    Deployment internal d;
    MockStablecoin internal usdg;

    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");

    Config internal config;

    receive() external payable {}

    /// Hook for suites that need a different deployment.
    function _configure(Config memory c) internal virtual {}

    function setUp() public virtual {
        vm.warp(1_760_000_000);
        usdg = new MockStablecoin();

        Config memory c = _defaultConfig();
        c.stablecoin = address(usdg);
        c.enableReferrals = true;
        c.enableGiftCards = true;
        c.giftCardFallbackSales = true;
        _configure(c);
        d = _deployAll(address(this), c, _defaultTiers());
        d.controller.unpause(); // deployments start closed
        config = c;

        d.giftCard.defineCard(1, 5e18);
        d.giftCard.defineCard(2, 100e18);

        for (uint256 i = 0; i < 3; i++) {
            address who = [alice, bob, carol][i];
            vm.deal(who, 1000 ether);
            usdg.mint(who, 1_000_000e6);
            vm.startPrank(who);
            usdg.approve(address(d.controller), type(uint256).max);
            usdg.approve(address(d.giftCard), type(uint256).max);
            vm.stopPrank();
        }
    }

    function _node(string memory label) internal view returns (bytes32) {
        return keccak256(abi.encodePacked(d.parentNode, keccak256(bytes(label))));
    }

    function _id(string memory label) internal pure returns (uint256) {
        return uint256(keccak256(bytes(label)));
    }

    function _ref(string memory label) internal pure returns (bytes32) {
        return keccak256(bytes(label));
    }

    /// A registration with the public resolver, an address record and a primary name.
    function _registration(
        string memory label,
        address owner,
        bytes32 referrer
    ) internal view returns (IHoodRegistrarController.Registration memory r) {
        bytes[] memory data = new bytes[](1);
        data[0] = abi.encodeWithSignature(
            "setAddr(bytes32,address)",
            _node(label),
            owner
        );
        r = IHoodRegistrarController.Registration({
            label: label,
            owner: owner,
            duration: YEAR,
            secret: keccak256("secret"),
            resolver: address(d.resolver),
            data: data,
            reverseRecord: 1,
            referrer: referrer
        });
    }

    function _commit(
        address who,
        IHoodRegistrarController.Registration memory r
    ) internal {
        vm.prank(who);
        d.controller.commit(d.controller.makeCommitment(r));
        skip(61);
    }

    /// The owner of a name vouches for a subname so that it resolves.
    function _approveSub(address who, bytes32 subnode) internal {
        bytes32[] memory subs = new bytes32[](1);
        subs[0] = subnode;
        vm.prank(who);
        d.policy.approveSubnames(subs, true);
    }

    function _priceWei(string memory label) internal view returns (uint256) {
        return d.controller.rentPrice(label, YEAR).base;
    }

    /// Commits and registers with ETH, sending exactly `value`.
    function _registerETH(
        address who,
        string memory label,
        bytes32 referrer,
        uint256 value
    ) internal {
        IHoodRegistrarController.Registration memory r = _registration(
            label,
            who,
            referrer
        );
        _commit(who, r);
        vm.prank(who);
        d.controller.register{value: value}(r);
    }
}
