// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {IPriceOracle} from "../ethregistrar/IPriceOracle.sol";

/// @notice Price oracle that quotes in USD and converts to ETH.
///         `price()` keeps the ENS IPriceOracle shape (values in wei).
interface IHoodPriceOracle is IPriceOracle {
    /// @notice Price in USD with 18 decimals.
    function priceUSD(
        string calldata name,
        uint256 expires,
        uint256 duration
    ) external view returns (uint256 base, uint256 premium);

    /// @notice Price in USD (18 decimals) for a name priced at `len` characters.
    function priceUSDForLength(
        uint256 len,
        uint256 expires,
        uint256 duration
    ) external view returns (uint256 base, uint256 premium);

    /// @notice The same, converted to wei.
    function priceForLength(
        uint256 len,
        uint256 expires,
        uint256 duration
    ) external view returns (IPriceOracle.Price memory);

    /// @notice True if the ETH/USD rate comes from a live feed, false if it is
    ///         the owner-set fallback.
    function usingFeed() external view returns (bool);

    /// @notice Converts a USD amount (18 decimals) to wei at the current ETH/USD rate.
    function usdToWei(uint256 usdAmount) external view returns (uint256);
}
