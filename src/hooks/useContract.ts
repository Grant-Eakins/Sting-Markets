import { useWriteContract, useWaitForTransactionReceipt, useReadContract, useAccount as useWagmiAccount } from 'wagmi';
import { parseUnits } from 'viem';
import { PREDICTION_MARKET_ABI, CONTRACT_ADDRESSES, DUAL_COIN_CONTRACT_ADDRESSES, TOKEN_ADDRESSES, ERC20_ABI, TOKEN_DECIMALS, TOKEN_SYMBOL, LISTING_AUCTION_ADDRESSES, LISTING_AUCTION_ABI, MIND_TOKEN_ADDRESSES } from '@/config/contract';
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
export function useMarketProbabilities(marketId: number | undefined, isDualCoin: boolean = false) {
  const chainId = useChainId();
  // Default to Base Sepolia if not connected
  const activeChainId = chainId || 84532;
  const contractAddress = isDualCoin 
    ? DUAL_COIN_CONTRACT_ADDRESSES[activeChainId as keyof typeof DUAL_COIN_CONTRACT_ADDRESSES]
    : CONTRACT_ADDRESSES[activeChainId as keyof typeof CONTRACT_ADDRESSES];
  
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

/**
 * Hook to withdraw protocol fees from standard contract (admin only)
 */
export function useWithdrawFees() {
  const chainId = useChainId();
  const contractAddress = CONTRACT_ADDRESSES[chainId as keyof typeof CONTRACT_ADDRESSES];
  
  const { data: hash, isPending, writeContract, error } = useWriteContract();
  
  const withdrawFees = () => {
    if (!contractAddress) {
      throw new Error('Contract address not found');
    }
    
    console.log('📤 Withdrawing protocol fees from standard contract...');
    writeContract({
      address: contractAddress as `0x${string}`,
      abi: PREDICTION_MARKET_ABI,
      functionName: 'withdrawFees',
      args: [],
    } as any);
  };
  
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });
  
  return {
    withdrawFees,
    isPending,
    isConfirming,
    isConfirmed,
    error,
    hash,
  };
}

/**
 * Hook to withdraw protocol fees from dual coin contract (admin only)
 */
export function useWithdrawDualCoinFees() {
  const chainId = useChainId();
  const contractAddress = DUAL_COIN_CONTRACT_ADDRESSES[chainId as keyof typeof DUAL_COIN_CONTRACT_ADDRESSES];
  
  const { data: hash, isPending, writeContract, error } = useWriteContract();
  
  const withdrawFees = () => {
    if (!contractAddress) {
      throw new Error('Dual coin contract address not found');
    }
    
    console.log('📤 Withdrawing protocol fees from dual coin contract...');
    writeContract({
      address: contractAddress as `0x${string}`,
      abi: PREDICTION_MARKET_ABI,
      functionName: 'withdrawFees',
      args: [],
    } as any);
  };
  
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });
  
  return {
    withdrawFees,
    isPending,
    isConfirming,
    isConfirmed,
    error,
    hash,
  };
}

/**
 * Hook to read burn vault balance (from dual coin contract)
 */
export function useBurnVault() {
  const chainId = useChainId();
  const contractAddress = DUAL_COIN_CONTRACT_ADDRESSES[chainId as keyof typeof DUAL_COIN_CONTRACT_ADDRESSES];
  
  // Check if contract address is valid (not zero address)
  const isValidAddress = contractAddress && contractAddress !== '0x0000000000000000000000000000000000000000';
  
  const { data, isLoading, refetch, error } = useReadContract({
    address: contractAddress as `0x${string}`,
    abi: PREDICTION_MARKET_ABI,
    functionName: 'burnVault',
    query: {
      enabled: isValidAddress,
    },
  });
  
  // Debug logging
  console.log('🔥 useBurnVault:', { chainId, contractAddress, isValidAddress, data, isLoading, error: error?.message });
  
  return {
    burnVault: data as bigint | undefined,
    isLoading,
    refetch,
  };
}

/**
 * Hook to withdraw burn vault (admin only - from dual coin contract)
 */
export function useWithdrawBurnVault() {
  const chainId = useChainId();
  const contractAddress = DUAL_COIN_CONTRACT_ADDRESSES[chainId as keyof typeof DUAL_COIN_CONTRACT_ADDRESSES];
  
  const { data: hash, isPending, writeContract, error } = useWriteContract();
  
  const withdrawBurnVault = () => {
    if (!contractAddress) {
      throw new Error('Contract address not found');
    }
    
    console.log('🔥 Withdrawing burn vault from dual coin contract...');
    writeContract({
      address: contractAddress as `0x${string}`,
      abi: PREDICTION_MARKET_ABI,
      functionName: 'withdrawBurnVault',
      args: [],
    } as any);
  };
  
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });
  
  return {
    withdrawBurnVault,
    isPending,
    isConfirming,
    isConfirmed,
    error,
    hash,
  };
}

/**
 * Hook to withdraw from ListingAuction contract (admin only)
 */
export function useWithdrawAuctionFunds() {
  const chainId = useChainId();
  const auctionAddress = LISTING_AUCTION_ADDRESSES[chainId as keyof typeof LISTING_AUCTION_ADDRESSES];
  
  const { data: hash, isPending, writeContract, error } = useWriteContract();
  
  const withdrawAuctionFunds = () => {
    if (!auctionAddress || auctionAddress === '0x0000000000000000000000000000000000000000') {
      throw new Error('Auction contract not deployed');
    }
    
    console.log('💰 Withdrawing auction funds to treasury...');
    writeContract({
      address: auctionAddress as `0x${string}`,
      abi: LISTING_AUCTION_ABI,
      functionName: 'emergencyWithdraw',
      args: [],
    } as any);
  };
  
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });
  
  return {
    withdrawAuctionFunds,
    isPending,
    isConfirming,
    isConfirmed,
    error,
    hash,
    auctionAddress,
  };
}

/**
 * Hook to read protocol fees collected from standard contract
 */
export function useProtocolFees() {
  const chainId = useChainId();
  const contractAddress = CONTRACT_ADDRESSES[chainId as keyof typeof CONTRACT_ADDRESSES];
  
  const { data, isLoading, error, refetch } = useReadContract({
    address: contractAddress as `0x${string}`,
    abi: PREDICTION_MARKET_ABI,
    functionName: 'protocolFeesCollected',
    chainId: chainId || 84532,
    query: {
      enabled: !!contractAddress,
      refetchInterval: 5000,
    },
  });
  
  return {
    feesCollected: data as bigint | undefined,
    isLoading,
    error,
    refetch,
  };
}

/**
 * Hook to read protocol fees collected from dual coin contract
 */
export function useDualCoinProtocolFees() {
  const chainId = useChainId();
  const contractAddress = DUAL_COIN_CONTRACT_ADDRESSES[chainId as keyof typeof DUAL_COIN_CONTRACT_ADDRESSES];
  
  const { data, isLoading, error, refetch } = useReadContract({
    address: contractAddress as `0x${string}`,
    abi: PREDICTION_MARKET_ABI,
    functionName: 'protocolFeesCollected',
    chainId: chainId || 84532,
    query: {
      enabled: !!contractAddress,
      refetchInterval: 5000,
    },
  });
  
  return {
    feesCollected: data as bigint | undefined,
    isLoading,
    error,
    refetch,
  };
}

/**
 * Hook to read max bet size
 */
export function useMaxBetSize() {
  const chainId = useChainId();
  const contractAddress = DUAL_COIN_CONTRACT_ADDRESSES[chainId as keyof typeof DUAL_COIN_CONTRACT_ADDRESSES];
  
  const { data, isLoading, error, refetch } = useReadContract({
    address: contractAddress as `0x${string}`,
    abi: PREDICTION_MARKET_ABI,
    functionName: 'maxBetSize',
    chainId: chainId || 84532,
    query: {
      enabled: !!contractAddress,
      refetchInterval: 10000,
    },
  });
  
  return {
    maxBetSize: data as bigint | undefined,
    isLoading,
    error,
    refetch,
  };
}

/**
 * Hook to set max bet size (admin only)
 */
export function useSetMaxBetSize() {
  const chainId = useChainId();
  const contractAddress = DUAL_COIN_CONTRACT_ADDRESSES[chainId as keyof typeof DUAL_COIN_CONTRACT_ADDRESSES];
  
  console.log('🔧 useSetMaxBetSize: chainId=', chainId, 'contractAddress=', contractAddress);
  
  const { data: hash, isPending, writeContractAsync, error, reset } = useWriteContract();
  
  const setMaxBetSize = async (newMaxBet: bigint) => {
    if (!contractAddress) {
      throw new Error('Contract address not found');
    }
    
    console.log('📝 Setting max bet size to:', newMaxBet.toString());
    console.log('📝 Target contract:', contractAddress);
    console.log('📝 Expected: 0xBc6b9a31AB377D1FF73080F83E30D1e6868B2868');
    return writeContractAsync({
      address: contractAddress as `0x${string}`,
      abi: PREDICTION_MARKET_ABI,
      functionName: 'setMaxBetSize',
      args: [newMaxBet],
    } as any);
  };
  
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });
  
  return {
    setMaxBetSize,
    isPending,
    isConfirming,
    isConfirmed,
    error,
    hash,
    reset,
  };
}

/**
 * Hook to read burn configuration
 */
export function useBurnConfig() {
  const chainId = useChainId();
  const contractAddress = CONTRACT_ADDRESSES[chainId as keyof typeof CONTRACT_ADDRESSES];
  
  const { data: burnEnabled, isLoading: loadingEnabled, refetch: refetchEnabled } = useReadContract({
    address: contractAddress as `0x${string}`,
    abi: PREDICTION_MARKET_ABI,
    functionName: 'burnEnabled',
    chainId: chainId || 84532,
    query: {
      enabled: !!contractAddress,
      refetchInterval: 10000,
    },
  });
  
  const { data: totalBurned, isLoading: loadingBurned, refetch: refetchBurned } = useReadContract({
    address: contractAddress as `0x${string}`,
    abi: PREDICTION_MARKET_ABI,
    functionName: 'totalBurned',
    chainId: chainId || 84532,
    query: {
      enabled: !!contractAddress,
      refetchInterval: 10000,
    },
  });
  
  const { data: utilityToken, isLoading: loadingToken, refetch: refetchToken } = useReadContract({
    address: contractAddress as `0x${string}`,
    abi: PREDICTION_MARKET_ABI,
    functionName: 'utilityToken',
    chainId: chainId || 84532,
    query: {
      enabled: !!contractAddress,
      refetchInterval: 10000,
    },
  });
  
  const { data: uniswapRouter, isLoading: loadingRouter, refetch: refetchRouter } = useReadContract({
    address: contractAddress as `0x${string}`,
    abi: PREDICTION_MARKET_ABI,
    functionName: 'uniswapRouter',
    chainId: chainId || 84532,
    query: {
      enabled: !!contractAddress,
      refetchInterval: 10000,
    },
  });
  
  const refetch = () => {
    refetchEnabled();
    refetchBurned();
    refetchToken();
    refetchRouter();
  };
  
  return {
    burnEnabled: burnEnabled as boolean | undefined,
    totalBurned: totalBurned as bigint | undefined,
    utilityToken: utilityToken as string | undefined,
    uniswapRouter: uniswapRouter as string | undefined,
    isLoading: loadingEnabled || loadingBurned || loadingToken || loadingRouter,
    refetch,
  };
}

/**
 * Hook to configure burn mechanism (admin only)
 */
export function useConfigureBurn() {
  const chainId = useChainId();
  const contractAddress = CONTRACT_ADDRESSES[chainId as keyof typeof CONTRACT_ADDRESSES];
  
  const { data: hash, isPending, writeContractAsync, error, reset } = useWriteContract();
  
  const configureBurn = async (utilityToken: string, router: string, enabled: boolean) => {
    if (!contractAddress) {
      throw new Error('Contract address not found');
    }
    
    console.log('🔥 Configuring burn:', { utilityToken, router, enabled });
    return writeContractAsync({
      address: contractAddress as `0x${string}`,
      abi: PREDICTION_MARKET_ABI,
      functionName: 'configureBurn',
      args: [utilityToken as `0x${string}`, router as `0x${string}`, enabled],
    } as any);
  };
  
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });
  
  return {
    configureBurn,
    isPending,
    isConfirming,
    isConfirmed,
    error,
    hash,
    reset,
  };
}

// ============================================
// DUAL COIN CONTRACT HOOKS
// ============================================

/**
 * Hook to check token allowance for dual coin contract
 */
export function useDualCoinTokenAllowance() {
  const chainId = useChainId();
  const { address } = useAccount();
  const contractAddress = DUAL_COIN_CONTRACT_ADDRESSES[chainId as keyof typeof DUAL_COIN_CONTRACT_ADDRESSES];
  const tokenAddress = TOKEN_ADDRESSES[chainId as keyof typeof TOKEN_ADDRESSES];
  
  const { data: allowance, refetch } = useReadContract({
    address: tokenAddress as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address && contractAddress ? [address, contractAddress as `0x${string}`] : undefined,
    query: {
      enabled: !!address && !!contractAddress && !!tokenAddress,
    },
  });
  
  return {
    allowance: allowance as bigint | undefined,
    refetch,
  };
}

/**
 * Hook to approve token spending for dual coin contract
 */
export function useDualCoinTokenApproval() {
  const chainId = useChainId();
  const { address, isConnected, connector } = useAccount();
  const contractAddress = DUAL_COIN_CONTRACT_ADDRESSES[chainId as keyof typeof DUAL_COIN_CONTRACT_ADDRESSES];
  const tokenAddress = TOKEN_ADDRESSES[chainId as keyof typeof TOKEN_ADDRESSES];
  
  const { data: hash, isPending, writeContractAsync, error, reset, status } = useWriteContract();
  
  const approve = async (amount: bigint) => {
    if (!contractAddress || !tokenAddress) {
      throw new Error('Contract addresses not available');
    }
    
    if (!isConnected || !address) {
      throw new Error('Wallet not connected');
    }
    
    console.log(`📝 Approving ${amount} for dual coin contract ${contractAddress}`);
    
    return writeContractAsync({
      address: tokenAddress as `0x${string}`,
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
    reset,
  };
}

/**
 * Hook to buy shares in dual coin market
 */
export function useDualCoinPlaceBet() {
  const chainId = useChainId();
  const { address, isConnected, connector } = useAccount();
  const contractAddress = DUAL_COIN_CONTRACT_ADDRESSES[chainId as keyof typeof DUAL_COIN_CONTRACT_ADDRESSES];
  
  const { data: hash, isPending, writeContractAsync, error, reset, status } = useWriteContract();
  
  useEffect(() => {
    if (status !== 'idle') {
      console.log(`🔄 useDualCoinPlaceBet status: ${status}, hash: ${hash || 'none'}, error:`, error?.message || 'none');
    }
  }, [status, hash, error]);
  
  const placeBet = async (marketId: number, outcomeIndex: number, amount: string) => {
    if (!contractAddress || contractAddress === '0x0000000000000000000000000000000000000000') {
      throw new Error('Dual coin contract not deployed on this network');
    }
    
    if (!isConnected || !address) {
      throw new Error('Wallet not connected');
    }
    
    const amountInToken = parseUnits(amount, TOKEN_DECIMALS);
    const maxCost = amountInToken + (amountInToken / 100n); // 1% slippage
    
    console.log(`🎯 Dual coin bet: marketId=${marketId}, outcomeIndex=${outcomeIndex}, amount=${amount} ${TOKEN_SYMBOL}`);
    console.log(`📍 Dual coin contract: ${contractAddress}`);
    
    return writeContractAsync({
      address: contractAddress as `0x${string}`,
      abi: PREDICTION_MARKET_ABI,
      functionName: 'buyShares',
      args: [BigInt(marketId), BigInt(outcomeIndex), amountInToken, maxCost],
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
    reset,
  };
}

/**
 * Hook to check MIND token allowance for auction contract
 */
export function useAuctionTokenAllowance() {
  const chainId = useChainId();
  const { address } = useAccount();
  const auctionAddress = LISTING_AUCTION_ADDRESSES[chainId as keyof typeof LISTING_AUCTION_ADDRESSES];
  const mindTokenAddress = MIND_TOKEN_ADDRESSES[chainId as keyof typeof MIND_TOKEN_ADDRESSES];
  
  const { data: allowance, refetch } = useReadContract({
    address: mindTokenAddress as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address && auctionAddress ? [address, auctionAddress as `0x${string}`] : undefined,
    query: {
      enabled: !!address && !!auctionAddress && !!mindTokenAddress,
    },
  });
  
  return {
    allowance: allowance as bigint | undefined,
    refetch,
  };
}

/**
 * Hook to approve MIND tokens for auction contract
 */
export function useAuctionTokenApproval() {
  const chainId = useChainId();
  const auctionAddress = LISTING_AUCTION_ADDRESSES[chainId as keyof typeof LISTING_AUCTION_ADDRESSES];
  const mindTokenAddress = MIND_TOKEN_ADDRESSES[chainId as keyof typeof MIND_TOKEN_ADDRESSES];
  
  const { data: hash, isPending, writeContract, error } = useWriteContract();
  
  const approve = (amount: string) => {
    if (!auctionAddress || !mindTokenAddress) {
      throw new Error('Auction or MIND token address not found');
    }
    
    const amountInToken = parseUnits(amount, 18); // MIND has 18 decimals
    
    console.log(`✅ Approving ${amount} MIND for auction contract`);
    writeContract({
      address: mindTokenAddress as `0x${string}`,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [auctionAddress as `0x${string}`, amountInToken],
    } as any);
  };
  
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });
  
  return {
    approve,
    isPending,
    isConfirming,
    isConfirmed,
    error,
    hash,
  };
}

/**
 * Hook to submit auction bid on-chain
 */
export function useSubmitAuctionBid() {
  const chainId = useChainId();
  const auctionAddress = LISTING_AUCTION_ADDRESSES[chainId as keyof typeof LISTING_AUCTION_ADDRESSES];
  
  const { data: hash, isPending, writeContract, error } = useWriteContract();
  
  const submitBid = (coinAddress: string, chain: string, amount: string) => {
    if (!auctionAddress || auctionAddress === '0x0000000000000000000000000000000000000000') {
      throw new Error('Auction contract not deployed');
    }
    
    const amountInToken = parseUnits(amount, 18); // MIND has 18 decimals
    
    console.log(`🏆 Submitting auction bid: ${coinAddress} (${chain}) - ${amount} MIND`);
    writeContract({
      address: auctionAddress as `0x${string}`,
      abi: LISTING_AUCTION_ABI,
      functionName: 'submitBid',
      args: [coinAddress, chain, amountInToken],
    } as any);
  };
  
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });
  
  return {
    submitBid,
    isPending,
    isConfirming,
    isConfirmed,
    error,
    hash,
  };
}

/**
 * Hook to read auction config from contract
 */
export function useAuctionConfig() {
  const chainId = useChainId();
  const auctionAddress = LISTING_AUCTION_ADDRESSES[chainId as keyof typeof LISTING_AUCTION_ADDRESSES];
  
  const { data, isLoading, error, refetch } = useReadContract({
    address: auctionAddress as `0x${string}`,
    abi: LISTING_AUCTION_ABI,
    functionName: 'config',
    query: {
      enabled: !!auctionAddress && auctionAddress !== '0x0000000000000000000000000000000000000000',
    },
  });
  
  return {
    config: data as any,
    isLoading,
    error,
    refetch,
  };
}

/**
 * Hook to get auction leaderboard from contract
 */
export function useAuctionLeaderboard(limit: number = 50) {
  const chainId = useChainId();
  const auctionAddress = LISTING_AUCTION_ADDRESSES[chainId as keyof typeof LISTING_AUCTION_ADDRESSES];
  
  const { data, isLoading, error, refetch } = useReadContract({
    address: auctionAddress as `0x${string}`,
    abi: LISTING_AUCTION_ABI,
    functionName: 'getLeaderboard',
    args: [BigInt(limit)],
    query: {
      enabled: !!auctionAddress && auctionAddress !== '0x0000000000000000000000000000000000000000',
    },
  });
  
  // Parse the returned data
  const leaderboard = data ? (() => {
    const [bidIds, bidders, coinAddresses, chains, amounts] = data as [bigint[], `0x${string}`[], string[], string[], bigint[]];
    return bidIds.map((id, i) => ({
      id: id.toString(),
      bidder: bidders[i],
      coinAddress: coinAddresses[i],
      chain: chains[i],
      amount: amounts[i].toString(),
      rank: i + 1,
    }));
  })() : [];
  
  return {
    leaderboard,
    isLoading,
    error,
    refetch,
  };
}

/**
 * Hook to get total bid count from contract
 */
export function useAuctionTotalBids() {
  const chainId = useChainId();
  const auctionAddress = LISTING_AUCTION_ADDRESSES[chainId as keyof typeof LISTING_AUCTION_ADDRESSES];
  
  const { data, isLoading, error, refetch } = useReadContract({
    address: auctionAddress as `0x${string}`,
    abi: LISTING_AUCTION_ABI,
    functionName: 'getTotalBids',
    query: {
      enabled: !!auctionAddress && auctionAddress !== '0x0000000000000000000000000000000000000000',
    },
  });
  
  return {
    totalBids: data ? Number(data) : 0,
    isLoading,
    error,
    refetch,
  };
}

/**
 * Hook to read the current bidding token address
 */
export function useBiddingToken() {
  const chainId = useChainId();
  const auctionAddress = LISTING_AUCTION_ADDRESSES[chainId as keyof typeof LISTING_AUCTION_ADDRESSES];
  
  const { data, isLoading, error, refetch } = useReadContract({
    address: auctionAddress as `0x${string}`,
    abi: LISTING_AUCTION_ABI,
    functionName: 'biddingToken',
    query: {
      enabled: !!auctionAddress && auctionAddress !== '0x0000000000000000000000000000000000000000',
    },
  });
  
  return {
    tokenAddress: data as `0x${string}` | undefined,
    isLoading,
    error,
    refetch,
  };
}

/**
 * Hook to read token symbol from any ERC20 contract
 */
export function useTokenSymbol(tokenAddress: `0x${string}` | undefined) {
  const { data, isLoading } = useReadContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'symbol',
    query: {
      enabled: !!tokenAddress && tokenAddress !== '0x0000000000000000000000000000000000000000',
    },
  });
  
  return {
    symbol: data as string | undefined,
    isLoading,
  };
}

/**
 * Hook to update bidding token (admin only)
 */
export function useUpdateBiddingToken() {
  const chainId = useChainId();
  const auctionAddress = LISTING_AUCTION_ADDRESSES[chainId as keyof typeof LISTING_AUCTION_ADDRESSES];
  
  const { data: hash, isPending, writeContract, error } = useWriteContract();
  
  const updateBiddingToken = (newTokenAddress: string) => {
    if (!auctionAddress || auctionAddress === '0x0000000000000000000000000000000000000000') {
      throw new Error('Auction contract not deployed');
    }
    
    if (!newTokenAddress || !/^0x[a-fA-F0-9]{40}$/.test(newTokenAddress)) {
      throw new Error('Invalid token address');
    }
    
    console.log(`🔄 Updating bidding token to: ${newTokenAddress}`);
    writeContract({
      address: auctionAddress as `0x${string}`,
      abi: LISTING_AUCTION_ABI,
      functionName: 'updateBiddingToken',
      args: [newTokenAddress as `0x${string}`],
    } as any);
  };
  
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });
  
  return {
    updateBiddingToken,
    isPending,
    isConfirming,
    isConfirmed,
    error,
    hash,
  };
}

/**
 * Hook to update auction config (admin only)
 */
export function useUpdateAuctionConfig() {
  const chainId = useChainId();
  const auctionAddress = LISTING_AUCTION_ADDRESSES[chainId as keyof typeof LISTING_AUCTION_ADDRESSES];
  
  const { data: hash, isPending, writeContract, error } = useWriteContract();
  
  const updateConfig = (minBidAmount: string, minMarketCap: string, maxMarketCap: string) => {
    if (!auctionAddress || auctionAddress === '0x0000000000000000000000000000000000000000') {
      throw new Error('Auction contract not deployed');
    }
    
    const minBidInWei = parseUnits(minBidAmount, 18); // MIND has 18 decimals
    const minMarketCapNum = BigInt(Math.floor(parseFloat(minMarketCap)));
    const maxMarketCapNum = BigInt(Math.floor(parseFloat(maxMarketCap)));
    
    console.log(`⚙️ Updating auction config: minBid=${minBidAmount} MIND, minMC=${minMarketCap}, maxMC=${maxMarketCap}`);
    writeContract({
      address: auctionAddress as `0x${string}`,
      abi: LISTING_AUCTION_ABI,
      functionName: 'updateConfig',
      args: [minBidInWei, minMarketCapNum, maxMarketCapNum],
    } as any);
  };
  
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });
  
  return {
    updateConfig,
    isPending,
    isConfirming,
    isConfirmed,
    error,
    hash,
  };
}

/**
 * Hook to start auction (admin only)
 */
export function useStartAuction() {
  const chainId = useChainId();
  const auctionAddress = LISTING_AUCTION_ADDRESSES[chainId as keyof typeof LISTING_AUCTION_ADDRESSES];
  
  const { data: hash, isPending, writeContract, error } = useWriteContract();
  
  const startAuction = (durationHours: number) => {
    if (!auctionAddress || auctionAddress === '0x0000000000000000000000000000000000000000') {
      throw new Error('Auction contract not deployed');
    }
    
    console.log(`🎪 Starting auction for ${durationHours} hours`);
    writeContract({
      address: auctionAddress as `0x${string}`,
      abi: LISTING_AUCTION_ABI,
      functionName: 'startAuction',
      args: [BigInt(durationHours)],
    } as any);
  };
  
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });
  
  return {
    startAuction,
    isPending,
    isConfirming,
    isConfirmed,
    error,
    hash,
  };
}

/**
 * Hook to stop auction (admin only)
 */
export function useStopAuction() {
  const chainId = useChainId();
  const auctionAddress = LISTING_AUCTION_ADDRESSES[chainId as keyof typeof LISTING_AUCTION_ADDRESSES];
  
  const { data: hash, isPending, writeContract, error } = useWriteContract();
  
  const stopAuction = () => {
    if (!auctionAddress || auctionAddress === '0x0000000000000000000000000000000000000000') {
      throw new Error('Auction contract not deployed');
    }
    
    console.log('🛑 Stopping auction');
    writeContract({
      address: auctionAddress as `0x${string}`,
      abi: LISTING_AUCTION_ABI,
      functionName: 'stopAuction',
      args: [],
    } as any);
  };
  
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });
  
  return {
    stopAuction,
    isPending,
    isConfirming,
    isConfirmed,
    error,
    hash,
  };
}

/**
 * Hook to finalize auction (admin only)
 */
export function useFinalizeAuction() {
  const chainId = useChainId();
  const auctionAddress = LISTING_AUCTION_ADDRESSES[chainId as keyof typeof LISTING_AUCTION_ADDRESSES];
  
  const { data: hash, isPending, writeContract, error } = useWriteContract();
  
  const finalizeAuction = (winningBidIds: number[]) => {
    if (!auctionAddress || auctionAddress === '0x0000000000000000000000000000000000000000') {
      throw new Error('Auction contract not deployed');
    }
    
    if (winningBidIds.length !== 2) {
      throw new Error('Must provide exactly 2 winning bid IDs');
    }
    
    console.log(`🏆 Finalizing auction with winners: ${winningBidIds.join(', ')}`);
    writeContract({
      address: auctionAddress as `0x${string}`,
      abi: LISTING_AUCTION_ABI,
      functionName: 'finalizeAuction',
      args: [winningBidIds.map(id => BigInt(id))],
    } as any);
  };
  
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });
  
  return {
    finalizeAuction,
    isPending,
    isConfirming,
    isConfirmed,
    error,
    hash,
  };
}

/**
 * Hook to get bucket liquidity for dual coin market
 */
export function useDualCoinBucketLiquidity(marketId: number | undefined, outcomeIndex: number | undefined) {
  const chainId = useChainId();
  const activeChainId = chainId || 84532;
  const contractAddress = DUAL_COIN_CONTRACT_ADDRESSES[activeChainId as keyof typeof DUAL_COIN_CONTRACT_ADDRESSES];
  
  const { data, isLoading, error, refetch } = useReadContract({
    address: contractAddress as `0x${string}`,
    abi: PREDICTION_MARKET_ABI,
    functionName: 'getBucketData',
    args: marketId !== undefined && outcomeIndex !== undefined ? [BigInt(marketId), outcomeIndex] : undefined,
    chainId: 84532,
    query: {
      enabled: marketId !== undefined && outcomeIndex !== undefined,
      refetchInterval: 3000,
      staleTime: 0,
      gcTime: 1000,
    },
  });
  
  const bucketData = data as [bigint, bigint] | undefined;
  
  return {
    liquidity: bucketData ? bucketData[0] : undefined,
    totalShares: bucketData ? bucketData[1] : undefined,
    isLoading,
    error,
    refetch,
  };
}

/**
 * Hook to finalize auction on-chain (admin only)
 * This refunds all losing bids and burns 20% of winning bids
 */
export function useFinalizeAuction() {
  const chainId = useChainId();
  const auctionAddress = LISTING_AUCTION_ADDRESSES[chainId as keyof typeof LISTING_AUCTION_ADDRESSES];
  
  const { data: hash, isPending, writeContract, error } = useWriteContract();
  
  const finalizeAuction = (winningBidIds: [bigint, bigint]) => {
    if (!auctionAddress || auctionAddress === '0x0000000000000000000000000000000000000000') {
      throw new Error('Auction contract not deployed');
    }
    
    console.log(`🏆 Finalizing auction with winners: ${winningBidIds[0]}, ${winningBidIds[1]}`);
    writeContract({
      address: auctionAddress as `0x${string}`,
      abi: LISTING_AUCTION_ABI,
      functionName: 'finalizeAuction',
      args: [winningBidIds],
    } as any);
  };
  
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });
  
  return {
    finalizeAuction,
    isPending,
    isConfirming,
    isConfirmed,
    error,
    hash,
  };
}

/**
 * Hook to refund a single bid (user or admin)
 * Users can call this to get their tokens back after auction ends
 */
export function useRefundBid() {
  const chainId = useChainId();
  const auctionAddress = LISTING_AUCTION_ADDRESSES[chainId as keyof typeof LISTING_AUCTION_ADDRESSES];
  
  const { data: hash, isPending, writeContract, error } = useWriteContract();
  
  const refundBid = (bidId: bigint) => {
    if (!auctionAddress || auctionAddress === '0x0000000000000000000000000000000000000000') {
      throw new Error('Auction contract not deployed');
    }
    
    console.log(`💸 Refunding bid ID: ${bidId}`);
    writeContract({
      address: auctionAddress as `0x${string}`,
      abi: LISTING_AUCTION_ABI,
      functionName: 'refundBid',
      args: [bidId],
    } as any);
  };
  
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });
  
  return {
    refundBid,
    isPending,
    isConfirming,
    isConfirmed,
    error,
    hash,
  };
}

/**
 * Hook to get user's bids from contract
 */
export function useUserAuctionBids(userAddress: `0x${string}` | undefined) {
  const chainId = useChainId();
  const auctionAddress = LISTING_AUCTION_ADDRESSES[chainId as keyof typeof LISTING_AUCTION_ADDRESSES];
  
  const { data, isLoading, error, refetch } = useReadContract({
    address: auctionAddress as `0x${string}`,
    abi: LISTING_AUCTION_ABI,
    functionName: 'getBidsByAddress',
    args: userAddress ? [userAddress] : undefined,
    query: {
      enabled: !!auctionAddress && auctionAddress !== '0x0000000000000000000000000000000000000000' && !!userAddress,
    },
  });
  
  return {
    bidIds: data as bigint[] | undefined,
    isLoading,
    error,
    refetch,
  };
}

/**
 * Hook to get bid details by ID
 */
export function useAuctionBidDetails(bidId: bigint | undefined) {
  const chainId = useChainId();
  const auctionAddress = LISTING_AUCTION_ADDRESSES[chainId as keyof typeof LISTING_AUCTION_ADDRESSES];
  
  const { data, isLoading, error, refetch } = useReadContract({
    address: auctionAddress as `0x${string}`,
    abi: LISTING_AUCTION_ABI,
    functionName: 'bids',
    args: bidId !== undefined ? [bidId] : undefined,
    query: {
      enabled: !!auctionAddress && auctionAddress !== '0x0000000000000000000000000000000000000000' && bidId !== undefined,
    },
  });
  
  // bids returns: (address bidder, string coinContractAddress, string chain, uint256 amount, uint256 timestamp, bool refunded)
  const bidData = data as [string, string, string, bigint, bigint, boolean] | undefined;
  
  return {
    bid: bidData ? {
      bidder: bidData[0],
      coinContractAddress: bidData[1],
      chain: bidData[2],
      amount: bidData[3],
      timestamp: bidData[4],
      refunded: bidData[5],
    } : undefined,
    isLoading,
    error,
    refetch,
  };
}
