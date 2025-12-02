import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TrendingUp, TrendingDown, Clock, Users, DollarSign } from 'lucide-react';
import { Market } from '@/lib/marketApi';
import { useState } from 'react';
import { BetDialog } from '@/components/BetDialog';
import { useContractMarketData, useContractMarketBets } from '@/hooks/useContractMarketData';
import { StockChart } from '@/components/StockChart';
import { PriceSpinner } from '@/components/PriceSpinner';
import { useMarketProbabilities } from '@/hooks/useContract';
import { useEthPrice, formatEthToUsd } from '@/hooks/useEthPrice';
import { formatCryptoPrice } from '@/lib/utils';

interface MarketCardProps {
  market: Market;
  onBetPlaced?: () => void;
}

export function MarketCard({ market, onBetPlaced }: MarketCardProps) {
  const [showBetDialog, setShowBetDialog] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState<'UP' | 'DOWN'>('UP');

  // Get ETH price for USD conversion
  const { ethPrice } = useEthPrice();

  // Read real-time probabilities from blockchain
  const { probabilities, refetch: refetchProbabilities } = useMarketProbabilities(market.blockchainMarketId);
  const contractData = useContractMarketData(market.blockchainMarketId);
  const contractBets = useContractMarketBets(market.blockchainMarketId);

  const calculateOdds = (pool: number, total: number) => {
    if (total === 0) return 2.0;
    return Math.max(1.01, Math.min(total / pool, 10));
  };

  // Use blockchain data if available, otherwise fall back to backend data
  // Note: ProportionalMarket uses totalLiquidity instead of upPool/downPool
  const totalPool = contractData.totalPool > 0 ? contractData.totalPool : (market.totalPool ?? 0);
  const upPool = contractData.upPool > 0 ? contractData.upPool : (market.upPool ?? 0);
  const downPool = contractData.downPool > 0 ? contractData.downPool : (market.downPool ?? 0);
  const totalBets = contractBets.totalBets > 0 ? contractBets.totalBets : (market.totalBets ?? 0);
  
  // Use contract probabilities if available for more accurate odds
  const liveProbabilities = contractData.probabilities || probabilities || market.probabilities;
  
  // Calculate odds from probabilities if available, otherwise use pool-based calculation
  let upOdds = calculateOdds(upPool || 0.01, totalPool);
  let downOdds = calculateOdds(downPool || 0.01, totalPool);
  let upPercentage = totalPool > 0 ? (upPool / totalPool) * 100 : 50;
  let downPercentage = 100 - upPercentage;
  
  // If we have live probabilities from the contract, use them for better accuracy
  if (liveProbabilities && liveProbabilities.length > 0) {
    const middleIndex = Math.floor(liveProbabilities.length / 2);
    // Sum up probabilities for UP (lower indices = positive change) and DOWN (higher indices = negative change)
    let upProbSum = 0;
    let downProbSum = 0;
    for (let i = 0; i < liveProbabilities.length; i++) {
      if (i < middleIndex) {
        upProbSum += liveProbabilities[i];
      } else if (i > middleIndex) {
        downProbSum += liveProbabilities[i];
      }
    }
    // Probabilities are in percentage (0-100 each bucket sums to 100)
    upPercentage = upProbSum;
    downPercentage = downProbSum;
    
    // Calculate odds: if UP has 30% probability, odds = 100/30 = 3.33x
    upOdds = upProbSum > 0 ? Math.min(100 / upProbSum, 10) : 10;
    downOdds = downProbSum > 0 ? Math.min(100 / downProbSum, 10) : 10;
  }

  // Calculate time until settlement (more relevant for crypto markets)
  const timeUntilSettle = new Date(market.settleTime).getTime() - Date.now();
  const hoursUntilSettle = Math.max(0, Math.floor(timeUntilSettle / (1000 * 60 * 60)));
  const minutesUntilSettle = Math.max(0, Math.floor((timeUntilSettle % (1000 * 60 * 60)) / (1000 * 60)));

  const [selectedBucket, setSelectedBucket] = useState<{
    bucketIndex: number;
    percentChange: number;
    targetPrice: number;
    amount: number;
  } | null>(null);

  const handleBet = (bucketIndex: number, percentChange: number, targetPrice: number, amount: number) => {
    // This is only called in demo/fallback mode from PriceSpinner
    // For blockchain bets, PriceSpinner handles it directly
    console.log('📝 MarketCard handleBet (demo mode):', { bucketIndex, percentChange, targetPrice, amount });
    setSelectedBucket({ bucketIndex, percentChange, targetPrice, amount });
    // Determine position based on percentChange for backward compatibility
    setSelectedPosition(percentChange >= 0 ? 'UP' : 'DOWN');
    setShowBetDialog(true);
  };

  // Check if market is effectively locked (past lock time but status not updated yet)
  const isEffectivelyLocked = market.status === 'ACTIVE' && market.lockTime && new Date(market.lockTime).getTime() < Date.now();

  const getStatusBadge = () => {
    // If we're past lock time but status is still ACTIVE, show as Locked
    if (isEffectivelyLocked) {
      return <Badge variant="secondary" className="bg-yellow-500">Betting Closed</Badge>;
    }
    
    switch (market.status) {
      case 'ACTIVE':
        return <Badge variant="default" className="bg-green-500">Active</Badge>;
      case 'LOCKED':
        return <Badge variant="secondary">Locked</Badge>;
      case 'SETTLED':
        return market.winningPosition ? (
          <Badge variant="outline" className={market.winningPosition === 'UP' ? 'border-green-500 text-green-500' : 'border-red-500 text-red-500'}>
            {market.winningPosition} Won
          </Badge>
        ) : <Badge variant="secondary">Settled</Badge>;
      default:
        return <Badge variant="secondary">{market.status}</Badge>;
    }
  };

  return (
    <>
      <Card className="overflow-hidden hover:shadow-lg transition-shadow">
        <CardHeader className="pb-3">
          <div className="flex justify-between items-start mb-2">
            {getStatusBadge()}
            {market.status === 'ACTIVE' && (
              <div className="flex items-center text-sm text-muted-foreground">
                <Clock className="w-4 h-4 mr-1" />
                {hoursUntilSettle}h {minutesUntilSettle}m
              </div>
            )}
          </div>
          <CardTitle className="text-xl flex items-center gap-2">
            {market.stockSymbol || market.stockName}
            {market.isAfterHours && <Badge variant="secondary" className="text-xs">After Hours</Badge>}
          </CardTitle>
          <CardDescription className="line-clamp-2">{market.description}</CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Stock Chart */}
          {market.currentPrice !== undefined && market.openingPrice !== undefined && (
            <StockChart 
              stockSymbol={market.stockSymbol}
              currentPrice={market.currentPrice}
              openingPrice={market.openingPrice}
              isAfterHours={market.isAfterHours}
            />
          )}

          {/* Pool Stats */}
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-1 text-muted-foreground">
              <DollarSign className="w-4 h-4" />
              <span>Total Pool:</span>
            </div>
            <span className="font-bold">
              {totalPool.toFixed(4)} ETH
              {ethPrice && totalPool > 0 && (
                <span className="font-normal text-muted-foreground ml-1">
                  ({formatEthToUsd(totalPool, ethPrice)})
                </span>
              )}
            </span>
          </div>

          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-1 text-muted-foreground">
              <Users className="w-4 h-4" />
              <span>Total Bets:</span>
            </div>
            <span>{totalBets}</span>
          </div>

          {/* Price Spinner with Bucket Selection */}
          {market.status === 'ACTIVE' && !isEffectivelyLocked && market.currentPrice !== undefined && (
            <PriceSpinner
              currentPrice={market.currentPrice}
              openingPrice={market.openingPrice}
              upPool={upPool}
              downPool={downPool}
              isAfterHours={market.isAfterHours}
              probabilities={liveProbabilities}
              blockchainMarketId={market.blockchainMarketId}
              onBet={handleBet}
              onBetPlaced={() => {
                refetchProbabilities();
                onBetPlaced?.();
              }}
            />
          )}

          {/* Locked message when betting closed */}
          {isEffectivelyLocked && (
            <div className="text-center py-4 text-muted-foreground">
              <p className="text-sm">Betting is closed. Awaiting settlement.</p>
            </div>
          )}

          {/* Simple Betting Options (for non-active or fallback) */}
          {market.status === 'ACTIVE' && !isEffectivelyLocked && market.currentPrice === undefined && (
            <div className="grid grid-cols-2 gap-3 pt-2">
              {/* UP Button */}
              <button
                onClick={() => handleBet(0, 5, (market.openingPrice / 100) * 1.05, 0.01)}
                disabled={market.status !== 'ACTIVE'}
                className="group relative overflow-hidden rounded-lg border-2 border-green-500 bg-green-500/10 p-4 transition-all hover:bg-green-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="flex flex-col items-center gap-2">
                  <TrendingUp className="w-6 h-6 text-green-500" />
                  <span className="font-bold text-green-500">UP</span>
                  <div className="text-sm">
                    <span className="font-bold text-lg">{upOdds.toFixed(2)}x</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {upPercentage.toFixed(0)}% pool
                  </div>
                </div>
                {/* Progress Bar */}
                <div className="absolute bottom-0 left-0 h-1 bg-green-500" style={{ width: `${upPercentage}%` }} />
              </button>

              {/* DOWN Button */}
              <button
                onClick={() => handleBet(22, -5, (market.openingPrice / 100) * 0.95, 0.01)}
                disabled={market.status !== 'ACTIVE'}
                className="group relative overflow-hidden rounded-lg border-2 border-red-500 bg-red-500/10 p-4 transition-all hover:bg-red-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="flex flex-col items-center gap-2">
                  <TrendingDown className="w-6 h-6 text-red-500" />
                  <span className="font-bold text-red-500">DOWN</span>
                  <div className="text-sm">
                    <span className="font-bold text-lg">{downOdds.toFixed(2)}x</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {downPercentage.toFixed(0)}% pool
                  </div>
                </div>
                {/* Progress Bar */}
                <div className="absolute bottom-0 left-0 h-1 bg-red-500" style={{ width: `${downPercentage}%` }} />
              </button>
            </div>
          )}

          {/* Current Price Info */}
          {market.status === 'ACTIVE' && market.currentPrice !== undefined && market.openingPrice !== undefined && (
            <div className="p-3 bg-muted rounded-lg text-sm">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Current Price:</span>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-lg">${(market.currentPrice / 100).toFixed(2)}</span>
                  {market.priceChange != null && market.priceChangePercent != null && (
                    <span className={market.priceChange >= 0 ? 'text-green-500 text-sm' : 'text-red-500 text-sm'}>
                      ({market.priceChange >= 0 ? '+' : ''}${(market.priceChange / 100).toFixed(2)} / {market.priceChangePercent.toFixed(2)}%)
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Settlement Info */}
          {market.status === 'SETTLED' && market.closingPrice !== undefined && market.openingPrice !== undefined && (
            <div className="p-3 bg-muted rounded-lg text-sm">
              <div className="flex justify-between">
                <span>Settlement Result:</span>
                <div className="text-right">
                  <div className="font-bold">${(market.closingPrice / 100).toFixed(2)}</div>
                  {market.priceChange != null && market.priceChangePercent != null && (
                    <div className={market.priceChange >= 0 ? 'text-green-500 text-xs' : 'text-red-500 text-xs'}>
                      {market.priceChange >= 0 ? '+' : ''}${(market.priceChange / 100).toFixed(2)} ({market.priceChangePercent.toFixed(2)}%)
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </CardContent>

        <CardFooter className="text-xs text-muted-foreground">
          <div className="flex justify-between w-full">
            {market.openingPrice !== undefined && (
              <span>Opening: ${formatCryptoPrice(market.openingPrice / 100)}</span>
            )}
            {market.status === 'ACTIVE' && (
              <span>Settles in {hoursUntilSettle}h {minutesUntilSettle}m</span>
            )}
          </div>
        </CardFooter>
      </Card>

      {showBetDialog && (
        <BetDialog
          market={market}
          position={selectedPosition}
          odds={selectedPosition === 'UP' ? upOdds : downOdds}
          bucketIndex={selectedBucket?.bucketIndex}
          onClose={() => setShowBetDialog(false)}
          onBetPlaced={() => {
            setShowBetDialog(false);
            setSelectedBucket(null);
            refetchProbabilities(); // Refetch live probabilities after bet
            onBetPlaced?.();
          }}
        />
      )}
    </>
  );
}
