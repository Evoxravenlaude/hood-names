// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {IPriceOracle} from "../ethregistrar/IPriceOracle.sol";

interface IHoodRegistrarController {
    /// @dev Identical to the Registration struct of the ENS controller.
    ///      `referrer` is the labelhash of the referrer's own name, or zero.
    struct Registration {
        string label;
        address owner;
        uint256 duration;
        bytes32 secret;
        address resolver;
        bytes[] data;
        uint8 reverseRecord;
        bytes32 referrer;
    }

    /// @param token Payment currency: address(0) for ETH or an accepted stablecoin.
    /// @param usePoints Spend the caller's gift-card points before charging.
    /// @param maxTokenAmount Most the caller will pay in `token` (ignored for ETH,
    ///        where msg.value is the cap).
    struct Payment {
        address token;
        bool usePoints;
        uint256 maxTokenAmount;
    }

    /// @param usdBase Rent in USD (18 decimals).
    /// @param usdPremium Release premium in USD (18 decimals).
    /// @param pointsUsed Points that would be spent, in USD (18 decimals).
    /// @param referrerPayee Address credited with commission, or zero if the
    ///        referrer is not eligible.
    /// @param usdCommissionable Rent the buyer is paying after points, in USD
    ///        (18 decimals). Commission and discount are taken from this;
    ///        the release premium earns neither.
    /// @param referrerFee Commission, in the payment currency.
    /// @param refereeDiscount Buyer discount, in the payment currency.
    /// @param amountDue What the caller pays, in the payment currency.
    struct Quote {
        uint256 usdBase;
        uint256 usdPremium;
        uint256 pointsUsed;
        address referrerPayee;
        uint256 usdCommissionable;
        uint256 referrerFee;
        uint256 refereeDiscount;
        uint256 amountDue;
    }

    function rentPrice(
        string calldata label,
        uint256 duration
    ) external view returns (IPriceOracle.Price memory);

    function available(string calldata label) external view returns (bool);

    function makeCommitment(
        Registration calldata registration
    ) external pure returns (bytes32 commitment);

    function commit(bytes32 commitment) external;

    function register(Registration calldata registration) external payable;

    function registerWithPayment(
        Registration calldata registration,
        Payment calldata payment
    ) external payable;

    function renew(
        string calldata label,
        uint256 duration,
        bytes32 referrer
    ) external payable;

    function renewWithPayment(
        string calldata label,
        uint256 duration,
        bytes32 referrer,
        Payment calldata payment
    ) external payable;

    function quoteRegistration(
        string calldata label,
        address nameOwner,
        uint256 duration,
        bytes32 referrer,
        address payer,
        Payment calldata payment
    ) external view returns (Quote memory);

    function quoteRenewal(
        string calldata label,
        uint256 duration,
        address payer,
        Payment calldata payment
    ) external view returns (Quote memory);
}
