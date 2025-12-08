import { Market } from '@/lib/marketApi';
import { useReadContracts } from 'wagmi';
import { CONTRACT_ADDRESSES, PREDICTION_MARKET_ABI } from '@/config/contract';
import { baseSepolia } from 'wagmi/chains';
import { useEffect, useState } from 'react';
import { createPublicClient, http, parseAbiItem } from 'viem';

// Create a public client for reading events
const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(),
});

/**
 * Hook to aggregate stats from multiple markets, reading from blockchain
 * 
 * ProportionalMarket.getMarket returns:
 * [stockSymbol, sessionType, status, numOutcomes, referencePrice, finalPrice, lockTime, settleTime, settled, winningOutcome, totalLiquidity]
 */
export function useAggregateMarketStats(markets: Market[]) {
  const contractAddress = CONTRACT_ADDRESSES[84532];
  const [eventBetCount, setEventBetCount] = useState(0);

  // Filter markets with blockchain IDs
  const marketsWithBlockchainId = markets.filter(
    m => m.blockchainMarketId !== undefined && m.blockchainMarketId !== null
  );

  // Build contracts array for batch reading - only getMarket calls
  const contracts = marketsWithBlockchainId.map(market => ({
    address: contractAddress as `0x${string}`,
    abi: PREDICTION_MARKET_ABI,
    functionName: 'getMarket' as const,
    args: [BigInt(market.blockchainMarketId!)],
    chainId: baseSepolia.id,
  }));

  // Fetch bet count from SharesPurchased events
  useEffect(() => {
    async function fetchBetEvents() {
      if (!contractAddress || marketsWithBlockchainId.length === 0) {
        return;
      }

      try {
        // Get current block number
        const currentBlock = await publicClient.getBlockNumber();
        
        // Query in chunks of 50,000 blocks (well under the 100k limit)
        const CHUNK_SIZE = 50000n;
        const LOOKBACK_BLOCKS = 200000n; // ~5 days on Base Sepolia
        const startBlock = currentBlock > LOOKBACK_BLOCKS ? currentBlock - LOOKBACK_BLOCKS : 0n;
        
        const allLogs: any[] = [];
        
        // Query in chunks
        for (let fromBlock = startBlock; fromBlock < currentBlock; fromBlock += CHUNK_SIZE) {
          const toBlock = fromBlock + CHUNK_SIZE - 1n > currentBlock ? currentBlock : fromBlock + CHUNK_SIZE - 1n;
          
          const logs = await publicClient.getLogs({
            address: contractAddress as `0x${string}`,
            event: parseAbiItem('event SharesPurchased(uint256 indexed marketId, address indexed user, uint8 outcomeIndex, uint256 shares, uint256 cost)'),
            fromBlock: fromBlock,
            toBlock: toBlock,
          });
          
          allLogs.push(...logs);
        }

        // Filter to only our market IDs
        const marketIds = new Set(marketsWithBlockchainId.map(m => BigInt(m.blockchainMarketId!)));
        const relevantLogs = allLogs.filter(log => {
          const marketId = log.args.marketId;
          return marketId !== undefined && marketIds.has(marketId);
        });

        console.log(`📊 Found ${relevantLogs.length} SharesPurchased events for ${marketsWithBlockchainId.length} markets`);
        setEventBetCount(relevantLogs.length);
      } catch (error) {
        console.error('Error fetching bet events:', error);
      }
    }

    fetchBetEvents();
    
    // Refresh every 15 seconds
    const interval = setInterval(fetchBetEvents, 15000);
    return () => clearInterval(interval);
  }, [contractAddress, marketsWithBlockchainId.length]);

  // Debug logging
  useEffect(() => {
    console.log(`📊 useAggregateMarketStats: ${markets.length} markets total`);
    console.log(`   - ${marketsWithBlockchainId.length} have blockchainMarketId`);
  }, [markets.length, marketsWithBlockchainId.length]);

  const { data: results, isLoading, error } = useReadContracts({
    contracts: contracts as any,
    query: {
      enabled: contracts.length > 0,
      refetchInterval: 10000,
    },
  } as any);

  // Calculate totals from blockchain data
  let totalPool = 0;

  if (results) {
    for (let i = 0; i < results.length; i++) {
      const marketResult = results[i];

      if (marketResult?.status === 'success' && marketResult.result) {
        const marketData = marketResult.result as any;
        
        // ProportionalMarket returns a tuple, access by index:
        // [10]=totalLiquidity
        const totalLiquidityWei = typeof marketData[10] === 'bigint' 
          ? marketData[10] 
          : BigInt(marketData[10] || marketData.totalLiquidity || 0);
        
        const poolUsdc = Number(totalLiquidityWei) / 1e6; // USDC has 6 decimals
        
        if (!isNaN(poolUsdc) && isFinite(poolUsdc)) {
          totalPool += poolUsdc;
        }
      }
    }
  }

  // Fall back to backend data if blockchain data not available
  if (totalPool === 0 && !isLoading) {
    totalPool = markets.reduce((sum, m) => sum + (m.totalPool ?? 0), 0);
  }
  
  // Use event count for total bets, fall back to backend if no events found
  const totalBets = eventBetCount > 0 
    ? eventBetCount 
    : markets.reduce((sum, m) => sum + (m.totalBets ?? 0), 0);

  return {
    totalPool,
    totalBets,
    isLoading,
    error,
  };
}
