// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title PaymentAcceptor
/// @notice Shared payment plumbing: an owner-managed list of USD-pegged
///         tokens (for example USDG) accepted at 1 token = 1 USD, and
///         withdrawal of collected ETH and tokens to the owner.
///
/// Only list tokens that hold a 1:1 USD peg and have no transfer fee;
/// the contract does not price tokens through an oracle.
abstract contract PaymentAcceptor is Ownable2Step {
    using SafeERC20 for IERC20;

    struct TokenConfig {
        bool enabled;
        uint8 decimals;
    }

    mapping(address => TokenConfig) public paymentTokens;

    /// @notice When true, new sales are stopped. What exactly stops is
    ///         decided by the inheriting contract.
    bool public paused;
    /// @notice An address that may pause but not unpause, so an incident can
    ///         be contained quickly without the full owner multisig.
    address public guardian;

    error TokenNotAccepted(address token);
    error TransferFailed();
    error RenounceDisabled();
    error Paused();
    error NotOwnerOrGuardian();

    event PaymentTokenChanged(address indexed token, bool enabled);
    event Withdrawn(address indexed token, address indexed to, uint256 amount);
    event PausedChanged(bool paused, address indexed by);
    event GuardianChanged(address indexed guardian);

    modifier whenNotPaused() {
        if (paused) revert Paused();
        _;
    }

    function setGuardian(address _guardian) external onlyOwner {
        guardian = _guardian;
        emit GuardianChanged(_guardian);
    }

    /// @notice Stops new sales. Callable by the owner or the guardian.
    function pause() external {
        if (msg.sender != owner() && msg.sender != guardian)
            revert NotOwnerOrGuardian();
        paused = true;
        emit PausedChanged(true, msg.sender);
    }

    /// @notice Resumes sales. Owner only.
    function unpause() external onlyOwner {
        paused = false;
        emit PausedChanged(false, msg.sender);
    }

    function setPaymentToken(address token, bool enabled) external onlyOwner {
        paymentTokens[token] = TokenConfig({
            enabled: enabled,
            decimals: enabled ? IERC20Metadata(token).decimals() : 0
        });
        emit PaymentTokenChanged(token, enabled);
    }

    /// @dev Withdrawals go to owner(), so the contract must always have one.
    function renounceOwnership() public view override onlyOwner {
        revert RenounceDisabled();
    }

    /// @notice Sends all collected ETH to the owner.
    function withdraw() external {
        address to = owner();
        uint256 amount = address(this).balance;
        _sendETH(to, amount);
        emit Withdrawn(address(0), to, amount);
    }

    /// @notice Sends the full balance of `token` to the owner.
    function withdrawToken(address token) external {
        address to = owner();
        uint256 amount = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransfer(to, amount);
        emit Withdrawn(token, to, amount);
    }

    /// @dev USD (18 decimals) to token units, rounded up so dust is never free.
    function _usdToToken(
        address token,
        uint256 usdAmount
    ) internal view returns (uint256) {
        TokenConfig memory config = paymentTokens[token];
        if (!config.enabled) revert TokenNotAccepted(token);
        uint256 unit = 10 ** uint256(config.decimals);
        return (usdAmount * unit + 1e18 - 1) / 1e18;
    }

    function _sendETH(address to, uint256 amount) internal {
        if (amount == 0) return;
        (bool ok, ) = payable(to).call{value: amount}("");
        if (!ok) revert TransferFailed();
    }
}
