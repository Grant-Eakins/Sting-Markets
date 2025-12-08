import { useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi';
import { parseUnits } from 'viem';
import { PREDICTION_MARKET_ABI, CONTRACT_ADDRESSES, USDC_ADDRESSES, ERC20_ABI, USDC_DECIMALS } from '@/config/contract';
import { useChainId, useAccount } from 'wagmi';
import { useState, useCallback } from 'react';

export enum Position {
  UP = 0,
  DOWN = 1,
}

/**
 * Hook to check USDC allowance
 */
export function useUsdcAllowance() {
  const chainId = useChainId();
  const { address } = useAccount();
  const contractAddress = CONTRACT_ADDRESSES[chainId as keyof typeof CONTRACT_ADDRESSES];
  const usdcAddress = USDC_ADDRESSES[chainId as keyof typeof USDC_ADDRESSES];
  
  const { data: allowance, refetch } = useReadContract({
    address: usdcAddress as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address && contractAddress ? [address, contractAddress as `0x${string}`] : undefined,
    query: {
      enabled: !!address && !!contractAddress,
    },
  });
  
  return {
    allowance: allowance as bigint | undefined,
    refetch,
  };
}

/**
 * Hook to approve USDC spending
 */
export function useUsdcApproval() {
  const chainId = useChainId();
  const contractAddress = CONTRACT_ADDRESSES[chainId as keyof typeof CONTRACT_ADDRESSES];
  const usdcAddress = USDC_ADDRESSES[chainId as keyof typeof USDC_ADDRESSES];
  
  const { data: hash, isPending, writeContract, error } = useWriteContract();
  
  const approve = (amount: bigint) => {
    if (!contractAddress || !usdcAddress) {
      throw new Error('Contract addresses not available');
    }
    
    console.log(`📝 Approving USDC: amount=${amount}, spender=${contractAddress}`);
    
    writeContract({
      address: usdcAddress as `0x${string}`,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [contractAddress as `0x${string}`, amount],
    } as any);
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
  };
}

/**
 * Hook to get USDC balance
 */
export function useUsdcBalance() {
  const chainId = useChainId();
  const { address } = useAccount();
  const usdcAddress = USDC_ADDRESSES[chainId as keyof typeof USDC_ADDRESSES];
  
  const { data: balance, refetch } = useReadContract({
    address: usdcAddress as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address && !!usdcAddress,
      refetchInterval: 10000,
    },
  });
  
  return {
    balance: balance as bigint | undefined,
    balanceFormatted: balance ? Number(balance) / 10 ** USDC_DECIMALS : 0,
    refetch,
  };
}

/**
 * Hook to buy shares in a multi-outcome market using USDC
 */
export function usePlaceBet() {
  const chainId = useChainId();
  const contractAddress = CONTRACT_ADDRESSES[chainId as keyof typeof CONTRACT_ADDRESSES];
  
  const { data: hash, isPending, writeContract, error } = useWriteContract();
  
  const placeBet = (marketId: number, outcomeIndex: number, amount: string) => {
    if (!contractAddress || contractAddress === '0x0000000000000000000000000000000000000000') {
      throw new Error('Contract not deployed on this network');
    }
    
    // For multi-outcome LMSR market with USDC:
    // marketId: blockchain market ID
    // outcomeIndex: 0-21 for intraday (22 buckets) or 0-41 for overnight (42 buckets)
    // amount: USDC amount (6 decimals)
    
    const amountInUsdc = parseUnits(amount, USDC_DECIMALS);
    // ProportionalMarketUSDC uses bonding curve - quantity param is ignored
    // Contract pulls USDC via transferFrom and calculates shares based on amount
    const quantity = BigInt(1); // Placeholder - contract ignores this
    const maxCost = amountInUsdc; // Use amount as max cost (slippage protection)
    
    console.log(`📝 Calling buyShares: marketId=${marketId}, outcomeIndex=${outcomeIndex}, amount=${amount} USDC`);
    
    // Note: No 'value' field - USDC uses approve + transferFrom, not ETH
    writeContract({
      address: contractAddress as `0x${string}`,
      abi: PREDICTION_MARKET_ABI,
      functionName: 'buyShares',
      args: [BigInt(marketId), outcomeIndex, quantity, maxCost],
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


