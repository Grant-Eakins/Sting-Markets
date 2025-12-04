/**
 * Service to automatically create on-chain markets for Google Trends
 */
import { createPublicClient, createWalletClient, http } from 'viem';
import { baseSepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import dotenv from 'dotenv';

dotenv.config();

// TODO: Deploy MultiOutcomeMarket.sol and update this address
const CONTRACT_ADDRESS = '0x1C184a4e374C5a0A85630f7CE27C689273B2FbD3'; // ProportionalMarket with bonding curve + sell + refund + getSellQuote

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
  isAfterHours: boolean = false
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
    console.log(`   Session: ${isAfterHours ? 'OVERNIGHT (42 buckets)' : 'INTRADAY (22 buckets)'}`);

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
      // Get the market ID from the current counter - 1 (since it increments after creation)
      const currentCounter = await publicClient.readContract({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: 'nextMarketId'
      });
      
      const marketId = Number(currentCounter) - 1;
      
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
export async function syncAllMarketPools(markets: Array<{ id: string; blockchainMarketId?: number }>): Promise<Map<string, { upPool: number; downPool: number; totalPool: number }>> {
  const results = new Map<string, { upPool: number; downPool: number; totalPool: number }>();

  if (!isInitialized) {
    return results;
  }

  for (const market of markets) {
    if (market.blockchainMarketId !== undefined && market.blockchainMarketId !== null) {
      const poolData = await syncMarketPools(market.blockchainMarketId);
      if (poolData) {
        results.set(market.id, poolData);
      }
    }
  }

  return results;
}
