import { Market } from '@/lib/marketApi';
import { useReadContracts } from 'wagmi';
import { DUAL_COIN_CONTRACT_ADDRESSES, PREDICTION_MARKET_ABI } from '@/config/contract';
import { base } from 'wagmi/chains';
import { useEffect, useState } from 'react';
import { createPublicClient, http, parseAbiItem, fallback } from 'viem';

// Create a public client for reading events with fallback RPCs for reliability
const publicClient = createPublicClient({
  chain: base,
  transport: fallback([
    http('https://base.drpc.org'),
    http('https://1rpc.io/base'),
    http('https://mainnet.base.org'),
  ]),
});

/**
 * Hook to aggregate stats from multiple markets, reading from blockchain
 * 
 * ProportionalMarketDualCoin.getMarket returns:
 * [coinASymbol, coinBSymbol, status, coinAPool, coinBPool, totalPool, lockTime, settleTime, settled, winningOutcome]
 */
export function useAggregateMarketStats(markets: Market[]) {
  const contractAddress = DUAL_COIN_CONTRACT_ADDRESSES[8453];
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
    chainId: base.id,
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
        
        // Query in chunks of 2,000 blocks (RPCs have strict limits)
        const CHUNK_SIZE = 2000n;
        const LOOKBACK_BLOCKS = 200000n; // ~5 days on Base mainnet (2 sec/block)
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
        
        // ProportionalMarketDualCoin.getMarket returns:
        // [0]=coinASymbol, [1]=coinBSymbol, [2]=status, [3]=coinAPool, [4]=coinBPool, 
        // [5]=totalPool, [6]=lockTime, [7]=settleTime, [8]=settled, [9]=winningOutcome
        const totalLiquidityWei = typeof marketData[5] === 'bigint' 
          ? marketData[5] 
          : BigInt(marketData[5] || 0);
        
        const poolTokens = Number(totalLiquidityWei) / 1e6; // USDC has 6 decimals
        
        if (!isNaN(poolTokens) && isFinite(poolTokens)) {
          totalPool += poolTokens;
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
