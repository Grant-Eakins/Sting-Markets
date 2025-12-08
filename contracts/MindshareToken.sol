// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MindshareToken
 * @notice ERC20 token with 1 billion total supply
 * @dev All tokens are minted to the deployer on construction
 */
contract MindshareToken is ERC20, ERC20Burnable, Ownable {
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 * 10**18; // 1 billion tokens with 18 decimals

    constructor() ERC20("Mindshare", "MIND") Ownable(msg.sender) {
        _mint(msg.sender, TOTAL_SUPPLY);
    }

    /**
     * @notice Mint additional tokens (only owner)
     * @param to Address to receive tokens
     * @param amount Amount to mint (with decimals)
     */
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
