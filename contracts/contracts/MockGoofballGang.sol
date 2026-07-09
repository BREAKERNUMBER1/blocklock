// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title MockGoofballGang
/// @notice Sepolia testnet mock of the Goofball Gang NFT collection.
///         On mainnet, use the real contract: 0xf1987f66553460a4f0730ce17484f5a9a2e883a6
contract MockGoofballGang is ERC721, Ownable {
    uint256 private _nextTokenId;

    constructor() ERC721("Mock Goofball Gang", "MGGANG") Ownable(msg.sender) {}

    /// @notice Mint a test NFT to any address. Only callable by owner during testing.
    function mint(address to) external onlyOwner returns (uint256) {
        uint256 tokenId = _nextTokenId++;
        _safeMint(to, tokenId);
        return tokenId;
    }

    /// @notice Public mint for testing convenience — remove in production deployments.
    function publicMint() external returns (uint256) {
        uint256 tokenId = _nextTokenId++;
        _safeMint(msg.sender, tokenId);
        return tokenId;
    }
}
