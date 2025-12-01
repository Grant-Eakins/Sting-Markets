import { useState, useRef, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TrendingUp, TrendingDown, DollarSign, Loader2, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePlaceBet } from '@/hooks/useContract';
import { useAccount, useChainId } from 'wagmi';
import { CONTRACT_ADDRESSES } from '@/config/contract';
import { useEthPrice, formatEthToUsd } from '@/hooks/useEthPrice';

interface PriceLevel {
  price: number;
  percentChange: number;
  liquidity: number;
  probability: number;
  bucketIndex: number; // Actual contract bucket index
}

interface PriceSpinnerProps {
  currentPrice: number; // in cents
  openingPrice: number; // in cents
  upPool: number;
  downPool: number;
  isAfterHours: boolean;
  probabilities?: number[]; // Probabilities from blockchain (0-100% per bucket)
  blockchainMarketId?: number;
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
  onBetPlaced,
  onBet 
}: PriceSpinnerProps) {
  const [betAmount, setBetAmount] = useState('0.01');
  const [selectedLevel, setSelectedLevel] = useState<number | null>(null);
  const [searchPrice, setSearchPrice] = useState('');
  const hasScrolled = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Get ETH price for USD conversion
  const { ethPrice } = useEthPrice();

  // Reset scroll flag when market changes so it re-centers
  useEffect(() => {
    hasScrolled.current = false;
  }, [blockchainMarketId]);

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
  }, [txHash, contractError]);

  // Reset state after successful bet
  useEffect(() => {
    if (isConfirmed) {
      console.log('✅ Bet confirmed! Resetting state...');
      setTimeout(() => {
        setSelectedLevel(null);
        setBetAmount('0.01');
        onBetPlaced?.();
      }, 1500);
    }
  }, [isConfirmed, onBetPlaced]);

  const currentPriceUSD = currentPrice / 100;
  const totalPool = upPool + downPool;
  
  // Contract bucket ordering (from ProportionalMarket.sol):
  // INTRADAY (23 buckets): 0 = >+10%, 10 = +0% to +1%, 11 = 0% to -1%, 21 = <-10%
  // OVERNIGHT (42 buckets): 0 = >+10%, 20 = +0% to +0.5%, 21 = 0% to -0.5%, 41 = <-10%
  
  const totalBuckets = isAfterHours ? 42 : 23;
  const increment = isAfterHours ? 0.5 : 1; // 0.5% or 1% increments
  const numLevelsPerSide = isAfterHours ? 20 : 10; // Levels on each side of 0%
  
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
  
  // Build price levels to match contract bucket ordering
  // Contract: bucket 0 = highest positive change, bucket N = lowest negative change
  
  // First: extreme positive (>+10%) - bucket 0
  priceLevels.push({
    price: currentPriceUSD * 1.10,
    percentChange: 10,
    liquidity: 0,
    probability: probabilities?.[0] ?? uniformProbability,
    bucketIndex: 0,
  });
  
  // Positive buckets (from +10% down to +0.5%/+1%)
  for (let i = 1; i <= numLevelsPerSide; i++) {
    const percentChange = (numLevelsPerSide - i + 1) * increment; // 10%, 9.5%, 9%, ... 0.5%
    const price = currentPriceUSD * (1 + percentChange / 100);
    const bucketIndex = i; // Buckets 1 to numLevelsPerSide
    
    priceLevels.push({
      price,
      percentChange,
      liquidity: 0,
      probability: probabilities?.[bucketIndex] ?? uniformProbability,
      bucketIndex,
    });
  }
  
  // Middle bucket (0% change) - buckets numLevelsPerSide+1 (index 10 or 20)
  const middleBucketIndex = numLevelsPerSide;
  priceLevels.push({
    price: currentPriceUSD,
    percentChange: 0,
    liquidity: 0,
    probability: probabilities?.[middleBucketIndex] ?? uniformProbability,
    bucketIndex: middleBucketIndex,
  });
  
  // Negative buckets (from -0.5%/-1% down to -10%)
  for (let i = 1; i <= numLevelsPerSide; i++) {
    const percentChange = -i * increment; // -0.5%, -1%, ... -10%
    const price = currentPriceUSD * (1 + percentChange / 100);
    const bucketIndex = numLevelsPerSide + i; // Buckets numLevelsPerSide+1 to 2*numLevelsPerSide
    
    priceLevels.push({
      price,
      percentChange,
      liquidity: 0,
      probability: probabilities?.[bucketIndex] ?? uniformProbability,
      bucketIndex,
    });
  }
  
  // Last: extreme negative (<-10%) - last bucket
  const lastBucketIndex = totalBuckets - 1;
  priceLevels.push({
    price: currentPriceUSD * 0.90,
    percentChange: -10,
    liquidity: 0,
    probability: probabilities?.[lastBucketIndex] ?? uniformProbability,
    bucketIndex: lastBucketIndex,
  });
  
  // Calculate liquidity for each level based on probability and total pool
  // Filter out dust amounts (< 0.0001 ETH) from display
  const dustThreshold = 0.0001;
  priceLevels.forEach(level => {
    const rawLiquidity = (totalPool * level.probability) / 100;
    level.liquidity = rawLiquidity >= dustThreshold ? rawLiquidity : 0;
  });

  const handleBet = () => {
    const amount = parseFloat(betAmount);
    if (isNaN(amount) || amount <= 0) {
      alert('Please enter a valid amount');
      return;
    }
    if (amount < 0.001) {
      alert('Minimum bet is 0.001 ETH');
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
    
    // Direct blockchain transaction
    if (isContractDeployed && blockchainMarketId !== undefined) {
      console.log('🎯 Placing BLOCKCHAIN bet:', {
        blockchainMarketId,
        bucketIndex: level.bucketIndex,
        betAmount,
        contractAddress,
        userAddress: address,
      });
      placeBetOnChain(blockchainMarketId, level.bucketIndex, betAmount);
    } else {
      // Fallback to callback (demo mode)
      console.warn('⚠️ Using DEMO mode for bet:', {
        isContractDeployed,
        blockchainMarketId,
        reason: !isContractDeployed ? 'Contract not deployed' : 'No blockchainMarketId',
      });
      onBet(level.bucketIndex, level.percentChange, level.price, amount);
      setBetAmount('0.01');
      setSelectedLevel(null);
    }
  };

  // Find the index of the 0% change bucket for scrolling
  const middleLevelIndex = priceLevels.findIndex(l => l.percentChange === 0);

  // Scroll to center (0% bucket) on mount and when market changes
  useEffect(() => {
    // Use setTimeout to ensure DOM is fully ready
    const scrollToMiddle = () => {
      if (listRef.current && !hasScrolled.current && middleLevelIndex !== -1) {
        const container = listRef.current;
        const middleElement = container.children[middleLevelIndex] as HTMLElement;
        if (middleElement) {
          // Use scrollIntoView for more reliable centering
          middleElement.scrollIntoView({ block: 'center', behavior: 'instant' });
          hasScrolled.current = true;
          console.log(`📍 Scrolled to middle bucket (index ${middleLevelIndex})`);
        }
      }
    };
    
    // Try after DOM is ready
    const timer = setTimeout(scrollToMiddle, 50);
    return () => clearTimeout(timer);
  }, [middleLevelIndex, priceLevels.length]);

  // Find the bucket with highest probability (market prediction)
  const highestProbBucket = priceLevels.reduce((max, level) => 
    level.probability > max.probability ? level : max, priceLevels[0]);
  
  // Check if there are any real bets (non-uniform distribution)
  // If all probabilities are roughly equal (within 0.5%), no bets have been placed
  // Also consider very small liquidity (< 0.001 ETH total) as "no bets"
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
              <div className="text-xs text-muted-foreground">Closing Price</div>
              <div className="text-xl font-bold">${currentPriceUSD.toFixed(2)}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-muted-foreground">Market Prediction</div>
              {hasRealBets ? (
                <>
                  <div className={cn(
                    'text-lg font-bold',
                    highestProbBucket.percentChange > 0 && 'text-green-500',
                    highestProbBucket.percentChange < 0 && 'text-red-500',
                    highestProbBucket.percentChange === 0 && 'text-primary'
                  )}>
                    ${highestProbBucket.price.toFixed(2)}
                  </div>
                  <div className={cn(
                    'text-xs',
                    highestProbBucket.percentChange > 0 && 'text-green-500',
                    highestProbBucket.percentChange < 0 && 'text-red-500',
                    highestProbBucket.percentChange === 0 && 'text-muted-foreground'
                  )}>
                    {highestProbBucket.percentChange > 0 && '+'}
                    {highestProbBucket.percentChange.toFixed(1)}% ({highestProbBucket.probability.toFixed(1)}% prob)
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
          Select Your Price Bucket
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
                // Scroll to the found bucket
                if (listRef.current) {
                  const element = listRef.current.children[closestIdx] as HTMLElement;
                  if (element) {
                    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
            const isCurrent = level.percentChange === 0;
            const isUp = level.percentChange > 0;
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
                  isCurrent && 'bg-primary/10 border-primary font-bold',
                  !isCurrent && isUp && 'hover:bg-green-500/5 border-green-500/20',
                  !isCurrent && !isUp && 'hover:bg-red-500/5 border-red-500/20',
                  selectedLevel === idx && 'ring-2 ring-primary'
                )}
                onClick={() => setSelectedLevel(idx)}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    {isUp && <TrendingUp className="w-3 h-3 text-green-500" />}
                    {!isUp && !isCurrent && <TrendingDown className="w-3 h-3 text-red-500" />}
                    <span className={cn('text-sm', isCurrent && 'text-primary')}>
                      ${level.price.toFixed(2)}
                    </span>
                  </div>
                  <span className={cn(
                    'text-xs font-medium',
                    isUp && 'text-green-500',
                    !isUp && !isCurrent && 'text-red-500',
                    isCurrent && 'text-muted-foreground'
                  )}>
                    {level.percentChange > 0 && '+'}
                    {level.percentChange.toFixed(1)}%
                  </span>
                </div>

                {/* Liquidity bar showing relative probability */}
                <div className="relative h-2 bg-muted rounded-full overflow-hidden">
                  <div 
                    className={cn(
                      'absolute left-0 top-0 h-full transition-all duration-300',
                      isUp ? 'bg-green-500/60' : 'bg-red-500/60',
                      isCurrent && 'bg-primary/60'
                    )}
                    style={{ width: `${barWidth}%` }}
                  />
                </div>

                <div className="flex items-center justify-between mt-1 text-xs text-muted-foreground">
                  <span>
                    {hasLiquidity ? level.liquidity.toFixed(3) : '0.000'} ETH
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
                priceLevels[selectedLevel].percentChange > 0 && 'text-green-500',
                priceLevels[selectedLevel].percentChange < 0 && 'text-red-500',
                priceLevels[selectedLevel].percentChange === 0 && 'text-primary'
              )}>
                ${priceLevels[selectedLevel].price.toFixed(2)} ({priceLevels[selectedLevel].percentChange > 0 ? '+' : ''}{priceLevels[selectedLevel].percentChange.toFixed(1)}%)
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
              const isNewMarket = totalPool < 0.001;
              
              return (
                <>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Pool in this bucket:</span>
                    <span className="font-medium">
                      {bucketLiquidity.toFixed(4)} ETH
                      {ethPrice && <span className="text-muted-foreground ml-1">({formatEthToUsd(bucketLiquidity, ethPrice)})</span>}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Total market pool:</span>
                    <span className="font-medium">
                      {totalPool.toFixed(4)} ETH
                      {ethPrice && <span className="text-muted-foreground ml-1">({formatEthToUsd(totalPool, ethPrice)})</span>}
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
                        {currentPayout.toFixed(4)} ETH ({currentMultiplier.toFixed(2)}x)
                        {ethPrice && <span className="text-muted-foreground ml-1">≈ {formatEthToUsd(currentPayout, ethPrice)}</span>}
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
            <label className="text-xs text-muted-foreground">Bet Amount (ETH)</label>
            {ethPrice && betAmount && (
              <span className="text-xs text-muted-foreground">
                ≈ {formatEthToUsd(parseFloat(betAmount) || 0, ethPrice)}
              </span>
            )}
          </div>
          <Input
            type="number"
            step="0.001"
            min="0.001"
            value={betAmount}
            onChange={(e) => setBetAmount(e.target.value)}
            placeholder="0.01"
            className="text-sm"
            disabled={isPending || isConfirming}
          />
        </div>

        {/* Transaction status */}
        {isConfirmed && (
          <div className="flex items-center gap-2 text-green-600 text-sm justify-center py-2">
            <CheckCircle2 className="w-4 h-4" />
            Bet placed successfully!
          </div>
        )}
        
        {contractError && (
          <div className="text-red-500 text-xs text-center py-1">
            {contractError.message?.slice(0, 50) || 'Transaction failed'}
          </div>
        )}

        <Button
          onClick={handleBet}
          className={cn(
            'w-full',
            selectedLevel !== null && priceLevels[selectedLevel].percentChange > 0 && 'bg-green-600 hover:bg-green-700',
            selectedLevel !== null && priceLevels[selectedLevel].percentChange < 0 && 'bg-red-600 hover:bg-red-700',
            (selectedLevel === null || priceLevels[selectedLevel].percentChange === 0) && 'bg-primary hover:bg-primary/90'
          )}
          disabled={selectedLevel === null || !betAmount || parseFloat(betAmount) < 0.001 || !isConnected || isPending || isConfirming || isConfirmed}
          size="sm"
        >
          {isPending ? (
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
          ) : selectedLevel === null ? (
            'Select a price bucket'
          ) : (
            <>
              <DollarSign className="w-4 h-4 mr-1" />
              Bet {parseFloat(betAmount || '0').toFixed(3)} ETH on {priceLevels[selectedLevel].percentChange > 0 ? '+' : ''}{priceLevels[selectedLevel].percentChange.toFixed(1)}%
            </>
          )}
        </Button>

        <div className="text-xs text-muted-foreground text-center">
          Total Pool: {totalPool.toFixed(4)} ETH
          <br />
          {totalBuckets} buckets | Min bet: 0.001 ETH
        </div>
      </div>
    </Card>
  );
}
