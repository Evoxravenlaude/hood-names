// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title TestUSD
/// @notice A worthless dollar token for testnets only, so the stablecoin
///         payment path can be tried without the real one. Anyone can claim
///         1,000 once every six hours. Never deploy or list it on mainnet.
contract TestUSD is ERC20 {
    uint256 public constant CLAIM_AMOUNT = 1_000e6;
    uint256 public constant COOLDOWN = 6 hours;

    /// @notice When each address last claimed.
    mapping(address => uint256) public lastClaim;

    error NotOnMainnet();
    error TooSoon(uint256 nextClaimAt);

    event Claimed(address indexed account, uint256 amount);

    constructor() ERC20("Test USD (no value)", "tUSD") {
        if (block.chainid == 4663) revert NotOnMainnet();
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Sends 1,000 tUSD to the caller, at most once every six hours.
    function claim() external {
        uint256 next = nextClaimAt(msg.sender);
        if (block.timestamp < next) revert TooSoon(next);
        lastClaim[msg.sender] = block.timestamp;
        _mint(msg.sender, CLAIM_AMOUNT);
        emit Claimed(msg.sender, CLAIM_AMOUNT);
    }

    /// @notice The earliest time `account` can claim again; zero if now.
    function nextClaimAt(address account) public view returns (uint256) {
        uint256 last = lastClaim[account];
        return last == 0 ? 0 : last + COOLDOWN;
    }
}
