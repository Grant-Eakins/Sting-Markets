/**
 * Service to automatically create on-chain markets for Google Trends
 */
import { createPublicClient, createWalletClient, http } from 'viem';
import { baseSepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import dotenv from 'dotenv';
import { CONTRACT_ADDRESSES, DUAL_COIN_CONTRACT_ADDRESSES, LISTING_AUCTION_ADDRESSES } from '../../shared/contracts';

dotenv.config();

// ProportionalMarketUSDC contract address (Base Sepolia)
const CONTRACT_ADDRESS = CONTRACT_ADDRESSES[84532];

// ProportionalMarketDualCoin contract address (Base Sepolia)
const DUAL_COIN_CONTRACT_ADDRESS = DUAL_COIN_CONTRACT_ADDRESSES[84532];

const ABI = [
  // createMarket(string stockSymbol, SessionType sessionType, uint256 referencePrice, uint256 lockTime, uint256 settleTime)
  {
    "inputs": [
      { "internalType": "string", "name": "stockSymbol", "type": "string" },
      { "internalType": "uint8", "name": "sessionType", "type": "uint8" }, // 0 = INTRADAY, 1 = OVERNIGHT
      { "internalType": "uint256", "name": "referencePrice", "type": "uint256" },
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
  // settleMarket(uint256 marketId, uint256 finalPrice) - only oracle can call
  {
    "inputs": [
      { "internalType": "uint256", "name": "marketId", "type": "uint256" },
      { "internalType": "uint256", "name": "finalPrice", "type": "uint256" }
    ],
    "name": "settleMarket",
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
  // getProbabilities(uint256 marketId) returns uint256[]
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
  }
] as const;

// Dual Coin contract ABI (for head-to-head battles)
const DUAL_COIN_ABI = [
  // createMarket(string coinASymbol, string coinBSymbol, uint256 lockTime, uint256 settleTime)
  {
    "inputs": [
      { "internalType": "string", "name": "coinASymbol", "type": "string" },
      { "internalType": "string", "name": "coinBSymbol", "type": "string" },
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
  // settleMarket(uint256 marketId, bool coinAWon)
  {
    "inputs": [
      { "internalType": "uint256", "name": "marketId", "type": "uint256" },
      { "internalType": "bool", "name": "coinAWon", "type": "bool" }
    ],
    "name": "settleMarket",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  // settleMarketManual(uint256 marketId, bool coinAWon) - bypasses time check for testing
  {
    "inputs": [
      { "internalType": "uint256", "name": "marketId", "type": "uint256" },
      { "internalType": "bool", "name": "coinAWon", "type": "bool" }
    ],
    "name": "settleMarketManual",
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
  // getMarket(uint256 marketId) returns market data including pools
  {
    "inputs": [
      { "internalType": "uint256", "name": "marketId", "type": "uint256" }
    ],
    "name": "getMarket",
    "outputs": [
      { "internalType": "string", "name": "coinASymbol", "type": "string" },
      { "internalType": "string", "name": "coinBSymbol", "type": "string" },
      { "internalType": "uint8", "name": "status", "type": "uint8" },
      { "internalType": "uint256", "name": "coinAPool", "type": "uint256" },
      { "internalType": "uint256", "name": "coinBPool", "type": "uint256" },
      { "internalType": "uint256", "name": "totalPool", "type": "uint256" },
      { "internalType": "uint256", "name": "lockTime", "type": "uint256" },
      { "internalType": "uint256", "name": "settleTime", "type": "uint256" },
      { "internalType": "bool", "name": "settled", "type": "bool" },
      { "internalType": "bool", "name": "coinAWon", "type": "bool" }
    ],
    "stateMutability": "view",
    "type": "function"
  }
] as const;

// ListingAuction contract address (Base Sepolia)
const AUCTION_CONTRACT_ADDRESS = LISTING_AUCTION_ADDRESSES[84532];

// ListingAuction ABI (for on-chain auction management)
const AUCTION_ABI = [
  {
    "inputs": [],
    "name": "config",
    "outputs": [
      { "internalType": "bool", "name": "isActive", "type": "bool" },
      { "internalType": "uint256", "name": "minBidAmount", "type": "uint256" },
      { "internalType": "uint256", "name": "auctionStart", "type": "uint256" },
      { "internalType": "uint256", "name": "auctionEnd", "type": "uint256" },
      { "internalType": "uint256", "name": "minMarketCap", "type": "uint256" },
      { "internalType": "uint256", "name": "maxMarketCap", "type": "uint256" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "durationHours", "type": "uint256" }],
    "name": "startAuction",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "stopAuction",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256[]", "name": "winningBidIds", "type": "uint256[]" }],
    "name": "finalizeAuction",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "limit", "type": "uint256" }],
    "name": "getLeaderboard",
    "outputs": [
      { "internalType": "uint256[]", "name": "bidIds", "type": "uint256[]" },
      { "internalType": "address[]", "name": "bidders", "type": "address[]" },
      { "internalType": "string[]", "name": "coinAddresses", "type": "string[]" },
      { "internalType": "string[]", "name": "chains", "type": "string[]" },
      { "internalType": "uint256[]", "name": "amounts", "type": "uint256[]" }
    ],
    "stateMutability": "view",
    "type": "function"
  }
] as const;

let walletClient: any = null;
let publicClient: any = null;
let isInitialized = false;

/**
 * Initialize blockchain clients
 */
export function initializeBlockchain() {
  if (isInitialized) return true;

  try {
    let privateKey = process.env.DEPLOYER_PRIVATE_KEY;
    if (!privateKey) {
      console.log('⚠️  No DEPLOYER_PRIVATE_KEY - on-chain market creation disabled');
      return false;
    }

    privateKey = privateKey.trim().replace(/['"]/g, '');
    if (!privateKey.startsWith('0x')) {
      privateKey = `0x${privateKey}`;
    }

    const account = privateKeyToAccount(privateKey as `0x${string}`);

    walletClient = createWalletClient({
      account,
      chain: baseSepolia,
      transport: http()
    });

    publicClient = createPublicClient({
      chain: baseSepolia,
      transport: http()
    });

    isInitialized = true;
    console.log('✅ Blockchain sync initialized');
    console.log('📍 Contract:', CONTRACT_ADDRESS);
    console.log('👤 Owner:', account.address);
    return true;
  } catch (error: any) {
    console.error('❌ Failed to initialize blockchain:', error.message);
    return false;
  }
}

/**
 * Creates an on-chain market and returns the market ID
 */
export async function createOnChainMarket(
  stockSymbol: string,
  openingPrice: number,
  lockTime: Date,
  settleTime: Date,
  isAfterHours: boolean = false,
  numBuckets: number = 10 // Default 10 buckets, but can be 2 for dual-coin
): Promise<number | null> {
  if (!isInitialized) {
    console.log('⚠️  Blockchain not initialized - skipping on-chain creation');
    return null;
  }

  try {
    const lockTimestamp = Math.floor(lockTime.getTime() / 1000);
    const settleTimestamp = Math.floor(settleTime.getTime() / 1000);
    
    // SessionType: 0 = INTRADAY (trading hours), 1 = OVERNIGHT (after-hours)
    const sessionType = isAfterHours ? 1 : 0;

    console.log(`⛓️  Creating on-chain market: ${stockSymbol} @ $${(openingPrice / 100).toFixed(2)}`);
    console.log(`   Buckets: ${numBuckets} ${numBuckets === 2 ? '(Dual-Coin Head-to-Head)' : ''}`);
    console.log(`   Session: ${isAfterHours ? 'OVERNIGHT' : 'INTRADAY'}`);

    // Read nextMarketId BEFORE the transaction - this will be the ID of our new market
    const marketIdBeforeCreate = await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi: ABI,
      functionName: 'nextMarketId'
    });
    const expectedMarketId = Number(marketIdBeforeCreate);
    console.log(`   Expected market ID: ${expectedMarketId}`);

    const hash = await walletClient.writeContract({
      address: CONTRACT_ADDRESS,
      abi: ABI,
      functionName: 'createMarket',
      args: [
        stockSymbol,
        sessionType,
        BigInt(openingPrice),
        BigInt(lockTimestamp),
        BigInt(settleTimestamp)
      ]
    });

    console.log(`⏳ Transaction submitted: ${hash}`);
    
    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    if (receipt.status === 'success') {
      // Use the market ID we captured before the transaction
      // This avoids race conditions with nextMarketId reads
      const marketId = expectedMarketId;
      
      console.log(`✅ On-chain market created! ID: ${marketId}`);
      console.log(`🔗 https://sepolia.basescan.org/tx/${hash}`);
      
      return marketId;
    } else {
      console.error('❌ Transaction failed');
      return null;
    }
  } catch (error: any) {
    console.error('❌ Error creating on-chain market:', error.message);
    return null;
  }
}

/**
 * Creates a dual-coin battle on-chain and returns the market ID
 */
export async function createDualCoinOnChainMarket(
  coinASymbol: string,
  coinBSymbol: string,
  lockTime: Date,
  settleTime: Date
): Promise<number | null> {
  if (!isInitialized) {
    console.log('⚠️  Blockchain not initialized - skipping on-chain creation');
    return null;
  }

  try {
    const lockTimestamp = Math.floor(lockTime.getTime() / 1000);
    const settleTimestamp = Math.floor(settleTime.getTime() / 1000);

    console.log(`⛓️  Creating dual-coin market: ${coinASymbol} vs ${coinBSymbol}`);
    console.log(`   Contract: ${DUAL_COIN_CONTRACT_ADDRESS}`);
    console.log(`   Lock: ${lockTime.toLocaleString()}`);
    console.log(`   Settle: ${settleTime.toLocaleString()}`);

    // Read nextMarketId BEFORE the transaction - this will be the ID of our new market
    const marketIdBeforeCreate = await publicClient.readContract({
      address: DUAL_COIN_CONTRACT_ADDRESS,
      abi: DUAL_COIN_ABI,
      functionName: 'nextMarketId'
    });
    const expectedMarketId = Number(marketIdBeforeCreate);
    console.log(`   Expected market ID: ${expectedMarketId}`);

    const hash = await walletClient.writeContract({
      address: DUAL_COIN_CONTRACT_ADDRESS,
      abi: DUAL_COIN_ABI,
      functionName: 'createMarket',
      args: [
        coinASymbol,
        coinBSymbol,
        BigInt(lockTimestamp),
        BigInt(settleTimestamp)
      ]
    });

    console.log(`⏳ Transaction submitted: ${hash}`);
    
    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    if (receipt.status === 'success') {
      const marketId = expectedMarketId;
      
      console.log(`✅ Dual-coin market created on-chain! ID: ${marketId}`);
      console.log(`🔗 https://sepolia.basescan.org/tx/${hash}`);
      
      return marketId;
    } else {
      console.error('❌ Transaction failed');
      return null;
    }
  } catch (error: any) {
    console.error('❌ Error creating dual-coin on-chain market:', error.message);
    return null;
  }
}

/**
 * Get dual-coin market pool data from blockchain
 */
export async function getDualCoinMarketPools(blockchainMarketId: number): Promise<{
  upPool: number;
  downPool: number;
  totalPool: number;
} | null> {
  if (!isInitialized || !publicClient) {
    return null;
  }

  try {
    const result = await publicClient.readContract({
      address: DUAL_COIN_CONTRACT_ADDRESS,
      abi: DUAL_COIN_ABI,
      functionName: 'getMarket',
      args: [BigInt(blockchainMarketId)]
    }) as any;

    // result is: [coinASymbol, coinBSymbol, status, coinAPool, coinBPool, totalPool, lockTime, settleTime, settled, coinAWon]
    const coinAPool = Number(result[3]) / 1e6; // Convert from USDC 6 decimals
    const coinBPool = Number(result[4]) / 1e6;
    const totalPool = Number(result[5]) / 1e6;

    return {
      upPool: coinAPool,    // Coin A = UP
      downPool: coinBPool,  // Coin B = DOWN
      totalPool
    };
  } catch (error: any) {
    console.error(`❌ Error getting dual-coin pools for market ${blockchainMarketId}:`, error.message);
    return null;
  }
}

/**
 * Settle a market on-chain with final stock price
 * 
 * ORACLE FLOW:
 * 1. Backend fetches real stock price from API (Alpha Vantage/Polygon)
 * 2. Backend calls this function with the price
 * 3. This function sends transaction to contract as the authorized oracle
 * 4. Contract verifies caller is oracle address (set in constructor)
 * 5. Contract calculates winning bucket based on price change
 * 6. Users can claim payouts from winning bucket
 */
export async function settleOnChainMarket(blockchainMarketId: number, closingPrice: number): Promise<boolean> {
  if (!isInitialized || !walletClient) {
    console.log('⚠️  Blockchain not initialized - skipping on-chain settlement');
    return false;
  }

  try {
    console.log(`⛓️  Settling on-chain market #${blockchainMarketId}`);
    console.log(`   Final price: $${(closingPrice / 100).toFixed(2)}`);

    const hash = await walletClient.writeContract({
      address: CONTRACT_ADDRESS,
      abi: ABI,
      functionName: 'settleMarket',
      args: [
        BigInt(blockchainMarketId),
        BigInt(closingPrice)
      ]
    });

    console.log(`⏳ Settlement transaction submitted: ${hash}`);
    
    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    if (receipt.status === 'success') {
      // Fetch market data to show winning bucket
      const marketData = await publicClient.readContract({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: 'getMarket',
        args: [BigInt(blockchainMarketId)]
      });
      
      const referencePrice = Number(marketData[4]);
      const winningBucket = Number(marketData[9]);
      const priceChange = ((closingPrice - referencePrice) / referencePrice) * 100;
      
      console.log(`✅ Market #${blockchainMarketId} settled on-chain!`);
      console.log(`   Price change: ${priceChange >= 0 ? '+' : ''}${priceChange.toFixed(2)}%`);
      console.log(`   Winning bucket: #${winningBucket}`);
      console.log(`🔗 https://sepolia.basescan.org/tx/${hash}`);
      return true;
    } else {
      console.error('❌ Settlement transaction failed');
      return false;
    }
  } catch (error: any) {
    console.error('❌ Error settling on-chain market:', error.message);
    return false;
  }
}

/**
 * Settle a dual-coin market on-chain
 * @param blockchainMarketId The on-chain market ID
 * @param coinAWon True if Coin A won, false if Coin B won
 */
export async function settleDualCoinOnChain(blockchainMarketId: number, coinAWon: boolean): Promise<boolean> {
  console.log(`📍 settleDualCoinOnChain called - marketId: ${blockchainMarketId}, coinAWon: ${coinAWon}`);
  console.log(`📍 isInitialized: ${isInitialized}, walletClient exists: ${!!walletClient}`);
  
  if (!isInitialized || !walletClient) {
    console.log('⚠️  Blockchain not initialized - skipping on-chain settlement');
    console.log(`   DEPLOYER_PRIVATE_KEY set: ${!!process.env.DEPLOYER_PRIVATE_KEY}`);
    return false;
  }
  
  const DUAL_COIN_ABI = [
    {
      "inputs": [
        { "internalType": "uint256", "name": "marketId", "type": "uint256" },
        { "internalType": "bool", "name": "coinAWon", "type": "bool" }
      ],
      "name": "settleMarket",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
      "name": "markets",
      "outputs": [
        { "internalType": "string", "name": "coinASymbol", "type": "string" },
        { "internalType": "string", "name": "coinBSymbol", "type": "string" },
        { "internalType": "uint256", "name": "totalLiquidity", "type": "uint256" },
        { "internalType": "uint256", "name": "createdAt", "type": "uint256" },
        { "internalType": "uint256", "name": "lockTime", "type": "uint256" },
        { "internalType": "uint256", "name": "settleTime", "type": "uint256" },
        { "internalType": "bool", "name": "settled", "type": "bool" },
        { "internalType": "uint8", "name": "winningOutcome", "type": "uint8" },
        { "internalType": "enum ProportionalMarketDualCoin.MarketStatus", "name": "status", "type": "uint8" }
      ],
      "stateMutability": "view",
      "type": "function"
    }
  ] as const;

  try {
    // First, read the on-chain market status
    try {
      const marketData = await publicClient.readContract({
        address: DUAL_COIN_CONTRACT_ADDRESS,
        abi: DUAL_COIN_ABI,
        functionName: 'markets',
        args: [BigInt(blockchainMarketId)]
      }) as any;
      
      console.log(`📊 On-chain market #${blockchainMarketId} status:`);
      console.log(`   Coin A: ${marketData[0]}, Coin B: ${marketData[1]}`);
      console.log(`   Total Liquidity: ${marketData[2]}`);
      console.log(`   Lock Time: ${new Date(Number(marketData[4]) * 1000).toISOString()}`);
      console.log(`   Settle Time: ${new Date(Number(marketData[5]) * 1000).toISOString()}`);
      console.log(`   Already Settled: ${marketData[6]}`);
      console.log(`   Status: ${marketData[8]} (0=ACTIVE, 1=LOCKED, 2=SETTLED)`);
      console.log(`   Current Time: ${new Date().toISOString()}`);
      
      if (marketData[6] === true) {
        console.log('   ⚠️  Market is already settled on-chain!');
        return true; // Already settled is technically a success
      }
    } catch (readError: any) {
      console.error('   ⚠️  Could not read market data:', readError.message);
    }

    console.log(`⛓️  Settling dual-coin market #${blockchainMarketId} on-chain`);
    console.log(`   Winner: ${coinAWon ? 'Coin A' : 'Coin B'}`);
    console.log(`   Contract: ${DUAL_COIN_CONTRACT_ADDRESS}`);

    // First, check if settlement is possible by simulating the call
    try {
      await publicClient.simulateContract({
        address: DUAL_COIN_CONTRACT_ADDRESS,
        abi: DUAL_COIN_ABI,
        functionName: 'settleMarketManual',
        args: [BigInt(blockchainMarketId), coinAWon],
        account: walletClient.account.address,
      });
      console.log('   ✅ Simulation passed - proceeding with transaction');
    } catch (simError: any) {
      console.error('   ❌ Simulation failed:', simError.message);
      if (simError.message?.includes('Too early')) {
        console.error('   ⏰ Market settle time has not passed yet');
      } else if (simError.message?.includes('Invalid status')) {
        console.error('   ⚠️  Market is not in ACTIVE or LOCKED status');
      } else if (simError.message?.includes('Already settled')) {
        console.error('   ⚠️  Market is already settled on-chain');
      } else if (simError.message?.includes('Not authorized')) {
        console.error('   ⚠️  Wallet is not authorized (not oracle or owner)');
      }
      return false;
    }

    const hash = await walletClient.writeContract({
      address: DUAL_COIN_CONTRACT_ADDRESS,
      abi: DUAL_COIN_ABI,
      functionName: 'settleMarketManual',
      args: [BigInt(blockchainMarketId), coinAWon]
    });

    console.log(`⏳ Dual-coin settlement transaction submitted: ${hash}`);
    
    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    if (receipt.status === 'success') {
      console.log(`✅ Dual-coin market #${blockchainMarketId} settled on-chain!`);
      console.log(`🔗 https://sepolia.basescan.org/tx/${hash}`);
      return true;
    } else {
      console.error('❌ Dual-coin settlement transaction failed');
      return false;
    }
  } catch (error: any) {
    console.error('❌ Error settling dual-coin market on-chain:', error.message);
    return false;
  }
}

/**
 * Get the next available on-chain market ID
 */
export async function getNextMarketId(): Promise<number> {
  if (!isInitialized || !publicClient) {
    return 0;
  }

  try {
    const counter = await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi: ABI,
      functionName: 'marketCounter'
    });
    return Number(counter);
  } catch (error) {
    console.error('❌ Error getting market counter:', error);
    return 0;
  }
}

/**
 * Get LMSR probabilities for all buckets in a market
 */
export async function getMarketProbabilities(blockchainMarketId: number): Promise<number[] | null> {
  if (!isInitialized || !publicClient) {
    return null;
  }

  try {
    const probabilities = await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi: ABI,
      functionName: 'getProbabilities',
      args: [BigInt(blockchainMarketId)]
    });

    // Contract returns probabilities in basis points (10000 = 100%)
    // Convert to percentages (0-100)
    return (probabilities as bigint[]).map(p => Number(p) / 100);
  } catch (error: any) {
    console.error(`❌ Error getting probabilities for market ${blockchainMarketId}:`, error.message);
    return null;
  }
}

/**
 * Syncs pool balances from blockchain for a specific market
 * NOTE: Multi-outcome markets don't have simple upPool/downPool
 * Use getMarketProbabilities() instead for bucket data
 */
export async function syncMarketPools(blockchainMarketId: number): Promise<{
  upPool: number;
  downPool: number;
  totalPool: number;
} | null> {
  if (!isInitialized || !publicClient) {
    return null;
  }

  try {
    // For backwards compatibility with old binary contract
    // Multi-outcome contract doesn't have upPool/downPool
    console.warn('⚠️  syncMarketPools() is deprecated for multi-outcome markets. Use getMarketProbabilities() instead.');
    return { upPool: 0, downPool: 0, totalPool: 0 };
  } catch (error: any) {
    console.error(`❌ Error syncing market ${blockchainMarketId}:`, error.message);
    return null;
  }
}

/**
 * Syncs all markets with blockchain pool data
 */
export async function syncAllMarketPools(markets: Array<{ id: string; blockchainMarketId?: number; isDualCoin?: boolean }>): Promise<Map<string, { upPool: number; downPool: number; totalPool: number }>> {
  const results = new Map<string, { upPool: number; downPool: number; totalPool: number }>();

  if (!isInitialized) {
    return results;
  }

  for (const market of markets) {
    if (market.blockchainMarketId !== undefined && market.blockchainMarketId !== null) {
      let poolData = null;
      
      // Use appropriate contract based on market type
      if (market.isDualCoin) {
        poolData = await getDualCoinMarketPools(market.blockchainMarketId);
      } else {
        poolData = await syncMarketPools(market.blockchainMarketId);
      }
      
      if (poolData) {
        results.set(market.id, poolData);
      }
    }
  }

  return results;
}

/**
 * Get market status from blockchain
 * Returns { settled, status, winningOutcome } or null if not found
 */
export async function getOnChainMarketStatus(blockchainMarketId: number, isDualCoin: boolean = false): Promise<{
  settled: boolean;
  status: number;
  winningOutcome: number;
  finalPrice: bigint;
} | null> {
  if (!isInitialized || !publicClient) {
    return null;
  }

  const contractAddress = isDualCoin ? DUAL_COIN_CONTRACT_ADDRESS : CONTRACT_ADDRESS;
  const contractAbi = isDualCoin ? DUAL_COIN_ABI : ABI;

  try {
    const result = await publicClient.readContract({
      address: contractAddress,
      abi: contractAbi,
      functionName: 'getMarket',
      args: [BigInt(blockchainMarketId)]
    });

    // getMarket returns: [stockSymbol, sessionType, status, numOutcomes, referencePrice, finalPrice, lockTime, settleTime, settled, winningOutcome, totalLiquidity]
    // For dual coin: [coinASymbol, coinBSymbol, status, coinAPool, coinBPool, totalPool, lockTime, settleTime, settled, coinAWon]
    const data = result as any[];
    
    if (isDualCoin) {
      // Dual coin contract has different return structure
      return {
        settled: data[8] as boolean,
        status: Number(data[2]),
        winningOutcome: data[9] ? 0 : 1, // coinAWon = true means UP/outcome 0
        finalPrice: BigInt(0), // Not applicable for dual coin
      };
    } else {
      return {
        settled: data[8] as boolean,
        status: Number(data[2]),
        winningOutcome: Number(data[9]),
        finalPrice: data[5] as bigint,
      };
    }
  } catch (error: any) {
    // Gracefully handle markets that don't exist on chain (e.g., from old contract deployments)
    if (error.message?.includes('Market does not exist')) {
      // Silently skip - this is expected for markets from old contract versions
      return null;
    }
    console.error(`❌ Error getting on-chain status for market ${blockchainMarketId}:`, error.message);
    return null;
  }
}

/**
 * Sync settlement status from blockchain for all markets
 * Updates backend if blockchain shows market is settled but backend doesn't
 */
export async function syncSettlementStatusFromChain(markets: Array<{ id: string; blockchainMarketId?: number; status: string | number; isDualCoin?: boolean }>): Promise<number> {
  if (!isInitialized || !publicClient) {
    console.log('⚠️  Blockchain not initialized - skipping settlement sync');
    return 0;
  }

  let syncedCount = 0;
  const { updateMarketStatusInMemory } = await import('./marketService');
  const { MarketStatus } = await import('../types/market');
  const SETTLED_STATUS = 2; // On-chain status enum value

  for (const market of markets) {
    // Only check markets that have a blockchain ID and aren't already settled in backend
    if (market.blockchainMarketId === undefined || market.blockchainMarketId === null) continue;
    // Skip if already settled (handle both string enum and number status)
    if (market.status === 'SETTLED' || market.status === MarketStatus.SETTLED || market.status === SETTLED_STATUS) continue;

    try {
      const onChainStatus = await getOnChainMarketStatus(market.blockchainMarketId, market.isDualCoin || false);
      
      if (onChainStatus && onChainStatus.settled && onChainStatus.status === SETTLED_STATUS) {
        // Blockchain says settled, backend doesn't - sync it!
        console.log(`🔄 Syncing settlement from chain: Market ${market.id} (blockchain #${market.blockchainMarketId})`);
        console.log(`   On-chain: settled=true, winningOutcome=${onChainStatus.winningOutcome}`);
        
        // Update backend status to SETTLED (both in-memory and database)
        await updateMarketStatusInMemory(market.id, MarketStatus.SETTLED);
        
        syncedCount++;
      }
    } catch (error: any) {
      console.error(`⚠️  Error syncing market ${market.id}:`, error.message);
    }
  }

  if (syncedCount > 0) {
    console.log(`✅ Synced ${syncedCount} market(s) settlement status from blockchain`);
  }

  return syncedCount;
}

// ============================================
// LISTING AUCTION ON-CHAIN FUNCTIONS
// ============================================

export interface OnChainAuctionConfig {
  isActive: boolean;
  minBidAmount: bigint;
  auctionStart: Date;
  auctionEnd: Date;
  minMarketCap: bigint;
  maxMarketCap: bigint;
}

export interface OnChainLeaderboardEntry {
  bidId: bigint;
  bidder: string;
  coinAddress: string;
  chain: string;
  amount: bigint;
}

/**
 * Get auction config from on-chain contract
 */
export async function getOnChainAuctionConfig(): Promise<OnChainAuctionConfig | null> {
  if (!isInitialized || !publicClient) {
    console.log('⚠️  Blockchain not initialized');
    return null;
  }

  try {
    const result = await publicClient.readContract({
      address: AUCTION_CONTRACT_ADDRESS,
      abi: AUCTION_ABI,
      functionName: 'config'
    });

    const [isActive, minBidAmount, auctionStart, auctionEnd, minMarketCap, maxMarketCap] = result as any[];

    return {
      isActive: isActive as boolean,
      minBidAmount: minBidAmount as bigint,
      auctionStart: new Date(Number(auctionStart) * 1000),
      auctionEnd: new Date(Number(auctionEnd) * 1000),
      minMarketCap: minMarketCap as bigint,
      maxMarketCap: maxMarketCap as bigint
    };
  } catch (error: any) {
    console.error('❌ Error getting on-chain auction config:', error.message);
    return null;
  }
}

/**
 * Get leaderboard from on-chain contract
 */
export async function getOnChainLeaderboard(limit: number = 50): Promise<OnChainLeaderboardEntry[]> {
  if (!isInitialized || !publicClient) {
    console.log('⚠️  Blockchain not initialized');
    return [];
  }

  try {
    const result = await publicClient.readContract({
      address: AUCTION_CONTRACT_ADDRESS,
      abi: AUCTION_ABI,
      functionName: 'getLeaderboard',
      args: [BigInt(limit)]
    });

    const [bidIds, bidders, coinAddresses, chains, amounts] = result as any[];

    const entries: OnChainLeaderboardEntry[] = [];
    for (let i = 0; i < bidIds.length; i++) {
      entries.push({
        bidId: bidIds[i] as bigint,
        bidder: bidders[i] as string,
        coinAddress: coinAddresses[i] as string,
        chain: chains[i] as string,
        amount: amounts[i] as bigint
      });
    }

    return entries;
  } catch (error: any) {
    console.error('❌ Error getting on-chain leaderboard:', error.message);
    return [];
  }
}

/**
 * Get top two winners from on-chain leaderboard (ensuring different coins)
 */
export async function getOnChainTopTwoWinners(): Promise<OnChainLeaderboardEntry[]> {
  const leaderboard = await getOnChainLeaderboard(50);
  
  if (leaderboard.length === 0) return [];
  
  const winners: OnChainLeaderboardEntry[] = [leaderboard[0]];
  
  // Find the next highest bid for a DIFFERENT coin
  for (let i = 1; i < leaderboard.length; i++) {
    const bid = leaderboard[i];
    if (bid.coinAddress.toLowerCase() !== winners[0].coinAddress.toLowerCase()) {
      winners.push(bid);
      break;
    }
  }
  
  return winners;
}

/**
 * Start auction on-chain
 */
export async function startOnChainAuction(durationHours: number): Promise<boolean> {
  if (!isInitialized || !walletClient) {
    console.log('⚠️  Blockchain not initialized');
    return false;
  }

  try {
    console.log(`🎪 Starting on-chain auction for ${durationHours} hours...`);
    
    const hash = await walletClient.writeContract({
      address: AUCTION_CONTRACT_ADDRESS,
      abi: AUCTION_ABI,
      functionName: 'startAuction',
      args: [BigInt(durationHours)]
    });

    console.log(`⏳ Transaction submitted: ${hash}`);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    if (receipt.status === 'success') {
      console.log(`✅ On-chain auction started!`);
      console.log(`🔗 https://sepolia.basescan.org/tx/${hash}`);
      return true;
    } else {
      console.error('❌ Transaction failed');
      return false;
    }
  } catch (error: any) {
    console.error('❌ Error starting on-chain auction:', error.message);
    return false;
  }
}

/**
 * Stop auction on-chain
 */
export async function stopOnChainAuction(): Promise<boolean> {
  if (!isInitialized || !walletClient) {
    console.log('⚠️  Blockchain not initialized');
    return false;
  }

  try {
    console.log('🛑 Stopping on-chain auction...');
    
    const hash = await walletClient.writeContract({
      address: AUCTION_CONTRACT_ADDRESS,
      abi: AUCTION_ABI,
      functionName: 'stopAuction',
      args: []
    });

    console.log(`⏳ Transaction submitted: ${hash}`);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    if (receipt.status === 'success') {
      console.log(`✅ On-chain auction stopped!`);
      console.log(`🔗 https://sepolia.basescan.org/tx/${hash}`);
      return true;
    } else {
      console.error('❌ Transaction failed');
      return false;
    }
  } catch (error: any) {
    console.error('❌ Error stopping on-chain auction:', error.message);
    return false;
  }
}

/**
 * Finalize auction on-chain with winning bid IDs
 * Automatically stops auction first if it's still active
 */
export async function finalizeOnChainAuction(winningBidIds: bigint[]): Promise<boolean> {
  if (!isInitialized || !walletClient) {
    console.log('⚠️  Blockchain not initialized');
    return false;
  }

  try {
    // First check if auction is still active and stop it
    const auctionConfig = await getOnChainAuctionConfig();
    if (auctionConfig && auctionConfig.isActive) {
      console.log('🛑 Auction still active - stopping first...');
      const stopped = await stopOnChainAuction();
      if (!stopped) {
        console.error('❌ Failed to stop auction before finalizing');
        return false;
      }
      // Wait a moment for the state to update
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    console.log(`🏆 Finalizing on-chain auction with winners: ${winningBidIds.map(id => id.toString()).join(', ')}`);
    
    const hash = await walletClient.writeContract({
      address: AUCTION_CONTRACT_ADDRESS,
      abi: AUCTION_ABI,
      functionName: 'finalizeAuction',
      args: [winningBidIds]
    });

    console.log(`⏳ Transaction submitted: ${hash}`);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    if (receipt.status === 'success') {
      console.log(`✅ On-chain auction finalized!`);
      console.log(`🔗 https://sepolia.basescan.org/tx/${hash}`);
      return true;
    } else {
      console.error('❌ Transaction failed');
      return false;
    }
  } catch (error: any) {
    console.error('❌ Error finalizing on-chain auction:', error.message);
    return false;
  }
}

/**
 * Clear all bids on-chain after auction finalization (for next cycle)
 */
export async function clearOnChainAuctionBids(): Promise<boolean> {
  if (!isInitialized || !walletClient) {
    console.log('⚠️  Blockchain not initialized');
    return false;
  }

  try {
    console.log('🧹 Clearing on-chain auction bids...');
    
    const hash = await walletClient.writeContract({
      address: AUCTION_CONTRACT_ADDRESS,
      abi: [...AUCTION_ABI, {
        "inputs": [],
        "name": "clearBids",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
      }],
      functionName: 'clearBids',
      args: []
    });

    console.log(`⏳ Transaction submitted: ${hash}`);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    if (receipt.status === 'success') {
      console.log(`✅ On-chain auction bids cleared!`);
      console.log(`🔗 https://sepolia.basescan.org/tx/${hash}`);
      return true;
    } else {
      console.error('❌ Transaction failed');
      return false;
    }
  } catch (error: any) {
    console.error('❌ Error clearing on-chain auction bids:', error.message);
    return false;
  }
}
