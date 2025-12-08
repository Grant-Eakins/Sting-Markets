// ProportionalMarketMIND ABI (Multi-Outcome with Bonding Curve, MIND token payments)
export const PREDICTION_MARKET_ABI = [
  {
    "inputs": [
      { "internalType": "address", "name": "_oracle", "type": "address" },
      { "internalType": "address", "name": "_token", "type": "address" }
    ],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "marketId", "type": "uint256" },
      { "internalType": "uint8", "name": "outcomeIndex", "type": "uint8" },
      { "internalType": "uint256", "name": "amount", "type": "uint256" },
      { "internalType": "uint256", "name": "maxCost", "type": "uint256" }
    ],
    "name": "buyShares",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "marketId", "type": "uint256" },
      { "internalType": "uint8", "name": "outcomeIndex", "type": "uint8" },
      { "internalType": "uint256", "name": "sharesToSell", "type": "uint256" },
      { "internalType": "uint256", "name": "minPayout", "type": "uint256" }
    ],
    "name": "sellShares",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "marketId", "type": "uint256" }
    ],
    "name": "getProbabilities",
    "outputs": [
      { "internalType": "uint256[]", "name": "", "type": "uint256[]" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "marketId", "type": "uint256" }
    ],
    "name": "claimPayout",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "marketId", "type": "uint256" }
    ],
    "name": "claimWinnings",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "nextMarketId",
    "outputs": [
      { "internalType": "uint256", "name": "", "type": "uint256" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "marketId", "type": "uint256" }
    ],
    "name": "getMarket",
    "outputs": [
      { "internalType": "string", "name": "stockSymbol", "type": "string" },
      { "internalType": "uint8", "name": "sessionType", "type": "uint8" },
      { "internalType": "uint8", "name": "status", "type": "uint8" },
      { "internalType": "uint8", "name": "numOutcomes", "type": "uint8" },
      { "internalType": "uint256", "name": "referencePrice", "type": "uint256" },
      { "internalType": "uint256", "name": "finalPrice", "type": "uint256" },
      { "internalType": "uint256", "name": "lockTime", "type": "uint256" },
      { "internalType": "uint256", "name": "settleTime", "type": "uint256" },
      { "internalType": "bool", "name": "settled", "type": "bool" },
      { "internalType": "uint8", "name": "winningOutcome", "type": "uint8" },
      { "internalType": "uint256", "name": "totalLiquidity", "type": "uint256" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "marketCounter",
    "outputs": [
      { "internalType": "uint256", "name": "", "type": "uint256" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "marketId", "type": "uint256" },
      { "internalType": "uint8", "name": "outcomeIndex", "type": "uint8" },
      { "internalType": "uint256", "name": "sharesToSell", "type": "uint256" }
    ],
    "name": "getSellQuote",
    "outputs": [
      { "internalType": "uint256", "name": "grossPayout", "type": "uint256" },
      { "internalType": "uint256", "name": "netPayout", "type": "uint256" },
      { "internalType": "uint256", "name": "sellFee", "type": "uint256" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "marketId", "type": "uint256" },
      { "internalType": "uint8", "name": "outcomeIndex", "type": "uint8" }
    ],
    "name": "getBucketData",
    "outputs": [
      { "internalType": "uint256", "name": "bucketLiquidity", "type": "uint256" },
      { "internalType": "uint256", "name": "totalShares", "type": "uint256" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  // Events
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "uint256", "name": "marketId", "type": "uint256" },
      { "indexed": true, "internalType": "address", "name": "user", "type": "address" },
      { "indexed": false, "internalType": "uint8", "name": "outcomeIndex", "type": "uint8" },
      { "indexed": false, "internalType": "uint256", "name": "shares", "type": "uint256" },
      { "indexed": false, "internalType": "uint256", "name": "cost", "type": "uint256" }
    ],
    "name": "SharesPurchased",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "uint256", "name": "marketId", "type": "uint256" },
      { "indexed": true, "internalType": "address", "name": "user", "type": "address" },
      { "indexed": false, "internalType": "uint8", "name": "outcomeIndex", "type": "uint8" },
      { "indexed": false, "internalType": "uint256", "name": "shares", "type": "uint256" },
      { "indexed": false, "internalType": "uint256", "name": "payout", "type": "uint256" }
    ],
    "name": "SharesSold",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "uint256", "name": "marketId", "type": "uint256" },
      { "indexed": true, "internalType": "address", "name": "user", "type": "address" },
      { "indexed": false, "internalType": "uint256", "name": "payout", "type": "uint256" }
    ],
    "name": "PayoutClaimed",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "uint256", "name": "marketId", "type": "uint256" },
      { "indexed": true, "internalType": "address", "name": "user", "type": "address" },
      { "indexed": false, "internalType": "uint256", "name": "refundAmount", "type": "uint256" }
    ],
    "name": "RefundClaimed",
    "type": "event"
  },
  // Refund functions
  {
    "inputs": [
      { "internalType": "uint256", "name": "marketId", "type": "uint256" }
    ],
    "name": "claimRefund",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "marketId", "type": "uint256" }
    ],
    "name": "isRefundEligible",
    "outputs": [
      { "internalType": "bool", "name": "", "type": "bool" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  // Lock market function
  {
    "inputs": [
      { "internalType": "uint256", "name": "marketId", "type": "uint256" }
    ],
    "name": "lockMarket",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const;

// Old binary market ABI (deprecated)
export const OLD_BINARY_ABI = [
  {
    "inputs": [],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "uint256", "name": "betId", "type": "uint256" },
      { "indexed": true, "internalType": "uint256", "name": "marketId", "type": "uint256" },
      { "indexed": true, "internalType": "address", "name": "bettor", "type": "address" },
      { "indexed": false, "internalType": "enum PredictionMarket.Position", "name": "position", "type": "uint8" },
      { "indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256" },
      { "indexed": false, "internalType": "uint256", "name": "odds", "type": "uint256" }
    ],
    "name": "BetPlaced",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "uint256", "name": "marketId", "type": "uint256" },
      { "indexed": false, "internalType": "string", "name": "trendName", "type": "string" },
      { "indexed": false, "internalType": "uint256", "name": "lockTime", "type": "uint256" },
      { "indexed": false, "internalType": "uint256", "name": "settleTime", "type": "uint256" }
    ],
    "name": "MarketCreated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "uint256", "name": "marketId", "type": "uint256" }
    ],
    "name": "MarketLocked",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "uint256", "name": "marketId", "type": "uint256" },
      { "indexed": false, "internalType": "enum PredictionMarket.Position", "name": "winningPosition", "type": "uint8" },
      { "indexed": false, "internalType": "uint256", "name": "upPool", "type": "uint256" },
      { "indexed": false, "internalType": "uint256", "name": "downPool", "type": "uint256" }
    ],
    "name": "MarketSettled",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "uint256", "name": "betId", "type": "uint256" },
      { "indexed": true, "internalType": "uint256", "name": "marketId", "type": "uint256" },
      { "indexed": true, "internalType": "address", "name": "bettor", "type": "address" },
      { "indexed": false, "internalType": "uint256", "name": "betAmount", "type": "uint256" },
      { "indexed": false, "internalType": "uint256", "name": "payout", "type": "uint256" }
    ],
    "name": "PositionSold",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "uint256", "name": "betId", "type": "uint256" },
      { "indexed": true, "internalType": "address", "name": "bettor", "type": "address" },
      { "indexed": false, "internalType": "uint256", "name": "payout", "type": "uint256" }
    ],
    "name": "WinningsClaimed",
    "type": "event"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "marketId", "type": "uint256" }
    ],
    "name": "calculateCurrentOdds",
    "outputs": [
      { "internalType": "uint256", "name": "upOdds", "type": "uint256" },
      { "internalType": "uint256", "name": "downOdds", "type": "uint256" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "betId", "type": "uint256" }
    ],
    "name": "claimWinnings",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "betId", "type": "uint256" }
    ],
    "name": "sellPosition",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "string", "name": "trendName", "type": "string" },
      { "internalType": "uint256", "name": "initialInterest", "type": "uint256" },
      { "internalType": "uint256", "name": "lockTime", "type": "uint256" },
      { "internalType": "uint256", "name": "settleTime", "type": "uint256" }
    ],
    "name": "createMarket",
    "outputs": [
      { "internalType": "uint256", "name": "", "type": "uint256" }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "betId", "type": "uint256" }
    ],
    "name": "getBet",
    "outputs": [
      {
        "components": [
          { "internalType": "address", "name": "bettor", "type": "address" },
          { "internalType": "uint256", "name": "marketId", "type": "uint256" },
          { "internalType": "enum PredictionMarket.Position", "name": "position", "type": "uint8" },
          { "internalType": "uint256", "name": "amount", "type": "uint256" },
          { "internalType": "uint256", "name": "odds", "type": "uint256" },
          { "internalType": "bool", "name": "claimed", "type": "bool" }
        ],
        "internalType": "struct PredictionMarket.Bet",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "marketId", "type": "uint256" }
    ],
    "name": "getMarket",
    "outputs": [
      {
        "components": [
          { "internalType": "string", "name": "trendName", "type": "string" },
          { "internalType": "uint256", "name": "initialInterest", "type": "uint256" },
          { "internalType": "uint256", "name": "lockTime", "type": "uint256" },
          { "internalType": "uint256", "name": "settleTime", "type": "uint256" },
          { "internalType": "enum PredictionMarket.MarketStatus", "name": "status", "type": "uint8" },
          { "internalType": "uint256", "name": "upPool", "type": "uint256" },
          { "internalType": "uint256", "name": "downPool", "type": "uint256" },
          { "internalType": "enum PredictionMarket.Position", "name": "winningPosition", "type": "uint8" },
          { "internalType": "bool", "name": "settled", "type": "bool" }
        ],
        "internalType": "struct PredictionMarket.Market",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "marketId", "type": "uint256" }
    ],
    "name": "getMarketBets",
    "outputs": [
      { "internalType": "uint256[]", "name": "", "type": "uint256[]" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "address", "name": "user", "type": "address" }
    ],
    "name": "getUserBets",
    "outputs": [
      { "internalType": "uint256[]", "name": "", "type": "uint256[]" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "marketId", "type": "uint256" },
      { "internalType": "enum PredictionMarket.Position", "name": "position", "type": "uint8" }
    ],
    "name": "placeBet",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "marketId", "type": "uint256" },
      { "internalType": "uint256", "name": "finalInterest", "type": "uint256" }
    ],
    "name": "settleMarket",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const;

// Contract addresses
export const CONTRACT_ADDRESSES = {
  // Base Mainnet
  8453: '0x0000000000000000000000000000000000000000', // TODO: Deploy to mainnet
  // Base Sepolia Testnet
  84532: '0x221EDE572F99557f2e73A4aed21330e580a89445', // ProportionalMarketMIND
} as const;

// MIND token contract addresses (your custom token)
export const TOKEN_ADDRESSES = {
  // Base Mainnet
  8453: '0x0000000000000000000000000000000000000000', // TODO: Deploy MIND to mainnet
  // Base Sepolia Testnet
  84532: '0xCe31Ae82c11dd708eF51c93dEEb5Be0474A132D1', // Mindshare Token (MIND)
} as const;

// MIND token has 18 decimals (standard ERC20)
export const TOKEN_DECIMALS = 18;

// Token symbol for display
export const TOKEN_SYMBOL = 'MIND';

// ERC20 ABI for token approval
export const ERC20_ABI = [
  {
    "inputs": [
      { "internalType": "address", "name": "spender", "type": "address" },
      { "internalType": "uint256", "name": "amount", "type": "uint256" }
    ],
    "name": "approve",
    "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "address", "name": "owner", "type": "address" },
      { "internalType": "address", "name": "spender", "type": "address" }
    ],
    "name": "allowance",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "address", "name": "account", "type": "address" }],
    "name": "balanceOf",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "decimals",
    "outputs": [{ "internalType": "uint8", "name": "", "type": "uint8" }],
    "stateMutability": "view",
    "type": "function"
  }
] as const;
