// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/// @title HoodReferralHub
/// @notice Tracks referrals and holds referral commissions until withdrawn.
///
/// A referrer is identified by the labelhash of their own name (the "alice"
/// in alice.hood). Each registration that names a referrer:
///  - pays the referrer a commission, and
///  - gives the buyer a discount.
/// Both rates rise with the referrer's lifetime referral count, in tiers.
/// Individual names can be given custom "partner" rates.
///
/// Based on SPACE ID's ReferralHub, with rates in basis points, commissions
/// held per payment currency, and a cap on the combined rate.
contract HoodReferralHub is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Upper bound on referrer rate + buyer discount (50%).
    uint256 public constant MAX_TOTAL_BPS = 5000;

    struct Tier {
        uint32 minReferrals;
        uint16 referrerBps;
        uint16 refereeBps;
    }

    struct PartnerRate {
        bool enabled;
        uint16 referrerBps;
        uint16 refereeBps;
    }

    /// @notice A referral only counts towards tiers if the buyer paid at
    ///         least this much, in USD (18 decimals). Makes it costly to
    ///         climb tiers with cheap throwaway registrations.
    uint256 public minCountedUSD;

    Tier[] public tiers;
    mapping(bytes32 => PartnerRate) public partnerRates;
    mapping(bytes32 => uint256) public referralCount;
    /// @notice Withdrawable commission per payee and currency (address(0) = ETH).
    mapping(address => mapping(address => uint256)) public balances;
    mapping(address => bool) public controllers;

    error NotController();
    error InvalidTiers();
    error RateTooHigh();
    error ValueMismatch();
    error NothingToWithdraw();
    error TransferFailed();

    event ControllerChanged(address indexed controller, bool enabled);
    event TiersChanged(Tier[] tiers);
    event PartnerRateChanged(
        bytes32 indexed referrer,
        bool enabled,
        uint16 referrerBps,
        uint16 refereeBps
    );
    event ReferralRecorded(
        bytes32 indexed referrer,
        address indexed payee,
        address indexed token,
        uint256 commission,
        uint256 newCount
    );
    event ReferrerReset(bytes32 indexed referrer);
    event MinCountedUSDChanged(uint256 minCountedUSD);
    event CommissionWithdrawn(
        address indexed payee,
        address indexed token,
        uint256 amount
    );

    constructor(Tier[] memory _tiers, uint256 _minCountedUSD) {
        _setTiers(_tiers);
        minCountedUSD = _minCountedUSD;
    }

    /* Admin */

    function setController(address controller, bool enabled) external onlyOwner {
        controllers[controller] = enabled;
        emit ControllerChanged(controller, enabled);
    }

    function setMinCountedUSD(uint256 _minCountedUSD) external onlyOwner {
        minCountedUSD = _minCountedUSD;
        emit MinCountedUSDChanged(_minCountedUSD);
    }

    /// @notice Replaces the tier table. The first tier must start at zero
    ///         referrals and thresholds must strictly increase.
    function setTiers(Tier[] calldata _tiers) external onlyOwner {
        _setTiers(_tiers);
    }

    function setPartnerRate(
        bytes32 referrer,
        bool enabled,
        uint16 referrerBps,
        uint16 refereeBps
    ) external onlyOwner {
        if (uint256(referrerBps) + refereeBps > MAX_TOTAL_BPS)
            revert RateTooHigh();
        partnerRates[referrer] = PartnerRate(enabled, referrerBps, refereeBps);
        emit PartnerRateChanged(referrer, enabled, referrerBps, refereeBps);
    }

    /* Views */

    function tierCount() external view returns (uint256) {
        return tiers.length;
    }

    /// @notice Current commission and buyer-discount rates for a referrer.
    function rates(
        bytes32 referrer
    ) public view returns (uint16 referrerBps, uint16 refereeBps) {
        PartnerRate memory partner = partnerRates[referrer];
        if (partner.enabled) return (partner.referrerBps, partner.refereeBps);

        uint256 count = referralCount[referrer];
        uint256 length = tiers.length;
        for (uint256 i = length; i > 0; i--) {
            Tier memory tier = tiers[i - 1];
            if (count >= tier.minReferrals)
                return (tier.referrerBps, tier.refereeBps);
        }
    }

    /* Controller entry point */

    /// @notice Records one referral and credits `commission` to `payee`.
    /// @param usdPaid What the buyer paid for the commissionable part of the
    ///        registration, in USD (18 decimals). Decides whether the
    ///        referral counts towards tiers.
    /// @dev For ETH the commission is sent with the call. For a token the
    ///      controller transfers it to this contract before calling.
    function record(
        bytes32 referrer,
        address payee,
        address token,
        uint256 commission,
        uint256 usdPaid
    ) external payable {
        if (!controllers[msg.sender]) revert NotController();
        if (token == address(0)) {
            if (msg.value != commission) revert ValueMismatch();
        } else if (msg.value != 0) {
            revert ValueMismatch();
        }

        uint256 newCount = referralCount[referrer];
        if (usdPaid >= minCountedUSD) {
            newCount += 1;
            referralCount[referrer] = newCount;
        }
        balances[payee][token] += commission;
        emit ReferralRecorded(referrer, payee, token, commission, newCount);
    }

    /// @notice Clears a label's referral history and partner rate. Called when
    ///         the label is registered afresh, so a new owner of an expired
    ///         name does not inherit the previous owner's tier.
    function resetReferrer(bytes32 referrer) external {
        if (!controllers[msg.sender]) revert NotController();
        if (referralCount[referrer] != 0 || partnerRates[referrer].enabled) {
            delete referralCount[referrer];
            delete partnerRates[referrer];
            emit ReferrerReset(referrer);
        }
    }

    /* Payee */

    /// @notice Withdraws the caller's commission in one currency (address(0) = ETH).
    function withdraw(address token) external {
        withdrawTo(token, msg.sender);
    }

    /// @notice Withdraws the caller's commission to another address, for
    ///         payees that cannot receive it themselves.
    function withdrawTo(address token, address to) public nonReentrant {
        uint256 amount = balances[msg.sender][token];
        if (amount == 0) revert NothingToWithdraw();
        balances[msg.sender][token] = 0;

        if (token == address(0)) {
            (bool ok, ) = payable(to).call{value: amount}("");
            if (!ok) revert TransferFailed();
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
        emit CommissionWithdrawn(msg.sender, token, amount);
    }

    /* Internal */

    function _setTiers(Tier[] memory _tiers) internal {
        if (_tiers.length == 0 || _tiers[0].minReferrals != 0)
            revert InvalidTiers();
        delete tiers;
        for (uint256 i = 0; i < _tiers.length; i++) {
            if (i > 0 && _tiers[i].minReferrals <= _tiers[i - 1].minReferrals)
                revert InvalidTiers();
            if (
                uint256(_tiers[i].referrerBps) + _tiers[i].refereeBps >
                MAX_TOTAL_BPS
            ) revert RateTooHigh();
            tiers.push(_tiers[i]);
        }
        emit TiersChanged(_tiers);
    }
}
