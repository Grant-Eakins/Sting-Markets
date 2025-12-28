import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Clock, Lock, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import { BetDialog } from './BetDialog';
import { CoinChart } from './CoinChart';
import { useLiveCoinPrice } from '@/hooks/useLiveCoinPrice';
import { useBucketLiquidity } from '@/hooks/useContract';

interface DualCoinMarketCardProps {
  market: {
    id: string;
    blockchainMarketId?: number; // Add blockchain market ID for bonding curve
    coinASymbol: string;
    coinAName?: string;
    coinAImage?: string;
    coinAAddress?: string;
    coinAOpeningPrice: number;
    coinACurrentPrice?: number;
    coinAClosingPrice?: number;
    coinAChangePercent?: number;
    coinBSymbol: string;
    coinBName?: string;
    coinBImage?: string;
    coinBAddress?: string;
    coinBOpeningPrice: number;
    coinBCurrentPrice?: number;
    coinBClosingPrice?: number;
    coinBChangePercent?: number;
    status: string;
    lockTime: string;
    settleTime: string;
    winningPosition?: string;
    upPool: number;
    downPool: number;
    totalBets: number;
    probabilities?: number[]; // LMSR probabilities from blockchain
  };
  userBet?: {
    position: string;
    amount: number;
  };
}

// Helper function to convert price from storage format to USD
function convertPriceToUSD(price: number): number {
  // For prices stored in micro-units (price * 100,000,000), convert back
  if (price > 10_000_000) {
    return price / 100_000_000;
  }
  // For prices stored in cents (price * 100), convert back
  return price / 100;
}

export function DualCoinMarketCard({ market, userBet }: DualCoinMarketCardProps) {
  const [showBetDialog, setShowBetDialog] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState<'UP' | 'DOWN'>('UP');

  // Fetch live prices from DexScreener
  const { data: coinAData } = useLiveCoinPrice(market.coinAAddress);
  const { data: coinBData } = useLiveCoinPrice(market.coinBAddress);

  // Fetch real-time on-chain pool liquidity for dynamic percentages
  const { liquidity: coinALiquidity } = useBucketLiquidity(market.blockchainMarketId, 0);
  const { liquidity: coinBLiquidity } = useBucketLiquidity(market.blockchainMarketId, 1);

  const isLocked = market.status === 'LOCKED';
  const isSettled = market.status === 'SETTLED';
  const isActive = market.status === 'ACTIVE';

  // Use live prices when available, fall back to market data
  const coinAPrice = coinAData?.price ?? (market.coinACurrentPrice 
    ? convertPriceToUSD(market.coinACurrentPrice)
    : convertPriceToUSD(market.coinAOpeningPrice));

  const coinBPrice = coinBData?.price ?? (market.coinBCurrentPrice 
    ? convertPriceToUSD(market.coinBCurrentPrice)
    : convertPriceToUSD(market.coinBOpeningPrice));

  // Calculate change from MARKET OPENING PRICE (not 24h change)
  const coinAOpeningUSD = convertPriceToUSD(market.coinAOpeningPrice);
  const coinBOpeningUSD = convertPriceToUSD(market.coinBOpeningPrice);
  
  const coinAChange = coinAOpeningUSD > 0 
    ? ((coinAPrice - coinAOpeningUSD) / coinAOpeningUSD) * 100
    : 0;
  const coinBChange = coinBOpeningUSD > 0 
    ? ((coinBPrice - coinBOpeningUSD) / coinBOpeningUSD) * 100
    : 0;

  const handleBet = (position: 'UP' | 'DOWN') => {
    setSelectedPosition(position);
    setShowBetDialog(true);
  };

  const formatPrice = (price: number | undefined) => {
    if (!price || price === 0) return '$0.00';
    if (price < 0.01) {
      return `$${price.toFixed(8)}`;
    }
    return `$${price.toFixed(4)}`;
  };

  const formatTimeRemaining = (targetTime: string) => {
    const now = new Date();
    const target = new Date(targetTime);
    const diff = target.getTime() - now.getTime();
    
    if (diff < 0) return 'Expired';
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  // Calculate pool percentages from real-time on-chain liquidity
  let coinAPoolPercent = 50;
  let coinBPoolPercent = 50;
  
  if (coinALiquidity !== undefined && coinBLiquidity !== undefined) {
    const totalLiquidity = Number(coinALiquidity) + Number(coinBLiquidity);
    if (totalLiquidity > 0) {
      coinAPoolPercent = (Number(coinALiquidity) / totalLiquidity) * 100;
      coinBPoolPercent = (Number(coinBLiquidity) / totalLiquidity) * 100;
    }
  } else {
    // Fallback to backend data if on-chain data not available
    const totalPool = market.upPool + market.downPool;
    if (totalPool > 0) {
      coinAPoolPercent = (market.upPool / totalPool) * 100;
      coinBPoolPercent = (market.downPool / totalPool) * 100;
    }
  }

  return (
    <>
      <Card className="hover:shadow-lg transition-shadow max-w-7xl mx-auto bg-card/90 overflow-hidden">
        <CardHeader className="pb-2 sm:pb-3 px-2 sm:px-6 pt-2 sm:pt-6">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base sm:text-xl font-bold italic" style={{ color: '#fffd7e' }}>
              Coin Battles
            </CardTitle>
            {isActive && (
              <Badge variant="default" className="bg-green-500">
                <Clock className="w-3 h-3 mr-1" />
                {formatTimeRemaining(market.lockTime)}
              </Badge>
            )}
            {isLocked && (
              <Badge variant="secondary">
                <Lock className="w-3 h-3 mr-1" />
                Locked
              </Badge>
            )}
            {isSettled && (
              <Badge variant="default" className="bg-blue-500">
                <CheckCircle2 className="w-3 h-3 mr-1" />
                Settled
              </Badge>
            )}
          </div>
        </CardHeader>

        <CardContent className="p-2 sm:p-4 md:p-6 lg:p-8">
          {/* Horizontal Layout on all screen sizes: Coin A | VS | Coin B */}
          <div className="grid grid-cols-[1fr_auto_1fr] gap-0.5 sm:gap-4 md:gap-6 lg:gap-8 items-stretch">
            
            {/* Coin A - Left Side (Top on mobile) */}
            <div className={`relative rounded-lg border transition-all min-h-[240px] sm:min-h-[350px] md:min-h-[400px] flex flex-col overflow-hidden ${
              isSettled && market.winningPosition === 'UP' 
                ? 'border-green-500 bg-green-500/5' 
                : 'border-muted hover:border-blue-500/40 bg-card/80'
            }`}>
              {/* Coin A Image - Top Left Corner */}
              <div className="absolute top-1.5 left-1.5 sm:top-3 sm:left-3 z-10">
                {market.coinAImage ? (
                  <img 
                    src={market.coinAImage} 
                    alt={market.coinASymbol} 
                    className="w-7 h-7 sm:w-10 sm:h-10 md:w-12 md:h-12 rounded-full border-2 border-muted shadow-md" 
                  />
                ) : (
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-blue-500/10 border-2 border-muted shadow-md flex items-center justify-center text-sm sm:text-base font-semibold">
                    {market.coinASymbol.charAt(0)}
                  </div>
                )}
              </div>

              {/* Price Info - Top Right */}
              <div className="absolute top-1.5 right-1.5 sm:top-3 sm:right-3 text-right z-10">
                <div className="font-mono text-xs sm:text-sm md:text-base font-bold">{formatPrice(coinAPrice)}</div>
                <div className={`text-[10px] sm:text-xs md:text-sm font-bold ${coinAChange >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {coinAChange >= 0 ? '+' : ''}{coinAChange.toFixed(2)}%
                </div>
              </div>

              <div className="p-1.5 sm:p-3 md:p-4 pt-10 sm:pt-16 md:pt-20 flex-1 flex flex-col">
                <div className="mb-0.5 sm:mb-2 md:mb-3">
                  <div className="font-bold text-base sm:text-xl md:text-2xl">{market.coinASymbol}</div>
                  {market.coinAName && (
                    <div className="text-[10px] sm:text-xs text-muted-foreground truncate">{market.coinAName}</div>
                  )}
                </div>
                
                {/* Coin A Chart */}
                {market.coinAAddress && (
                  <div className="mb-1 sm:mb-3 md:mb-4 flex-1 min-h-0">
                    <CoinChart
                      name={market.coinAName || market.coinASymbol}
                      symbol={market.coinASymbol}
                      growth={`${coinAChange >= 0 ? '+' : ''}${coinAChange.toFixed(2)}%`}
                      contractAddress={market.coinAAddress}
                      marketOpeningTime={(market as any).createdAt}
                      openingPrice={coinAOpeningUSD}
                    />
                  </div>
                )}
                
                {isActive && !userBet && (
                  <Button 
                    onClick={() => handleBet('UP')}
                    className="w-full font-semibold text-black"
                    style={{ backgroundColor: '#fffd7e' }}
                    size="lg"
                  >
                    <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
                    BET {market.coinASymbol}
                  </Button>
                )}
                
                <div className="mt-1 sm:mt-2 md:mt-3 text-[10px] sm:text-xs text-muted-foreground text-center">
                  Pool: {coinAPoolPercent.toFixed(1)}%
                </div>
              </div>
            </div>

            {/* VS Divider - Center (always visible in horizontal layout) */}
            <div className="flex flex-col items-center justify-center px-0.5 sm:px-2 md:px-4 gap-1 sm:gap-3 md:gap-4">
              {/* Winning indicator - only show during active betting or after settlement */}
              {(coinAChange !== 0 || coinBChange !== 0) && (
                <div className="flex flex-col items-center gap-1 sm:gap-2 md:gap-3">
                  {/* Animated percentage display */}
                  <div 
                    className="text-sm sm:text-2xl md:text-3xl font-bold animate-pulse"
                    style={{ 
                      color: coinAChange > coinBChange 
                        ? (coinAChange >= 0 ? '#00ff00' : '#ff0000')
                        : (coinBChange >= 0 ? '#00ff00' : '#ff0000'),
                      textShadow: coinAChange > coinBChange
                        ? (coinAChange >= 0 ? '0 0 10px #00ff00' : '0 0 10px #ff0000')
                        : (coinBChange >= 0 ? '0 0 10px #00ff00' : '0 0 10px #ff0000')
                    }}
                  >
                    {coinAChange > coinBChange 
                      ? `${coinAChange >= 0 ? '+' : ''}${coinAChange.toFixed(2)}%`
                      : `${coinBChange >= 0 ? '+' : ''}${coinBChange.toFixed(2)}%`
                    }
                  </div>
                  <div className="text-[10px] sm:text-sm md:text-base font-bold" style={{ color: '#fffd7e' }}>
                    Winning:
                  </div>
                  {coinAChange > coinBChange ? (
                    market.coinAImage ? (
                      <img 
                        src={market.coinAImage} 
                        alt={market.coinASymbol} 
                        className="w-8 h-8 sm:w-16 sm:h-16 md:w-20 md:h-20 rounded-full border-3 border-green-500 shadow-lg" 
                      />
                    ) : (
                      <div className="w-8 h-8 sm:w-20 sm:h-20 rounded-full bg-green-500/20 border-3 border-green-500 shadow-lg flex items-center justify-center text-sm sm:text-xl font-bold">
                        {market.coinASymbol.charAt(0)}
                      </div>
                    )
                  ) : (
                    market.coinBImage ? (
                      <img 
                        src={market.coinBImage} 
                        alt={market.coinBSymbol} 
                        className="w-8 h-8 sm:w-20 sm:h-20 rounded-full border-3 border-green-500 shadow-lg" 
                      />
                    ) : (
                      <div className="w-8 h-8 sm:w-20 sm:h-20 rounded-full bg-green-500/20 border-3 border-green-500 shadow-lg flex items-center justify-center text-sm sm:text-xl font-bold">
                        {market.coinBSymbol.charAt(0)}
                      </div>
                    )
                  )}
                </div>
              )}
              
              <div className="rounded-lg border border-muted bg-muted/30 px-1.5 py-1.5 sm:px-3 sm:py-4 md:px-4 md:py-6">
                <div className="text-xs sm:text-xl md:text-2xl font-bold text-foreground">
                  VS
                </div>
              </div>
            </div>

            {/* Coin B - Right Side (Bottom on mobile) */}
            <div className={`relative rounded-lg border transition-all min-h-[240px] sm:min-h-[350px] md:min-h-[400px] flex flex-col overflow-hidden ${
              isSettled && market.winningPosition === 'DOWN' 
                ? 'border-green-500 bg-green-500/5' 
                : 'border-muted hover:border-purple-500/40 bg-card/80'
            }`}>
              {/* Price Info - Top Left */}
              <div className="absolute top-1.5 left-1.5 sm:top-3 sm:left-3 text-left z-10">
                <div className="font-mono text-xs sm:text-sm md:text-base font-bold">{formatPrice(coinBPrice)}</div>
                <div className={`text-[10px] sm:text-xs md:text-sm font-bold ${coinBChange >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {coinBChange >= 0 ? '+' : ''}{coinBChange.toFixed(2)}%
                </div>
              </div>

              {/* Coin B Image - Top Right Corner */}
              <div className="absolute top-1.5 right-1.5 sm:top-3 sm:right-3 z-10">
                {market.coinBImage ? (
                  <img 
                    src={market.coinBImage} 
                    alt={market.coinBSymbol} 
                    className="w-7 h-7 sm:w-10 sm:h-10 md:w-12 md:h-12 rounded-full border-2 border-muted shadow-md" 
                  />
                ) : (
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-purple-500/10 border-2 border-muted shadow-md flex items-center justify-center text-sm sm:text-base font-semibold">
                    {market.coinBSymbol.charAt(0)}
                  </div>
                )}
              </div>

              <div className="p-1.5 sm:p-3 md:p-4 pt-10 sm:pt-16 md:pt-20 flex-1 flex flex-col">
                <div className="mb-0.5 sm:mb-2 md:mb-3">
                  <div className="font-bold text-base sm:text-xl md:text-2xl">{market.coinBSymbol}</div>
                  {market.coinBName && (
                    <div className="text-[10px] sm:text-xs text-muted-foreground truncate">{market.coinBName}</div>
                  )}
                </div>
                
                {/* Coin B Chart */}
                {market.coinBAddress && (
                  <div className="mb-1 sm:mb-3 md:mb-4 flex-1 min-h-0">
                    <CoinChart
                      name={market.coinBName || market.coinBSymbol}
                      symbol={market.coinBSymbol}
                      growth={`${coinBChange >= 0 ? '+' : ''}${coinBChange.toFixed(2)}%`}
                      contractAddress={market.coinBAddress}
                      marketOpeningTime={(market as any).createdAt}
                      openingPrice={coinBOpeningUSD}
                    />
                  </div>
                )}
                
                {isActive && !userBet && (
                  <Button 
                    onClick={() => handleBet('DOWN')}
                    className="w-full font-semibold text-black"
                    style={{ backgroundColor: '#fffd7e' }}
                    size="lg"
                  >
                    <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
                    BET {market.coinBSymbol}
                  </Button>
                )}
                
                <div className="mt-1 sm:mt-2 md:mt-3 text-[10px] sm:text-xs text-muted-foreground text-center">
                  Pool: {coinBPoolPercent.toFixed(1)}%
                </div>
              </div>
            </div>
          </div>

          {/* User's Bet */}
          {userBet && (
            <div className="mt-4 p-3 bg-primary/10 rounded-lg border border-primary/30">
              <div className="text-sm font-semibold">
                Your Bet: {userBet.amount.toLocaleString()} tokens on{' '}
                <span className="font-bold">
                  {userBet.position === 'UP' ? market.coinASymbol : market.coinBSymbol}
                </span>
              </div>
              {isSettled && (
                <div className={`text-sm mt-1 font-bold ${
                  userBet.position === market.winningPosition ? 'text-green-500' : 'text-red-500'
                }`}>
                  {userBet.position === market.winningPosition ? 'WINNER!' : 'Better luck next time'}
                </div>
              )}
            </div>
          )}

          {/* Market Stats */}
          <div className="mt-3 sm:mt-4 grid grid-cols-2 gap-2 sm:gap-3 text-xs sm:text-sm pt-2 sm:pt-3 border-t">
            <div>Total Bets: <span className="font-semibold">{market.totalBets}</span></div>
            <div>Total Pool: <span className="font-semibold">
              {coinALiquidity !== undefined && coinBLiquidity !== undefined 
                ? ((Number(coinALiquidity) + Number(coinBLiquidity)) / 1e18).toFixed(2)
                : (market.upPool + market.downPool).toLocaleString()
              } {coinALiquidity !== undefined && coinBLiquidity !== undefined ? 'MIND' : ''}
            </span></div>
          </div>
        </CardContent>
      </Card>

      {showBetDialog && (
        <BetDialog
          onClose={() => setShowBetDialog(false)}
          market={{
            id: market.id,
            blockchainMarketId: market.blockchainMarketId, // Pass blockchain ID for bonding curve
            stockSymbol: `${market.coinASymbol} vs ${market.coinBSymbol}`,
            stockName: 'Dual Coin Battle',
            currentPrice: 0,
            openingPrice: 0,
            upPool: market.upPool,
            downPool: market.downPool,
            probabilities: market.probabilities, // Pass LMSR probabilities
          } as any}
          position={selectedPosition}
          odds={2.0} // Placeholder - actual odds calculated from probabilities
          bucketIndex={selectedPosition === 'UP' ? 0 : 1} // Dual-coin has 2 buckets: 0=Coin A, 1=Coin B
          onBetPlaced={() => {
            setShowBetDialog(false);
          }}
        />
      )}
    </>
  );
}
