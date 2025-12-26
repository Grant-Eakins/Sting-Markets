import { useWriteContract, useWaitForTransactionReceipt, useReadContract, useAccount as useWagmiAccount } from 'wagmi';
import { parseUnits } from 'viem';
import { PREDICTION_MARKET_ABI, CONTRACT_ADDRESSES, TOKEN_ADDRESSES, ERC20_ABI, TOKEN_DECIMALS, TOKEN_SYMBOL } from '@/config/contract';
import { useChainId, useAccount } from 'wagmi';
import { useState, useCallback, useEffect } from 'react';

export enum Position {
  UP = 0,
  DOWN = 1,
}

/**
 * Hook to check token allowance
 */
export function useTokenAllowance() {
  const chainId = useChainId();
  const { address } = useAccount();
  const contractAddress = CONTRACT_ADDRESSES[chainId as keyof typeof CONTRACT_ADDRESSES];
  const tokenAddress = TOKEN_ADDRESSES[chainId as keyof typeof TOKEN_ADDRESSES];
  
  console.log(`🔍 useTokenAllowance: chainId=${chainId}, address=${address}, contract=${contractAddress}, token=${tokenAddress}`);
  
  const { data: allowance, refetch } = useReadContract({
    address: tokenAddress as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address && contractAddress ? [address, contractAddress as `0x${string}`] : undefined,
    query: {
      enabled: !!address && !!contractAddress && !!tokenAddress,
    },
  });
  
  console.log(`🔍 useTokenAllowance result: allowance=${allowance}`);
  
  return {
    allowance: allowance as bigint | undefined,
    refetch,
  };
}

// Maximum uint256 value for unlimited approval (not used - we approve exact amounts)
// const MAX_UINT256 = 2n ** 256n - 1n;

/**
 * Hook to approve token spending
 * Approves the exact amount needed for each transaction for transparency
 */
export function useTokenApproval() {
  const chainId = useChainId();
  const { address, isConnected, connector } = useAccount();
  const contractAddress = CONTRACT_ADDRESSES[chainId as keyof typeof CONTRACT_ADDRESSES];
  const tokenAddress = TOKEN_ADDRESSES[chainId as keyof typeof TOKEN_ADDRESSES];
  
  const { data: hash, isPending, writeContract, writeContractAsync, error, reset, status } = useWriteContract();
  
  // Log status changes for debugging
  useEffect(() => {
    console.log(`🔄 useTokenApproval status: ${status}, error:`, error?.message || 'none');
  }, [status, error]);
  
  // Approve exact amount for transparency - user sees exactly what they're approving
  const approve = async (amount: bigint) => {
    if (!contractAddress || !tokenAddress) {
      console.error('❌ Contract addresses not available for approval');
      throw new Error('Contract addresses not available');
    }
    
    if (!isConnected || !address) {
      console.error('❌ Wallet not connected');
      throw new Error('Wallet not connected');
    }
    
    if (!amount || amount <= 0n) {
      console.error('❌ Invalid approval amount');
      throw new Error('Invalid approval amount');
    }
    
    console.log(`🔗 Connected wallet: ${address}, connector: ${connector?.name || 'unknown'}, chainId: ${chainId}`);
    console.log(`📝 Approving exact amount: ${amount} (${Number(amount) / 10 ** TOKEN_DECIMALS} ${TOKEN_SYMBOL})`);
    
    try {
      // Use writeContractAsync for better error handling
      const result = await writeContractAsync({
        address: tokenAddress as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [contractAddress as `0x${string}`, amount],
      } as any);
      console.log('✅ Approval transaction submitted:', result);
      return result;
    } catch (err: any) {
      console.error('❌ Failed to initiate approval:', err);
      if (err.cause) console.error('  Cause:', err.cause);
      if (err.details) console.error('  Details:', err.details);
      if (err.shortMessage) console.error('  Short message:', err.shortMessage);
      throw err;
    }
  };
  
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });
  
  return {
    approve,
    hash,
    isPending,
    isConfirming,
    isConfirmed,
    error,
    reset,
  };
}

/**
 * Hook to get token balance
 */
export function useTokenBalance() {
  const chainId = useChainId();
  const { address } = useAccount();
  const tokenAddress = TOKEN_ADDRESSES[chainId as keyof typeof TOKEN_ADDRESSES];
  
  const { data: balance, refetch } = useReadContract({
    address: tokenAddress as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address && !!tokenAddress,
      refetchInterval: 10000,
    },
  });
  
  return {
    balance: balance as bigint | undefined,
    balanceFormatted: balance ? Number(balance) / 10 ** TOKEN_DECIMALS : 0,
    refetch,
  };
}

/**
 * Hook to buy shares in a multi-outcome market using MIND token
 */
export function usePlaceBet() {
  const chainId = useChainId();
  const { address, isConnected, connector } = useAccount();
  const contractAddress = CONTRACT_ADDRESSES[chainId as keyof typeof CONTRACT_ADDRESSES];
  
  const { data: hash, isPending, writeContract, writeContractAsync, error, reset, status } = useWriteContract();
  
  // Log status changes for debugging
  useEffect(() => {
    if (status !== 'idle') {
      console.log(`🔄 usePlaceBet status: ${status}, hash: ${hash || 'none'}, error:`, error?.message || 'none');
    }
  }, [status, hash, error]);
  
  const placeBet = async (marketId: number, outcomeIndex: number, amount: string) => {
    if (!contractAddress || contractAddress === '0x0000000000000000000000000000000000000000') {
      console.error('❌ Contract not deployed on this network');
      throw new Error('Contract not deployed on this network');
    }
    
    if (!isConnected || !address) {
      console.error('❌ Wallet not connected');
      throw new Error('Wallet not connected');
    }
    
    console.log(`🔗 Connected wallet: ${address}, connector: ${connector?.name || 'unknown'}, chainId: ${chainId}`);
    
    // For multi-outcome market with MIND token:
    // marketId: blockchain market ID
    // outcomeIndex: 0-22 for intraday (23 buckets) or 0-41 for overnight (42 buckets)
    // amount: token amount (18 decimals)
    
    const amountInToken = parseUnits(amount, TOKEN_DECIMALS);
    // ProportionalMarketMIND signature: buyShares(uint256 marketId, uint8 outcomeIndex, uint256 amount, uint256 maxCost)
    // amount = tokens to spend, maxCost = slippage protection (add 1% for safety)
    const maxCost = amountInToken + (amountInToken / 100n); // 1% slippage tolerance
    
    console.log(`📝 Calling buyShares: marketId=${marketId}, outcomeIndex=${outcomeIndex}, amount=${amount} ${TOKEN_SYMBOL} (${amountInToken}), maxCost=${maxCost}`);
    console.log(`📍 Contract address: ${contractAddress}`);
    
    try {
      // Use writeContractAsync for better error handling
      const result = await writeContractAsync({
        address: contractAddress as `0x${string}`,
        abi: PREDICTION_MARKET_ABI,
        functionName: 'buyShares',
        args: [BigInt(marketId), outcomeIndex, amountInToken, maxCost],
      } as any);
      console.log('✅ Bet transaction submitted:', result);
      return result;
    } catch (err: any) {
      console.error('❌ Failed to initiate transaction:', err);
      // Log more details about the error
      if (err.cause) console.error('  Cause:', err.cause);
      if (err.details) console.error('  Details:', err.details);
      if (err.shortMessage) console.error('  Short message:', err.shortMessage);
      throw err;
    }
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
    reset,
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

/**
 * Hook to get liquidity in a specific bucket
 */
export function useBucketLiquidity(marketId: number | undefined, outcomeIndex: number | undefined) {
  const chainId = useChainId();
  // Default to Base Sepolia if not connected
  const activeChainId = chainId || 84532;
  const contractAddress = CONTRACT_ADDRESSES[activeChainId as keyof typeof CONTRACT_ADDRESSES];
  
  const { data, isLoading, error, refetch } = useReadContract({
    address: contractAddress as `0x${string}`,
    abi: PREDICTION_MARKET_ABI,
    functionName: 'getBucketData',
    args: marketId !== undefined && outcomeIndex !== undefined ? [BigInt(marketId), outcomeIndex] : undefined,
    chainId: 84532, // Explicitly use Base Sepolia
    query: {
      enabled: marketId !== undefined && outcomeIndex !== undefined,
      refetchInterval: 3000, // Refetch every 3 seconds
      staleTime: 0,
      gcTime: 1000,
    },
  });
  
  // getBucketData returns [bucketLiquidity, totalShares]
  const bucketData = data as [bigint, bigint] | undefined;
  
  return {
    liquidity: bucketData ? bucketData[0] : undefined,
    totalShares: bucketData ? bucketData[1] : undefined,
    isLoading,
    error,
    refetch,
  };
}




