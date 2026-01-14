import { useReadContract } from 'wagmi';
import { CONTRACT_ADDRESSES, PREDICTION_MARKET_ABI } from '@/config/contract';
import { base } from 'wagmi/chains';

/**
 * Hook to read market data directly from the ProportionalMarket smart contract
 * Returns real-time total liquidity and probabilities
 * 
 * Note: The new contract uses multi-outcome buckets instead of binary upPool/downPool
 */
export function useContractMarketData(blockchainMarketId: number | undefined) {
  const contractAddress = CONTRACT_ADDRESSES[8453];

  const { data: marketData, isLoading, error, refetch } = useReadContract({
    address: contractAddress as `0x${string}`,
    abi: PREDICTION_MARKET_ABI,
    functionName: 'getMarket',
    args: blockchainMarketId !== undefined && blockchainMarketId !== null ? [BigInt(blockchainMarketId)] : undefined,
    chainId: base.id,
    query: {
      enabled: blockchainMarketId !== undefined && blockchainMarketId !== null,
      refetchInterval: 3000, // Refetch every 3 seconds for faster updates
      staleTime: 0, // Always consider data stale
      gcTime: 1000, // Garbage collect quickly
    },
  });

  // Also fetch probabilities for bucket distribution
  const { data: probabilities } = useReadContract({
    address: contractAddress as `0x${string}`,
    abi: PREDICTION_MARKET_ABI,
    functionName: 'getProbabilities',
    args: blockchainMarketId !== undefined && blockchainMarketId !== null ? [BigInt(blockchainMarketId)] : undefined,
    chainId: base.id,
    query: {
      enabled: blockchainMarketId !== undefined && blockchainMarketId !== null,
      refetchInterval: 3000, // Refetch every 3 seconds
      staleTime: 0,
      gcTime: 1000,
    },
  });

  if (!marketData || blockchainMarketId === undefined) {
    return {
      totalLiquidity: 0,
      upPool: 0,
      downPool: 0,
      totalPool: 0,
      numOutcomes: 0,
      probabilities: undefined,
      isLoading,
      error,
      refetch,
    };
  }

  // ProportionalMarket getMarket returns:
  // [stockSymbol, sessionType, status, numOutcomes, referencePrice, finalPrice, lockTime, settleTime, settled, winningOutcome, totalLiquidity]
  const market = marketData as any;
  
  // Access by index - getMarket returns a tuple
  const totalLiquidityWei = typeof market[10] === 'bigint' ? market[10] : BigInt(market[10] || 0);
  const numOutcomes = typeof market[3] === 'number' ? market[3] : Number(market[3] || 22);

  // Convert from token units (18 decimals) to decimal
  const totalLiquidity = Number(totalLiquidityWei) / 1e18;

  // For backwards compatibility with binary pool display,
  // calculate approximate up/down pools from probabilities
  let upPool = 0;
  let downPool = 0;
  
  if (probabilities && Array.isArray(probabilities)) {
    const probs = probabilities as bigint[];
    const middleIndex = Math.floor(probs.length / 2); // 0% change bucket
    
    // Sum probabilities for UP buckets (above middle) and DOWN buckets (below middle)
    let upProbSum = 0;
    let downProbSum = 0;
    
    for (let i = 0; i < probs.length; i++) {
      const prob = Number(probs[i]) / 10000; // Convert from basis points to decimal
      if (i < middleIndex) {
        upProbSum += prob; // Lower indices = higher price change (UP)
      } else if (i > middleIndex) {
        downProbSum += prob; // Higher indices = lower price change (DOWN)
      }
      // Middle bucket is neutral
    }
    
    // Approximate pool sizes based on probability distribution
    upPool = totalLiquidity * upProbSum;
    downPool = totalLiquidity * downProbSum;
  } else {
    // If no probabilities, split evenly
    upPool = totalLiquidity / 2;
    downPool = totalLiquidity / 2;
  }

  // Handle NaN cases
  if (isNaN(totalLiquidity) || isNaN(upPool) || isNaN(downPool)) {
    return {
      totalLiquidity: 0,
      upPool: 0,
      downPool: 0,
      totalPool: 0,
      numOutcomes: 0,
      probabilities: undefined,
      isLoading,
      error,
      refetch,
    };
  }

  return {
    totalLiquidity,
    upPool,
    downPool,
    totalPool: totalLiquidity,
    numOutcomes,
    probabilities: probabilities ? (probabilities as bigint[]).map(p => Number(p) / 100) : undefined,
    isLoading,
    error,
    refetch,
  };
}

/**
 * Hook to get market count from blockchain
 * Note: ProportionalMarket doesn't have getMarketBets, so this uses marketCounter instead
 */
export function useContractMarketBets(blockchainMarketId: number | undefined) {
  const contractAddress = CONTRACT_ADDRESSES[8453];

  // The ProportionalMarket contract doesn't track individual bets like the old binary contract
  // Instead, it tracks shares per bucket. For now, return a placeholder.
  // To get actual bet count, we'd need to query events or add a bet counter to the contract.
  
  const { data: marketData, isLoading, error } = useReadContract({
    address: contractAddress as `0x${string}`,
    abi: PREDICTION_MARKET_ABI,
    functionName: 'getMarket',
    args: blockchainMarketId !== undefined && blockchainMarketId !== null ? [BigInt(blockchainMarketId)] : undefined,
    chainId: base.id,
    query: {
      enabled: blockchainMarketId !== undefined && blockchainMarketId !== null,
      refetchInterval: 3000, // Refetch every 3 seconds
      staleTime: 0,
      gcTime: 1000,
    },
  });

  // ProportionalMarket doesn't expose bet counts directly
  // We could estimate from totalLiquidity / average bet size, but that's unreliable
  // For now, return 0 and rely on backend data
  const totalBets = 0;

  return {
    totalBets,
    isLoading,
    error,
  };
}
