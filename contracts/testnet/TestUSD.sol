// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title TestUSD
/// @notice A worthless dollar token for testnets only, so the stablecoin
///         payment path can be tried without the real one. Anyone can mint
///         up to 1,000 at a time. Never deploy or list it on mainnet.
contract TestUSD is ERC20 {
    uint256 public constant MAX_MINT = 1_000e6;

    error MintTooLarge();
    error NotOnMainnet();

    constructor() ERC20("Test USD (no value)", "tUSD") {
        if (block.chainid == 4663) revert NotOnMainnet();
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(uint256 amount) external {
        if (amount > MAX_MINT) revert MintTooLarge();
        _mint(msg.sender, amount);
    }
}
