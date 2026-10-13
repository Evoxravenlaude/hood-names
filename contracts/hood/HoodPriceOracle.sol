// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {IPriceOracle} from "../ethregistrar/IPriceOracle.sol";
import {StringUtils} from "../utils/StringUtils.sol";
import {IHoodPriceOracle} from "./IHoodPriceOracle.sol";

interface IAggregatorV3 {
    function decimals() external view returns (uint8);

    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        );
}

/// @title HoodPriceOracle
/// @notice USD-denominated rent prices by label length, plus an exponentially
///         decaying premium on names that have just left their grace period.
///
/// Derived from ENS StablePriceOracle and ExponentialPremiumPriceOracle, with
/// three changes:
///  - rent prices can be updated by the owner instead of being fixed at deploy;
///  - the ETH/USD rate comes from a Chainlink-style feed with a staleness
///    check, or from an owner-set fallback rate when no feed is configured;
///  - prices are also exposed in USD so they can be paid in stablecoins.
contract HoodPriceOracle is IHoodPriceOracle, Ownable2Step {
    using StringUtils for *;

    uint256 public constant GRACE_PERIOD = 90 days;
    uint256 private constant PRECISION = 1e18;

    /// @notice Rent in attoUSD per second for labels of 1, 2, 3, 4 and 5+ characters.
    uint256[5] public rentPrices;

    /// @notice Chainlink-style ETH/USD feed. Zero means "use the fallback rate".
    IAggregatorV3 public usdFeed;
    /// @notice Maximum age of a feed answer, in seconds.
    uint256 public maxStaleness;
    /// @notice ETH/USD rate with 8 decimals, used only when no feed is set.
    uint256 public fallbackEthUsd;

    /// @notice Chainlink L2 sequencer uptime feed (answer 0 = up, 1 = down),
    ///         or zero if the chain has none. Checked only when `usdFeed` is used.
    IAggregatorV3 public sequencerFeed;
    /// @notice How long after the sequencer comes back before prices are trusted.
    uint256 public sequencerGracePeriod;

    uint256 public immutable startPremium;
    uint256 public immutable endValue;

    error InvalidRentPrices();
    error InvalidRate();
    error StaleFeed(uint256 updatedAt);
    error InvalidStaleness();
    error SequencerDown();
    error SequencerGracePeriodNotOver(uint256 upSince);

    event RentPricesChanged(uint256[5] prices);
    event FeedChanged(address feed, uint256 maxStaleness);
    event FallbackRateChanged(uint256 ethUsd);
    event SequencerFeedChanged(address feed, uint256 gracePeriod);

    /// @param _rentPrices attoUSD per second for 1, 2, 3, 4 and 5+ character labels.
    /// @param _usdFeed ETH/USD feed, or zero to use the fallback rate.
    /// @param _maxStaleness Maximum feed answer age in seconds.
    /// @param _fallbackEthUsd ETH/USD rate with 8 decimals for use without a feed.
    /// @param _startPremium Premium in attoUSD at the moment a name is released.
    /// @param _totalDays Days over which the premium halves daily down to zero.
    constructor(
        uint256[5] memory _rentPrices,
        IAggregatorV3 _usdFeed,
        uint256 _maxStaleness,
        uint256 _fallbackEthUsd,
        uint256 _startPremium,
        uint256 _totalDays
    ) {
        _setRentPrices(_rentPrices);
        if (address(_usdFeed) != address(0) && _maxStaleness == 0)
            revert InvalidStaleness();
        usdFeed = _usdFeed;
        maxStaleness = _maxStaleness;
        if (address(_usdFeed) == address(0) && _fallbackEthUsd == 0)
            revert InvalidRate();
        fallbackEthUsd = _fallbackEthUsd;
        startPremium = _startPremium;
        endValue = _startPremium >> _totalDays;
    }

    /* Admin */

    function setRentPrices(uint256[5] calldata _rentPrices) external onlyOwner {
        _setRentPrices(_rentPrices);
    }

    function setFeed(
        IAggregatorV3 _usdFeed,
        uint256 _maxStaleness
    ) external onlyOwner {
        if (address(_usdFeed) == address(0) && fallbackEthUsd == 0)
            revert InvalidRate();
        if (address(_usdFeed) != address(0) && _maxStaleness == 0)
            revert InvalidStaleness();
        usdFeed = _usdFeed;
        maxStaleness = _maxStaleness;
        emit FeedChanged(address(_usdFeed), _maxStaleness);
    }

    /// @notice Sets the sequencer uptime feed. While the sequencer is down, or
    ///         has only just come back, feed prices can be stale without
    ///         looking stale, so ETH-priced sales are refused.
    function setSequencerFeed(
        IAggregatorV3 _sequencerFeed,
        uint256 _gracePeriod
    ) external onlyOwner {
        sequencerFeed = _sequencerFeed;
        sequencerGracePeriod = _gracePeriod;
        emit SequencerFeedChanged(address(_sequencerFeed), _gracePeriod);
    }

    function setFallbackEthUsd(uint256 _fallbackEthUsd) external onlyOwner {
        if (address(usdFeed) == address(0) && _fallbackEthUsd == 0)
            revert InvalidRate();
        fallbackEthUsd = _fallbackEthUsd;
        emit FallbackRateChanged(_fallbackEthUsd);
    }

    /* Pricing */

    /// @inheritdoc IHoodPriceOracle
    function priceUSD(
        string calldata name,
        uint256 expires,
        uint256 duration
    ) public view override returns (uint256 base, uint256 premium) {
        return priceUSDForLength(name.strlen(), expires, duration);
    }

    /// @inheritdoc IHoodPriceOracle
    function priceUSDForLength(
        uint256 len,
        uint256 expires,
        uint256 duration
    ) public view override returns (uint256 base, uint256 premium) {
        uint256 perSecond = rentPrices[len >= 5 ? 4 : (len == 0 ? 0 : len - 1)];
        base = perSecond * duration;
        premium = _premium(expires);
    }

    /// @inheritdoc IHoodPriceOracle
    function priceForLength(
        uint256 len,
        uint256 expires,
        uint256 duration
    ) external view override returns (IPriceOracle.Price memory) {
        (uint256 base, uint256 premium_) = priceUSDForLength(len, expires, duration);
        return _toWei(base, premium_);
    }

    /// @inheritdoc IHoodPriceOracle
    function usingFeed() external view override returns (bool) {
        return address(usdFeed) != address(0);
    }

    /// @inheritdoc IPriceOracle
    function price(
        string calldata name,
        uint256 expires,
        uint256 duration
    ) external view override returns (IPriceOracle.Price memory) {
        (uint256 base, uint256 premium_) = priceUSD(name, expires, duration);
        return _toWei(base, premium_);
    }

    function _toWei(
        uint256 base,
        uint256 premium_
    ) internal view returns (IPriceOracle.Price memory) {
        (uint256 rate, uint256 unit) = _ethUsd();
        // Premium is total minus base, so base + premium always equals the
        // amount the controller charges for the sum.
        uint256 baseWei = (base * unit) / rate;
        uint256 totalWei = ((base + premium_) * unit) / rate;
        return IPriceOracle.Price({base: baseWei, premium: totalWei - baseWei});
    }

    /// @inheritdoc IHoodPriceOracle
    function usdToWei(uint256 usdAmount) public view override returns (uint256) {
        (uint256 rate, uint256 unit) = _ethUsd();
        return (usdAmount * unit) / rate;
    }

    /// @notice Current premium in attoUSD for a name with the given expiry.
    function premiumAt(uint256 expires) external view returns (uint256) {
        return _premium(expires);
    }

    /// @notice ETH/USD rate in use and the unit it is expressed in (10 ** decimals).
    function ethUsd() external view returns (uint256 rate, uint256 unit) {
        return _ethUsd();
    }

    function supportsInterface(bytes4 interfaceID) public pure returns (bool) {
        return
            interfaceID == type(IERC165).interfaceId ||
            interfaceID == type(IPriceOracle).interfaceId ||
            interfaceID == type(IHoodPriceOracle).interfaceId;
    }

    /* Internal */

    function _setRentPrices(uint256[5] memory _rentPrices) internal {
        // Shorter labels must never be cheaper than longer ones.
        for (uint256 i = 1; i < 5; i++) {
            if (_rentPrices[i] > _rentPrices[i - 1]) revert InvalidRentPrices();
        }
        if (_rentPrices[4] == 0) revert InvalidRentPrices();
        rentPrices = _rentPrices;
        emit RentPricesChanged(_rentPrices);
    }

    function _ethUsd() internal view returns (uint256 rate, uint256 unit) {
        IAggregatorV3 feed = usdFeed;
        if (address(feed) == address(0)) return (fallbackEthUsd, 1e8);

        IAggregatorV3 sequencer = sequencerFeed;
        if (address(sequencer) != address(0)) {
            (, int256 status, uint256 upSince, , ) = sequencer.latestRoundData();
            // A zero start time means the uptime feed has no round yet.
            if (status != 0 || upSince == 0) revert SequencerDown();
            if (block.timestamp <= upSince + sequencerGracePeriod)
                revert SequencerGracePeriodNotOver(upSince);
        }

        (, int256 answer, , uint256 updatedAt, ) = feed.latestRoundData();
        if (answer <= 0) revert InvalidRate();
        if (updatedAt > block.timestamp) revert InvalidRate();
        if (block.timestamp > updatedAt + maxStaleness)
            revert StaleFeed(updatedAt);
        return (uint256(answer), 10 ** uint256(feed.decimals()));
    }

    function _premium(uint256 expires) internal view returns (uint256) {
        // A name that was never registered has no premium.
        if (expires == 0) return 0;
        expires = expires + GRACE_PERIOD;
        if (expires > block.timestamp) return 0;

        uint256 elapsed = block.timestamp - expires;
        uint256 current = decayedPremium(startPremium, elapsed);
        if (current >= endValue) return current - endValue;
        return 0;
    }

    /// @notice Premium remaining after `elapsed` seconds, halving once per day.
    function decayedPremium(
        uint256 start,
        uint256 elapsed
    ) public pure returns (uint256) {
        uint256 daysPast = (elapsed * PRECISION) / 1 days;
        uint256 intDays = daysPast / PRECISION;
        if (intDays >= 256) return 0;
        uint256 result = start >> intDays;
        uint256 partDay = daysPast - intDays * PRECISION;
        uint256 fraction = (partDay * (2 ** 16)) / PRECISION;
        return _addFractionalPremium(fraction, result);
    }

    // 0.5 ^ (2^i / 65536) * 1e18 for i = 0..15, as in ENS.
    function _addFractionalPremium(
        uint256 fraction,
        uint256 result
    ) internal pure returns (uint256) {
        uint64[16] memory bits = [
            999989423469314432,
            999978847050491904,
            999957694548431104,
            999915390886613504,
            999830788931929088,
            999661606496243712,
            999323327502650752,
            998647112890970240,
            997296056085470080,
            994599423483633152,
            989228013193975424,
            978572062087700096,
            957603280698573696,
            917004043204671232,
            840896415253714560,
            707106781186547584
        ];
        for (uint256 i = 0; i < 16; i++) {
            if (fraction & (1 << i) != 0) {
                result = (result * bits[i]) / PRECISION;
            }
        }
        return result;
    }
}
