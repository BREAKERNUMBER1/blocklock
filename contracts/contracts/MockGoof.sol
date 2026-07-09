// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title MockGoof
/// @notice Sepolia testnet mock of the $GOOF ERC-20 token.
///         On mainnet, use the real contract: 0x84802079Fde7658F9D0969810693a2FA1870EEdF
contract MockGoof is ERC20, Ownable {
    constructor() ERC20("Mock GOOF Token", "GOOF") Ownable(msg.sender) {}

    /// @notice Mint test tokens to any address.
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    /// @notice Public mint for testing — 10 GOOF per call.
    function publicMint() external {
        _mint(msg.sender, 10 * 10 ** decimals());
    }
}
