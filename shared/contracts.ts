/**
 * Shared contract addresses - used by both frontend and backend
 * Single source of truth for all contract deployments
 */

export const CONTRACT_ADDRESSES = {
  // Base Mainnet
  8453: '0x0000000000000000000000000000000000000000',
  // Base Sepolia Testnet
  84532: '0xa36fA2A8Dc1be09e049FE468281D36bc12c2043F', // ProportionalMarketUSDC
} as const;

export const DUAL_COIN_CONTRACT_ADDRESSES = {
  // Base Mainnet
  8453: '0x0000000000000000000000000000000000000000',
  // Base Sepolia Testnet
  84532: '0xfe1FbFd6d3d53617d1dd4664280900aCf9B16df4', // ProportionalMarketDualCoin
} as const;

export const LISTING_AUCTION_ADDRESSES = {
  // Base Mainnet
  8453: '0x0000000000000000000000000000000000000000',
  // Base Sepolia Testnet
  84532: '0xBD1A3880C174D9aE8831BF28880e6E4E9A5090b5', // ListingAuction
} as const;

export const TOKEN_ADDRESSES = {
  // Base Mainnet
  8453: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // Real USDC
  // Base Sepolia Testnet
  84532: '0x2A9A8eb5a722053AeF8E98A5E1f0dfDC9CaE5f50', // MockUSDC
} as const;

export const MIND_TOKEN_ADDRESSES = {
  // Base Mainnet
  8453: '0x0000000000000000000000000000000000000000',
  // Base Sepolia Testnet
  84532: '0x2A9A8eb5a722053AeF8E98A5E1f0dfDC9CaE5f50', // MockUSDC as MIND
} as const;
