// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {BaseTest} from "./Base.t.sol";
import {HoodPriceOracle, IAggregatorV3} from "../contracts/hood/HoodPriceOracle.sol";
import {MockFeed} from "./Mocks.sol";

contract OracleTest is BaseTest {
    MockFeed internal feed;

    function setUp() public override {
        super.setUp();
        feed = new MockFeed();
    }

    function test_FallbackRateIsUsedWithoutAFeed() public view {
        (uint256 rate, uint256 unit) = d.oracle.ethUsd();
        assertEq(rate, 3000e8);
        assertEq(unit, 1e8);
        assertEq(d.oracle.usdToWei(3000e18), 1 ether);
    }

    function test_FeedRateIsUsedWhenSet() public {
        feed.set(2000e8, block.timestamp);
        d.oracle.setFeed(IAggregatorV3(address(feed)), 1 hours);
        assertEq(d.oracle.usdToWei(2000e18), 1 ether);
        assertApproxEqRel(_priceWei("alice"), uint256(5 ether) / 2000, 1e12);
    }

    function test_RevertWhen_FeedIsStale() public {
        feed.set(2000e8, block.timestamp - 2 hours);
        d.oracle.setFeed(IAggregatorV3(address(feed)), 1 hours);
        vm.expectRevert(
            abi.encodeWithSelector(
                HoodPriceOracle.StaleFeed.selector,
                block.timestamp - 2 hours
            )
        );
        d.oracle.usdToWei(1e18);
    }

    function test_RevertWhen_FeedAnswerIsNotPositive() public {
        feed.set(0, block.timestamp);
        d.oracle.setFeed(IAggregatorV3(address(feed)), 1 hours);
        vm.expectRevert(HoodPriceOracle.InvalidRate.selector);
        d.oracle.usdToWei(1e18);
    }

    function test_OwnerCanRepricePerLength() public {
        uint256 perSecond = uint256(10e18) / YEAR;
        d.oracle.setRentPrices(
            [perSecond * 100, perSecond * 100, perSecond * 50, perSecond * 10, perSecond]
        );
        (uint256 five, ) = d.oracle.priceUSD("alice", 0, YEAR);
        (uint256 three, ) = d.oracle.priceUSD("abc", 0, YEAR);
        assertApproxEqRel(five, 10e18, 1e12);
        assertApproxEqRel(three, 500e18, 1e12);
    }

    function test_RevertWhen_ShorterNamesWouldBeCheaper() public {
        vm.expectRevert(HoodPriceOracle.InvalidRentPrices.selector);
        d.oracle.setRentPrices([uint256(1), 1, 1, 1, 2]);
    }

    function test_RevertWhen_NoRateSourceWouldRemain() public {
        vm.expectRevert(HoodPriceOracle.InvalidRate.selector);
        d.oracle.setFallbackEthUsd(0);
    }

    function test_OnlyOwner() public {
        vm.startPrank(alice);
        vm.expectRevert("Ownable: caller is not the owner");
        d.oracle.setRentPrices([uint256(5), 4, 3, 2, 1]);
        vm.expectRevert("Ownable: caller is not the owner");
        d.oracle.setFallbackEthUsd(1e8);
        vm.stopPrank();
    }

    function test_NeverRegisteredNameHasNoPremium() public view {
        (, uint256 premium) = d.oracle.priceUSD("fresh", 0, YEAR);
        assertEq(premium, 0);
    }
}
