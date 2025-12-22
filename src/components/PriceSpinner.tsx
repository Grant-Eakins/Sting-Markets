import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TrendingUp, TrendingDown, DollarSign, Loader2, CheckCircle2, Share2 } from 'lucide-react';
import { cn, formatCryptoPrice } from '@/lib/utils';
import { usePlaceBet, useTokenAllowance, useTokenApproval, useTokenBalance } from '@/hooks/useContract';
import { useAccount, useChainId } from 'wagmi';
import { CONTRACT_ADDRESSES, TOKEN_DECIMALS, TOKEN_SYMBOL } from '@/config/contract';
import { parseUnits } from 'viem';
import sdk from '@farcaster/frame-sdk';
import { useFarcasterAuth } from '@/hooks/useFarcasterAuth';

interface PriceLevel {
  price: number;
  percentChange: number;
  liquidity: number;
  probability: number;
  bucketIndex: number; // Actual contract bucket index
}

interface PriceSpinnerProps {
  currentPrice: number; // in cents (or micro-units for meme coins)
  openingPrice: number; // in cents (or micro-units for meme coins)
  upPool: number;
  downPool: number;
  isAfterHours: boolean;
  probabilities?: number[]; // Probabilities from blockchain (0-100% per bucket)
  blockchainMarketId?: number;
  symbol?: string; // Market symbol for sharing (e.g. "BTC", "ETH")
  category?: string; // 'meme' for meme coins with tiny prices
  onBetPlaced?: () => void;
  onBet: (bucketIndex: number, percentChange: number, targetPrice: number, amount: number) => void;
}

export function PriceSpinner({ 
  currentPrice, 
  openingPrice,
  upPool, 
  downPool, 
  isAfterHours,
  probabilities,
  blockchainMarketId,
  symbol,
  category,
  onBetPlaced,
  onBet 
}: PriceSpinnerProps) {
  const [betAmount, setBetAmount] = useState('5'); // Default 5 tokens
  const [selectedLevel, setSelectedLevel] = useState<number | null>(null);
  const [searchPrice, setSearchPrice] = useState('');
  const [needsApproval, setNeedsApproval] = useState(false);
  const [lastBetDetails, setLastBetDetails] = useState<{ percentChange: number; targetPrice: number } | null>(null);
  const hasScrolled = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Farcaster client detection
  const { isInFarcasterClient } = useFarcasterAuth();
  
  // Token hooks
  const { balance: tokenBalance, balanceFormatted: tokenBalanceFormatted } = useTokenBalance();
  const { allowance, refetch: refetchAllowance } = useTokenAllowance();
  const { approve: approveToken, isPending: isApproving, isConfirming: isApprovalConfirming, isConfirmed: isApprovalConfirmed, error: approvalError } = useTokenApproval();

  // Share bet on Farcaster
  const shareBetOnFarcaster = async () => {
    if (!lastBetDetails || !symbol) return;
    
    const { percentChange, targetPrice } = lastBetDetails;
    const direction = percentChange >= 0 ? 'up' : 'down';
    const sign = percentChange >= 0 ? '+' : '';
    const priceFormatted = formatCryptoPrice(targetPrice);
    
    const castText = `🎯 Just made a prediction on @stingmarkets!\n\n$${symbol} will go ${direction} ${sign}${percentChange.toFixed(1)}% to $${priceFormatted}\n\nThink you can do better? Make your prediction 👇`;
    
    try {
      // Use Farcaster SDK to open cast composer with miniapp link
      await sdk.actions.openUrl(`https://warpcast.com/~/compose?text=${encodeURIComponent(castText)}&embeds[]=https://farcaster.xyz/miniapps/Qk-jqzie7XlI/sting-markets`);
    } catch (error) {
      console.error('Failed to open Farcaster composer:', error);
      // Fallback: copy to clipboard
      navigator.clipboard.writeText(castText);
      alert('Cast text copied to clipboard!');
    }
  };

  // Reset scroll flag when market changes so it re-centers
  useEffect(() => {
    hasScrolled.current = false;
  }, [blockchainMarketId, openingPrice]);

  // Click outside handler to deselect bucket
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setSelectedLevel(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Wallet and contract hooks
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { placeBet: placeBetOnChain, isPending, isConfirming, isConfirmed, error: contractError, hash: txHash } = usePlaceBet();
  
  const activeChainId = chainId || 84532;
  const contractAddress = CONTRACT_ADDRESSES[activeChainId as keyof typeof CONTRACT_ADDRESSES];
  const isContractDeployed = contractAddress && contractAddress !== '0x0000000000000000000000000000000000000000';

  // Debug logging
  useEffect(() => {
    console.log('🎰 PriceSpinner debug:', {
      blockchainMarketId,
      isContractDeployed,
      contractAddress,
      chainId,
      isConnected,
      address,
    });
  }, [blockchainMarketId, isContractDeployed, contractAddress, chainId, isConnected, address]);

  // Log transaction status
  useEffect(() => {
    if (txHash) {
      console.log(`🔗 Transaction hash: ${txHash}`);
      console.log(`🔗 View on BaseScan: https://sepolia.basescan.org/tx/${txHash}`);
    }
    if (contractError) {
      console.error('❌ Contract error:', contractError);
    }
    if (approvalError) {
      console.error('❌ Approval error:', approvalError);
      alert(`${TOKEN_SYMBOL} approval failed. Please try again.`);
    }
  }, [txHash, contractError, approvalError]);

  // Auto-place bet after approval is confirmed
  useEffect(() => {
    if (isApprovalConfirmed && selectedLevel !== null && blockchainMarketId !== undefined) {
      console.log(`✅ ${TOKEN_SYMBOL} approval confirmed! Auto-placing bet...`);
      // Refetch allowance first
      refetchAllowance().then(() => {
        // Small delay to ensure state is updated, then place bet
        setTimeout(() => {
          const level = priceLevels[selectedLevel];
          console.log(`🎯 Auto-placing bet on bucket ${level.bucketIndex} for ${betAmount} ${TOKEN_SYMBOL}`);
          placeBetOnChain(blockchainMarketId, level.bucketIndex, betAmount);
        }, 1000);
      });
    }
  }, [isApprovalConfirmed]);

  // Reset state after successful bet
  useEffect(() => {
    if (isConfirmed) {
      console.log('✅ Bet confirmed! Resetting state...');
      setTimeout(() => {
        setSelectedLevel(null);
        setBetAmount('1');
        onBetPlaced?.();
      }, 1500);
    }
  }, [isConfirmed, onBetPlaced]);

  // Detect if this is a meme coin with tiny prices stored in micro-units
  // Meme coins store price as USD * 100,000,000 instead of cents (USD * 100)
  // We detect this if category is 'meme' or if the "cents" value seems way too high
  const isTinyPriceMeme = category === 'meme' || (openingPrice > 100000 && openingPrice / 100 > 1000);
  const priceDivisor = isTinyPriceMeme ? 100_000_000 : 100;
  
  const currentPriceUSD = currentPrice / priceDivisor;
  const openingPriceUSD = openingPrice / priceDivisor;
  const totalPool = upPool + downPool;
  
  // Price levels should be centered on opening price (base price for percent changes)
  const basePriceUSD = openingPriceUSD;
  
  // Meme coin bucket structure (10 buckets total):
  // Gain buckets (0-4): 20%+, 15-20%, 10-15%, 5-10%, 0-5%
  // Loss buckets (5-9): 0 to -5%, -5 to -10%, -10 to -15%, -15 to -20%, -20%+
  
  const totalBuckets = 10;
  
  // Helper to format price range labels
  const formatPriceRange = (lowPercent: number, highPercent: number | null, isPlus: boolean = false, isMinus: boolean = false) => {
    const lowPrice = basePriceUSD * (1 + lowPercent / 100);
    if (isPlus) {
      return `$${formatCryptoPrice(lowPrice)}+`;
    }
    if (isMinus) {
      return `<$${formatCryptoPrice(lowPrice)}`;
    }
    const highPrice = basePriceUSD * (1 + highPercent! / 100);
    // For gains (positive percent), show lower price first (e.g., $1.00-$1.05)
    // For losses (negative percent), show higher price first (e.g., $0.95-$0.90)
    if (lowPercent >= 0) {
      // Gain bucket - lower to higher
      return `$${formatCryptoPrice(Math.min(lowPrice, highPrice))}-$${formatCryptoPrice(Math.max(lowPrice, highPrice))}`;
    } else {
      // Loss bucket - higher to lower
      return `$${formatCryptoPrice(Math.max(lowPrice, highPrice))}-$${formatCryptoPrice(Math.min(lowPrice, highPrice))}`;
    }
  };
  
  // Helper to format percent range labels
  const formatPercentRange = (lowPercent: number, highPercent: number | null, isPlus: boolean = false, isMinus: boolean = false) => {
    if (isPlus) {
      return `${lowPercent}%+`;
    }
    if (isMinus) {
      return `${lowPercent}%-`;
    }
    // Always show lower percent first for positive, higher first for negative
    if (lowPercent >= 0 && highPercent !== null && highPercent >= 0) {
      return `${lowPercent}% to ${highPercent}%`;
    }
    // For negative ranges, show less negative first (e.g., "0% to -5%")
    if (lowPercent <= 0 && highPercent !== null) {
      const min = Math.min(lowPercent, highPercent);
      const max = Math.max(lowPercent, highPercent);
      return `${max}% to ${min}%`;
    }
    return `${lowPercent}% to ${highPercent}%`;
  };
  
  const bucketLabels = [
    { priceLabel: formatPriceRange(20, null, true), percentLabel: formatPercentRange(20, null, true), percentChange: 25, bucketIndex: 0 },
    { priceLabel: formatPriceRange(15, 20), percentLabel: formatPercentRange(15, 20), percentChange: 17.5, bucketIndex: 1 },
    { priceLabel: formatPriceRange(10, 15), percentLabel: formatPercentRange(10, 15), percentChange: 12.5, bucketIndex: 2 },
    { priceLabel: formatPriceRange(5, 10), percentLabel: formatPercentRange(5, 10), percentChange: 7.5, bucketIndex: 3 },
    { priceLabel: formatPriceRange(0, 5), percentLabel: formatPercentRange(0, 5), percentChange: 2.5, bucketIndex: 4 },
    { priceLabel: formatPriceRange(-5, 0), percentLabel: formatPercentRange(-5, 0), percentChange: -2.5, bucketIndex: 5 },
    { priceLabel: formatPriceRange(-10, -5), percentLabel: formatPercentRange(-10, -5), percentChange: -7.5, bucketIndex: 6 },
    { priceLabel: formatPriceRange(-15, -10), percentLabel: formatPercentRange(-15, -10), percentChange: -12.5, bucketIndex: 7 },
    { priceLabel: formatPriceRange(-20, -15), percentLabel: formatPercentRange(-20, -15), percentChange: -17.5, bucketIndex: 8 },
    { priceLabel: formatPriceRange(-20, null, false, true), percentLabel: formatPercentRange(-20, null, false, true), percentChange: -25, bucketIndex: 9 },
  ];
  
  // Log probabilities for debugging
  useEffect(() => {
    if (probabilities && probabilities.length > 0) {
      console.log(`🎲 PriceSpinner received ${probabilities.length} probabilities:`, probabilities);
      const sum = probabilities.reduce((a, b) => a + b, 0);
      console.log(`   Sum of probabilities: ${sum.toFixed(1)}%`);
    } else {
      console.log('⚠️ PriceSpinner: No probabilities from blockchain');
    }
  }, [probabilities]);
  
  const uniformProbability = 100 / totalBuckets; // As percentage
  
  const priceLevels: PriceLevel[] = [];
  
  // Build price levels from bucket labels
  // All percent changes are relative to OPENING PRICE (basePriceUSD)
  for (const bucket of bucketLabels) {
    const price = basePriceUSD * (1 + bucket.percentChange / 100);
    
    priceLevels.push({
      price,
      percentChange: bucket.percentChange,
      liquidity: 0,
      probability: probabilities?.[bucket.bucketIndex] ?? uniformProbability,
      bucketIndex: bucket.bucketIndex,
    });
  }
  
  // Calculate liquidity for each level based on probability and total pool
  // Filter out dust amounts (< 0.0001 tokens) from display
  const dustThreshold = 0.0001;
  priceLevels.forEach(level => {
    const rawLiquidity = (totalPool * level.probability) / 100;
    level.liquidity = rawLiquidity >= dustThreshold ? rawLiquidity : 0;
  });

  const handleBet = async () => {
    const amount = parseFloat(betAmount);
    if (isNaN(amount) || amount <= 0) {
      alert('Please enter a valid amount');
      return;
    }
    if (amount < 1) {
      alert(`Minimum bet is 1 ${TOKEN_SYMBOL}`);
      return;
    }
    if (selectedLevel === null) {
      alert('Please select a price bucket to bet on');
      return;
    }
    if (!isConnected || !address) {
      alert('Please connect your wallet first');
      return;
    }
    
    const level = priceLevels[selectedLevel];
    
    // Save bet details for sharing after confirmation
    setLastBetDetails({
      percentChange: level.percentChange,
      targetPrice: level.price,
    });
    
    console.log('🎯 handleBet called:', {
      isContractDeployed,
      blockchainMarketId,
      contractAddress,
      bucketIndex: level.bucketIndex,
      betAmount,
      allowance: allowance?.toString(),
    });
    
    // Direct blockchain transaction - this is the primary path
    if (isContractDeployed && blockchainMarketId !== undefined && blockchainMarketId !== null) {
      // Check if token approval is needed
      const betAmountBigInt = parseUnits(betAmount, TOKEN_DECIMALS);
      const needsApproval = allowance === undefined || betAmountBigInt > allowance;
      
      if (needsApproval) {
        console.log(`🔓 ${TOKEN_SYMBOL} approval needed. Requesting exact amount approval...`);
        try {
          // Approve exact bet amount - bet will auto-trigger after approval confirms
          await approveToken(betAmountBigInt);
        } catch (err: any) {
          console.error('Approval failed:', err);
          alert(`Approval failed: ${err.shortMessage || err.message || 'Unknown error'}`);
        }
        return;
      }
      
      console.log('✅ Placing BLOCKCHAIN bet directly (allowance sufficient)');
      try {
        await placeBetOnChain(blockchainMarketId, level.bucketIndex, betAmount);
      } catch (err: any) {
        console.error('Bet failed:', err);
        alert(`Bet failed: ${err.shortMessage || err.message || 'Unknown error'}`);
      }
    } else {
      // Fallback to callback (demo mode) - this opens BetDialog
      console.warn('⚠️ Using DEMO mode (this will open dialog):', {
        isContractDeployed,
        blockchainMarketId,
        reason: !isContractDeployed ? 'Contract not deployed' : 'No blockchainMarketId',
      });
      onBet(level.bucketIndex, level.percentChange, level.price, amount);
      setBetAmount('1');
      setSelectedLevel(null);
    }
  };

  // Find the index of the 0-5% bucket for scrolling (bucket index 4)
  const middleLevelIndex = priceLevels.findIndex((_, idx) => bucketLabels[idx]?.bucketIndex === 4);
  
  // Debug: log the bucket structure
  useEffect(() => {
    console.log(`📊 PriceSpinner bucket structure:`, {
      totalBuckets,
      priceLevelsCount: priceLevels.length,
      middleLevelIndex,
      buckets: bucketLabels.map(l => l.percentLabel).join(', ')
    });
  }, [priceLevels.length, middleLevelIndex]);

  // Scroll to center (0% bucket) on mount and when market changes
  // Use useLayoutEffect to scroll before browser paint
  useLayoutEffect(() => {
    const scrollToMiddle = () => {
      if (listRef.current && middleLevelIndex !== -1) {
        const container = listRef.current;
        const middleElement = container.children[middleLevelIndex] as HTMLElement;
        if (middleElement) {
          const containerHeight = container.clientHeight;
          const elementTop = middleElement.offsetTop;
          const elementHeight = middleElement.offsetHeight;
          // Offset by -210px to move the opening price bucket up in the view
          const scrollPosition = elementTop - (containerHeight / 2) + (elementHeight / 2) - 210;
          container.scrollTop = Math.max(0, scrollPosition);
          console.log(`📍 Centered on 0% bucket (array index ${middleLevelIndex}), scrollTop=${Math.round(scrollPosition)}, containerHeight=${containerHeight}`);
        }
      }
    };
    
    // Reset and scroll immediately
    hasScrolled.current = false;
    scrollToMiddle();
    
    // Also scroll after delays to handle async rendering
    const timer1 = setTimeout(scrollToMiddle, 50);
    const timer2 = setTimeout(scrollToMiddle, 150);
    const timer3 = setTimeout(scrollToMiddle, 300);
    
    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
    };
  }, [middleLevelIndex, blockchainMarketId, openingPrice]);

  // Find the bucket with highest probability (market prediction)
  const highestProbBucket = priceLevels.reduce((max, level) => 
    level.probability > max.probability ? level : max, priceLevels[0]);
  
  // Check if there are any real bets (non-uniform distribution)
  // If all probabilities are roughly equal (within 0.5%), no bets have been placed
  // Also consider very small liquidity (< 1 token total) as "no bets"
  const uniformProb = 100 / priceLevels.length;
  const minLiquidityThreshold = 0.001; // Minimum total liquidity to consider "real bets"
  const probDeviationThreshold = 0.5; // % deviation from uniform to consider a real bet
  const hasRealBets = totalPool > minLiquidityThreshold && 
    priceLevels.some(level => Math.abs(level.probability - uniformProb) > probDeviationThreshold);

  return (
    <Card ref={containerRef} className="p-4 bg-card/50 backdrop-blur">
      <div className="mb-4">
        {/* Market Summary Header */}
        <div className="mb-4 p-3 bg-muted/50 rounded-lg">
          <div className="flex justify-between items-start mb-2">
            <div>
              <div className="text-xs text-muted-foreground">Opening Price</div>
              <div className="text-xl font-bold">${formatCryptoPrice(openingPriceUSD)}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-muted-foreground">Market Prediction</div>
              {hasRealBets ? (
                <>
                  <div className={cn(
                    'text-lg font-bold',
                    highestProbBucket.bucketIndex <= 4 && 'text-green-500',
                    highestProbBucket.bucketIndex >= 5 && 'text-red-500'
                  )}>
                    ${formatCryptoPrice(highestProbBucket.price)}
                  </div>
                  <div className={cn(
                    'text-xs',
                    highestProbBucket.bucketIndex <= 4 && 'text-green-500',
                    highestProbBucket.bucketIndex >= 5 && 'text-red-500'
                  )}>
                    {bucketLabels.find(b => b.bucketIndex === highestProbBucket.bucketIndex)?.percentLabel || '0%'} ({highestProbBucket.probability.toFixed(1)}% prob)
                  </div>
                </>
              ) : (
                <>
                  <div className="text-lg font-bold text-muted-foreground">—</div>
                  <div className="text-xs text-muted-foreground">No bets yet</div>
                </>
              )}
            </div>
          </div>
        </div>

        <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
          <DollarSign className="w-4 h-4" />
          Pick a Price
        </h3>
        
        {/* Search bar */}
        <div className="mb-3">
          <Input
            type="number"
            step="0.01"
            placeholder="Search price (e.g. 365.50)"
            value={searchPrice}
            onChange={(e) => {
              setSearchPrice(e.target.value);
              const searchVal = parseFloat(e.target.value);
              if (!isNaN(searchVal) && searchVal > 0) {
                // Find closest bucket to searched price
                let closestIdx = 0;
                let closestDiff = Math.abs(priceLevels[0].price - searchVal);
                priceLevels.forEach((level, idx) => {
                  const diff = Math.abs(level.price - searchVal);
                  if (diff < closestDiff) {
                    closestDiff = diff;
                    closestIdx = idx;
                  }
                });
                setSelectedLevel(closestIdx);
                // Scroll within the container only (not the whole page)
                if (listRef.current) {
                  const container = listRef.current;
                  const element = container.children[closestIdx] as HTMLElement;
                  if (element) {
                    const containerHeight = container.clientHeight;
                    const elementTop = element.offsetTop;
                    const elementHeight = element.offsetHeight;
                    const scrollPosition = elementTop - (containerHeight / 2) + (elementHeight / 2);
                    container.scrollTo({ top: Math.max(0, scrollPosition), behavior: 'smooth' });
                  }
                }
              }
            }}
            className="text-sm"
          />
        </div>

        {/* Price levels */}
        <div 
          ref={listRef}
          className="space-y-1 max-h-[400px] overflow-y-auto"
        >
          {priceLevels.map((level, idx) => {
            // Use bucket index to determine gain/loss: 0-4 are gain buckets, 5-9 are loss buckets
            // Bucket 4 is "0-5% gain", Bucket 5 is "0 to -5% loss" - both have color (not neutral)
            const isGainBucket = level.bucketIndex <= 4;
            const isLossBucket = level.bucketIndex >= 5;
            const isNeutral = false; // No neutral buckets in meme coin markets
            const priceLabel = bucketLabels[idx]?.priceLabel || '';
            const percentLabel = bucketLabels[idx]?.percentLabel || '';
            const probabilityPercent = level.probability;
            
            // Calculate bar width as relative to max probability
            // Only show bars for buckets with real liquidity (not dust)
            const maxProb = Math.max(...priceLevels.map(l => l.liquidity > 0 ? l.probability : 0), uniformProb);
            const hasLiquidity = level.liquidity > 0;
            const barWidth = hasLiquidity ? (level.probability / maxProb) * 100 : 0;
            
            return (
              <div
                key={idx}
                className={cn(
                  'relative rounded p-2 border transition-all cursor-pointer',
                  isNeutral && 'bg-primary/10 border-primary font-bold',
                  !isNeutral && isGainBucket && 'hover:bg-green-500/5 border-green-500/20',
                  !isNeutral && isLossBucket && 'hover:bg-red-500/5 border-red-500/20',
                  selectedLevel === idx && 'ring-2 ring-primary'
                )}
                onClick={() => setSelectedLevel(idx)}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    {isGainBucket && !isNeutral && <TrendingUp className="w-3 h-3 text-green-500" />}
                    {isLossBucket && !isNeutral && <TrendingDown className="w-3 h-3 text-red-500" />}
                    <span className={cn('text-sm', isNeutral && 'text-primary')}>
                      {priceLabel}
                    </span>
                  </div>
                  <span className={cn(
                    'text-xs font-medium',
                    isGainBucket && !isNeutral && 'text-green-500',
                    isLossBucket && !isNeutral && 'text-red-500',
                    isNeutral && 'text-muted-foreground'
                  )}>
                    {percentLabel}
                  </span>
                </div>

                {/* Liquidity bar showing relative probability */}
                <div className="relative h-2 bg-muted rounded-full overflow-hidden">
                  <div 
                    className={cn(
                      'absolute left-0 top-0 h-full transition-all duration-300',
                      isGainBucket ? 'bg-green-500/60' : 'bg-red-500/60',
                      isNeutral && 'bg-primary/60'
                    )}
                    style={{ width: `${barWidth}%` }}
                  />
                </div>

                <div className="flex items-center justify-between mt-1 text-xs text-muted-foreground">
                  <span>
                    {hasLiquidity ? level.liquidity.toFixed(2) : '0.00'} {TOKEN_SYMBOL}
                  </span>
                  <span>
                    {hasLiquidity ? `${probabilityPercent.toFixed(1)}%` : '—'} probability
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Betting controls */}
      <div className="border-t pt-4 space-y-3">
        {/* Show selected bucket details */}
        {selectedLevel !== null && (
          <div className="p-3 bg-muted/50 rounded-lg space-y-2 mb-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Selected Bucket</span>
              <span className={cn(
                'text-sm font-bold',
                priceLevels[selectedLevel].bucketIndex <= 4 && 'text-green-500',
                priceLevels[selectedLevel].bucketIndex >= 5 && 'text-red-500'
              )}>
                {bucketLabels[selectedLevel]?.priceLabel || ''} ({bucketLabels[selectedLevel]?.percentLabel || ''})
              </span>
            </div>
            {(() => {
              const bucketLiquidity = priceLevels[selectedLevel].liquidity;
              const betAmt = parseFloat(betAmount) || 0;
              
              // Current share calculation (will decrease as more people bet)
              const newBucketLiquidity = bucketLiquidity + betAmt;
              const currentShareOfBucket = newBucketLiquidity > 0 ? betAmt / newBucketLiquidity : 1;
              
              // Current payout estimate (based on current pool state)
              const currentTotalPool = totalPool + betAmt;
              const currentPayout = currentShareOfBucket * currentTotalPool;
              const currentMultiplier = betAmt > 0 ? currentPayout / betAmt : 1;
              
              // Check if this is effectively a new market
              const isNewMarket = totalPool < 1; // Less than 1 token
              
              return (
                <>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Pool in this bucket:</span>
                    <span className="font-medium">
                      {bucketLiquidity.toFixed(2)} {TOKEN_SYMBOL}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Total market pool:</span>
                    <span className="font-medium">
                      {totalPool.toFixed(2)} {TOKEN_SYMBOL}
                    </span>
                  </div>
                  <div className="border-t border-muted my-2" />
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Your share of bucket:</span>
                    <span className="font-medium">{(currentShareOfBucket * 100).toFixed(1)}%</span>
                  </div>
                  {!isNewMarket && (
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Est. payout if win:</span>
                      <span className="font-medium text-green-500">
                        {currentPayout.toFixed(2)} {TOKEN_SYMBOL} ({currentMultiplier.toFixed(2)}x)
                      </span>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        )}

        <div>
          <div className="flex justify-between items-center mb-1">
            <label className="text-xs text-muted-foreground">Bet Amount ({TOKEN_SYMBOL})</label>
            <span className="text-xs text-muted-foreground">
              {parseFloat(betAmount) || 0} {TOKEN_SYMBOL}
            </span>
          </div>
          <Input
            type="number"
            step="1"
            min="1"
            value={betAmount}
            onChange={(e) => setBetAmount(e.target.value)}
            placeholder="5"
            className="text-sm"
            disabled={isPending || isConfirming || isApproving || isApprovalConfirming}
          />
        </div>

        {/* Transaction status */}
        {isConfirmed && (
          <div className="flex flex-col items-center gap-2 py-2">
            <div className="flex items-center gap-2 text-green-600 text-sm">
              <CheckCircle2 className="w-4 h-4" />
              Bet placed successfully!
            </div>
            {isInFarcasterClient && symbol && lastBetDetails && (
              <Button
                variant="outline"
                size="sm"
                onClick={shareBetOnFarcaster}
                className="flex items-center gap-2"
              >
                <Share2 className="w-4 h-4" />
                Share on Farcaster
              </Button>
            )}
          </div>
        )}
        
        {contractError && (
          <div className="text-red-500 text-xs text-center py-1">
            {contractError.message?.slice(0, 50) || 'Transaction failed'}
          </div>
        )}

        {/* Wrong network warning */}
        {isConnected && chainId !== 84532 && (
          <div className="text-yellow-500 text-xs text-center py-2 bg-yellow-500/10 rounded border border-yellow-500/20">
            ⚠️ Switch to Base Sepolia to place bets
          </div>
        )}

        <Button
          onClick={handleBet}
          className={cn(
            'w-full',
            selectedLevel !== null && priceLevels[selectedLevel].bucketIndex <= 3 && 'bg-green-600 hover:bg-green-700',
            selectedLevel !== null && priceLevels[selectedLevel].bucketIndex >= 6 && 'bg-red-600 hover:bg-red-700',
            (selectedLevel === null || (priceLevels[selectedLevel].bucketIndex >= 4 && priceLevels[selectedLevel].bucketIndex <= 5)) && 'bg-primary hover:bg-primary/90'
          )}
          disabled={selectedLevel === null || !betAmount || parseFloat(betAmount) < 1 || !isConnected || isPending || isConfirming || isConfirmed || isApproving || isApprovalConfirming || chainId !== 84532}
          size="sm"
        >
          {isApproving ? (
            <>
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              Approving {TOKEN_SYMBOL}...
            </>
          ) : isApprovalConfirming ? (
            <>
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              Confirming Approval...
            </>
          ) : isPending ? (
            <>
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              Confirm in Wallet...
            </>
          ) : isConfirming ? (
            <>
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              Processing...
            </>
          ) : isConfirmed ? (
            <>
              <CheckCircle2 className="w-4 h-4 mr-1" />
              Bet Placed!
            </>
          ) : !isConnected ? (
            'Connect Wallet to Bet'
          ) : chainId !== 84532 ? (
            'Switch to Base Sepolia'
          ) : selectedLevel === null ? (
            'Select a price bucket'
          ) : (
            <>
              <DollarSign className="w-4 h-4 mr-1" />
              Bet {parseFloat(betAmount || '0').toFixed(0)} {TOKEN_SYMBOL} on {bucketLabels[selectedLevel]?.percentLabel || '0%'}
            </>
          )}
        </Button>

        <div className="text-xs text-muted-foreground text-center">
          Total Pool: {totalPool.toFixed(2)} {TOKEN_SYMBOL}
          <br />
          {totalBuckets} buckets | Min bet: 1 {TOKEN_SYMBOL}
        </div>
      </div>
    </Card>
  );
}
