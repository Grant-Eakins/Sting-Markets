/**
 * Service to automatically create on-chain markets for Google Trends
 */
import { createPublicClient, createWalletClient, http } from 'viem';
import { baseSepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import dotenv from 'dotenv';

dotenv.config();

// ProportionalMarketMIND contract address
const CONTRACT_ADDRESS = '0xa36fA2A8Dc1be09e049FE468281D36bc12c2043F'; // ProportionalMarketUSDC (MockUSDC + burn mechanism)

// ProportionalMarketDualCoin contract address
const DUAL_COIN_CONTRACT_ADDRESS = '0xeB3a2bd6201638d1E5C7C2CF95C03E95AA4Cf5f7'; // DualCoin head-to-head battles (with getProbabilities + getMarket)

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
  if (!isInitialized || !walletClient) {
    console.log('⚠️  Blockchain not initialized - skipping on-chain settlement');
    return false;
  }

  // Dual coin contract address
  const DUAL_COIN_CONTRACT = '0x5924B8Cec58e7cc5fEc23F8c162AA9Ff3C83E340';
  
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
    }
  ] as const;

  try {
    console.log(`⛓️  Settling dual-coin market #${blockchainMarketId} on-chain`);
    console.log(`   Winner: ${coinAWon ? 'Coin A' : 'Coin B'}`);

    const hash = await walletClient.writeContract({
      address: DUAL_COIN_CONTRACT,
      abi: DUAL_COIN_ABI,
      functionName: 'settleMarket',
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
