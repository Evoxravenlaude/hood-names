// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {PaymentAcceptor} from "./PaymentAcceptor.sol";
import {IHoodPriceOracle} from "./IHoodPriceOracle.sol";
import {HoodPointsLedger} from "./HoodPointsLedger.sol";

/// @title HoodGiftCard
/// @notice Transferable ERC-1155 gift cards with a fixed USD face value.
///         A card is bought at face value (in ETH or an accepted stablecoin),
///         can be sent to anyone, and is redeemed into points that pay for
///         registrations and renewals.
///
/// Based on SPACE ID's SidGiftCardVoucher, SidGiftCardRegistrar and
/// SidGiftCardController, merged into one contract.
contract HoodGiftCard is ERC1155, PaymentAcceptor, ReentrancyGuard {
    using SafeERC20 for IERC20;

    string public constant name = "Hood Names Gift Card";
    string public constant symbol = "HOODGIFT";

    IHoodPriceOracle public prices;
    HoodPointsLedger public immutable ledger;
    bool public fallbackSalesAllowed;

    /// @notice Face value in USD (18 decimals) per card id. Set once.
    mapping(uint256 => uint256) public faceValue;

    error UnknownCard(uint256 id);
    error CardAlreadyDefined(uint256 id);
    error InvalidFaceValue();
    error LengthMismatch();
    error InsufficientValue();
    error MaxAmountExceeded(uint256 due, uint256 maxAmount);
    error NoLiveRate();

    event CardDefined(uint256 indexed id, uint256 faceValueUSD);
    event CardsPurchased(
        address indexed buyer,
        address indexed to,
        address indexed token,
        uint256 usdValue,
        uint256 amountPaid
    );
    event CardsRedeemed(address indexed account, uint256 usdValue);
    event PriceOracleChanged(address prices);

    constructor(
        string memory uri_,
        IHoodPriceOracle _prices,
        HoodPointsLedger _ledger
    ) ERC1155(uri_) {
        prices = _prices;
        ledger = _ledger;
    }

    /* Admin */

    /// @notice Defines a card denomination. Face values cannot be changed later,
    ///         so a card always redeems for what was paid for it.
    function defineCard(uint256 id, uint256 faceValueUSD) external onlyOwner {
        if (faceValueUSD == 0) revert InvalidFaceValue();
        if (faceValue[id] != 0) revert CardAlreadyDefined(id);
        faceValue[id] = faceValueUSD;
        emit CardDefined(id, faceValueUSD);
    }

    /// @notice Allows ETH sales while the oracle is on its fixed fallback
    ///         rate. For test networks.
    function setFallbackSalesAllowed(bool allowed) external onlyOwner {
        fallbackSalesAllowed = allowed;
    }

    function setURI(string calldata uri_) external onlyOwner {
        _setURI(uri_);
    }

    function setPriceOracle(IHoodPriceOracle _prices) external onlyOwner {
        prices = _prices;
        emit PriceOracleChanged(address(_prices));
    }

    /// @notice Mints cards without payment, for promotions and campaigns.
    function mintPromo(
        address to,
        uint256[] calldata ids,
        uint256[] calldata amounts
    ) external onlyOwner {
        totalValue(ids, amounts);
        _mintBatch(to, ids, amounts, "");
    }

    /* Purchase and redemption */

    /// @notice Total USD face value (18 decimals) of a set of cards.
    function totalValue(
        uint256[] calldata ids,
        uint256[] calldata amounts
    ) public view returns (uint256 total) {
        if (ids.length != amounts.length) revert LengthMismatch();
        for (uint256 i = 0; i < ids.length; i++) {
            uint256 value = faceValue[ids[i]];
            if (value == 0) revert UnknownCard(ids[i]);
            total += value * amounts[i];
        }
    }

    /// @notice Price of a set of cards in wei.
    function priceInETH(
        uint256[] calldata ids,
        uint256[] calldata amounts
    ) external view returns (uint256) {
        return prices.usdToWei(totalValue(ids, amounts));
    }

    /// @notice Price of a set of cards in an accepted token.
    function priceInToken(
        address token,
        uint256[] calldata ids,
        uint256[] calldata amounts
    ) external view returns (uint256) {
        return _usdToToken(token, totalValue(ids, amounts));
    }

    /// @notice Buys cards with ETH. Any excess ETH is refunded.
    function buy(
        address to,
        uint256[] calldata ids,
        uint256[] calldata amounts
    ) external payable nonReentrant whenNotPaused {
        // A card is a claim in dollars that never expires. Selling one for
        // ETH at a fixed, possibly outdated rate would let a buyer bank the
        // difference, so ETH sales need a live feed unless explicitly allowed.
        if (!fallbackSalesAllowed && !prices.usingFeed()) revert NoLiveRate();
        uint256 usd = totalValue(ids, amounts);
        uint256 due = prices.usdToWei(usd);
        if (msg.value < due) revert InsufficientValue();

        _mintBatch(to, ids, amounts, "");
        emit CardsPurchased(msg.sender, to, address(0), usd, due);

        _sendETH(msg.sender, msg.value - due);
    }

    /// @notice Buys cards with an accepted stablecoin.
    function buyWithToken(
        address token,
        uint256 maxAmount,
        address to,
        uint256[] calldata ids,
        uint256[] calldata amounts
    ) external nonReentrant whenNotPaused {
        uint256 usd = totalValue(ids, amounts);
        uint256 due = _usdToToken(token, usd);
        if (due > maxAmount) revert MaxAmountExceeded(due, maxAmount);

        IERC20(token).safeTransferFrom(msg.sender, address(this), due);
        _mintBatch(to, ids, amounts, "");
        emit CardsPurchased(msg.sender, to, token, usd, due);
    }

    /// @notice Burns the caller's cards and credits their face value as points.
    function redeem(
        uint256[] calldata ids,
        uint256[] calldata amounts
    ) external nonReentrant {
        uint256 usd = totalValue(ids, amounts);
        _burnBatch(msg.sender, ids, amounts);
        ledger.credit(msg.sender, usd);
        emit CardsRedeemed(msg.sender, usd);
    }
}
