// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @title HoodPointsLedger
/// @notice Non-transferable USD-denominated credit (18 decimals) that can be
///         spent on registrations and renewals. Points are created when a
///         gift card is redeemed and are spent by registrar controllers.
///
/// Based on the points ledger in SPACE ID's gift-card contracts.
contract HoodPointsLedger is Ownable2Step {
    mapping(address => uint256) public balanceOf;
    /// @notice Contracts allowed to credit points (the gift card).
    mapping(address => bool) public minters;
    /// @notice Contracts allowed to spend points (registrar controllers).
    mapping(address => bool) public controllers;

    error NotMinter();
    error NotController();
    error InsufficientPoints(uint256 balance, uint256 needed);

    event MinterChanged(address indexed minter, bool enabled);
    event ControllerChanged(address indexed controller, bool enabled);
    event PointsCredited(address indexed account, uint256 amount);
    event PointsSpent(address indexed account, uint256 amount);

    function setMinter(address minter, bool enabled) external onlyOwner {
        minters[minter] = enabled;
        emit MinterChanged(minter, enabled);
    }

    function setController(address controller, bool enabled) external onlyOwner {
        controllers[controller] = enabled;
        emit ControllerChanged(controller, enabled);
    }

    function credit(address account, uint256 amount) external {
        if (!minters[msg.sender]) revert NotMinter();
        balanceOf[account] += amount;
        emit PointsCredited(account, amount);
    }

    function deduct(address account, uint256 amount) external {
        if (!controllers[msg.sender]) revert NotController();
        uint256 balance = balanceOf[account];
        if (balance < amount) revert InsufficientPoints(balance, amount);
        unchecked {
            balanceOf[account] = balance - amount;
        }
        emit PointsSpent(account, amount);
    }
}
