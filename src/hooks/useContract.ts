import { useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi';
import { parseEther } from 'viem';
import { PREDICTION_MARKET_ABI, CONTRACT_ADDRESSES } from '@/config/contract';
import { useChainId } from 'wagmi';

export enum Position {
  UP = 0,
  DOWN = 1,
}

/**
 * Hook to buy shares in a multi-outcome market
 */
export function usePlaceBet() {
  const chainId = useChainId();
  const contractAddress = CONTRACT_ADDRESSES[chainId as keyof typeof CONTRACT_ADDRESSES];
  
  const { data: hash, isPending, writeContract, error } = useWriteContract();
  
  const placeBet = (marketId: number, outcomeIndex: number, amount: string) => {
    if (!contractAddress || contractAddress === '0x0000000000000000000000000000000000000000') {
      throw new Error('Contract not deployed on this network');
    }
    
    // For multi-outcome LMSR market:
    // marketId: blockchain market ID
    // outcomeIndex: 0-21 for intraday (22 buckets) or 0-41 for overnight (42 buckets)
    // quantity: number of shares to buy (scaled by bet amount)
    // maxCost: maximum cost willing to pay (slippage protection)
    
    const valueInWei = parseEther(amount);
    // ProportionalMarket uses bonding curve - quantity param is ignored
    // Contract calculates shares based on ETH sent and current bucket liquidity
    const quantity = BigInt(1); // Placeholder - contract ignores this
    const maxCost = valueInWei; // Use sent value as max cost (slippage protection)
    
    console.log(`📝 Calling buyShares: marketId=${marketId}, outcomeIndex=${outcomeIndex}, value=${amount} ETH`);
    
    writeContract({
      address: contractAddress as `0x${string}`,
      abi: PREDICTION_MARKET_ABI,
      functionName: 'buyShares',
      args: [BigInt(marketId), outcomeIndex, quantity, maxCost],
      value: valueInWei,
    } as any);
  };
  
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });
  
  return {
    placeBet,
    hash,
    isPending,
    isConfirming,
    isConfirmed,
    error,
  };
}

/**
 * Hook to claim winnings from a bet
 */
export function useClaimWinnings() {
  const chainId = useChainId();
  const contractAddress = CONTRACT_ADDRESSES[chainId as keyof typeof CONTRACT_ADDRESSES];
  
  const { data: hash, isPending, writeContract, error } = useWriteContract();
  
  const claimWinnings = (betId: number) => {
    if (!contractAddress || contractAddress === '0x0000000000000000000000000000000000000000') {
      throw new Error('Contract not deployed on this network');
    }
    
    writeContract({
      address: contractAddress as `0x${string}`,
      abi: PREDICTION_MARKET_ABI,
      functionName: 'claimWinnings',
      args: [BigInt(betId)],
    } as any); // Type assertion for wagmi v3 compatibility
  };
  
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });
  
  return {
    claimWinnings,
    hash,
    isPending,
    isConfirming,
    isConfirmed,
    error,
  };
}

/**
 * Hook to sell shares back to the pool before market locks
 */
export function useSellShares() {
  const chainId = useChainId();
  const contractAddress = CONTRACT_ADDRESSES[chainId as keyof typeof CONTRACT_ADDRESSES];
  
  const { data: hash, isPending, writeContract, error } = useWriteContract();
  
  const sellShares = (marketId: number, outcomeIndex: number, sharesToSell: bigint, minPayout: bigint = 0n) => {
    if (!contractAddress || contractAddress === '0x0000000000000000000000000000000000000000') {
      throw new Error('Contract not deployed on this network');
    }
    
    console.log(`📝 Calling sellShares: marketId=${marketId}, outcomeIndex=${outcomeIndex}, shares=${sharesToSell}`);
    
    writeContract({
      address: contractAddress as `0x${string}`,
      abi: PREDICTION_MARKET_ABI,
      functionName: 'sellShares',
      args: [BigInt(marketId), outcomeIndex, sharesToSell, minPayout],
    } as any);
  };
  
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });
  
  return {
    sellShares,
    hash,
    isPending,
    isConfirming,
    isConfirmed,
    error,
  };
}

/**
 * Hook to get probabilities for all outcomes in a market
 */
export function useMarketProbabilities(marketId: number | undefined) {
  const chainId = useChainId();
  // Default to Base Sepolia if not connected
  const activeChainId = chainId || 84532;
  const contractAddress = CONTRACT_ADDRESSES[activeChainId as keyof typeof CONTRACT_ADDRESSES];
  
  const { data, isLoading, error, refetch } = useReadContract({
    address: contractAddress as `0x${string}`,
    abi: PREDICTION_MARKET_ABI,
    functionName: 'getProbabilities',
    args: marketId !== undefined && marketId !== null ? [BigInt(marketId)] : undefined,
    chainId: 84532, // Explicitly use Base Sepolia
    query: {
      enabled: marketId !== undefined && marketId !== null,
      refetchInterval: 3000, // Refetch every 3 seconds for faster updates
      staleTime: 0, // Always consider data stale to ensure fresh reads
      gcTime: 1000, // Garbage collect after 1 second
    },
  });
  
  // Convert from basis points (10000 = 100%) to percentages (0-100)
  const probabilities = data ? (data as bigint[]).map((p, i) => {
    const percentage = Number(p) / 100;
    return percentage;
  }) : undefined;
  
  if (probabilities && probabilities.length > 0) {
    // Only log summary, not every bucket
    const nonUniform = probabilities.filter(p => Math.abs(p - 100/probabilities.length) > 0.1);
    if (nonUniform.length > 0) {
      console.log(`✅ Market ${marketId}: ${probabilities.length} buckets, ${nonUniform.length} non-uniform`);
    }
  }
  
  return {
    probabilities,
    isLoading,
    error,
    refetch,
  };
}


