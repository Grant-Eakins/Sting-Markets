// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MockUSDC
 * @notice Test version of USDC for Base Sepolia testnet
 * @dev Mimics real USDC with 6 decimals and mintable supply for testing
 */
contract MockUSDC is ERC20, Ownable {
    
    constructor() ERC20("USD Coin", "USDC") Ownable(msg.sender) {
        // Mint initial supply to deployer for distribution
        _mint(msg.sender, 1_000_000 * 10**6); // 1 million USDC
    }
    
    /**
     * @notice USDC uses 6 decimals (not 18)
     */
    function decimals() public pure override returns (uint8) {
        return 6;
    }
    
    /**
     * @notice Mint tokens to any address (testing only)
     * @param to Address to receive tokens
     * @param amount Amount in USDC units (6 decimals)
     */
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
    
    /**
     * @notice Faucet function - anyone can mint 1000 USDC for testing
     */
    function faucet() external {
        require(balanceOf(msg.sender) < 10_000 * 10**6, "Already have enough USDC");
        _mint(msg.sender, 1_000 * 10**6); // Mint 1000 USDC
    }
}
