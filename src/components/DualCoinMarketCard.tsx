import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Clock, Lock, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import { BetDialog } from './BetDialog';
import { CoinChart } from './CoinChart';
import { useLiveCoinPrice } from '@/hooks/useLiveCoinPrice';

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

  // Use live 24h price change from DexScreener
  const coinAChange = coinAData?.priceChange24h ?? (market.coinAChangePercent ?? 0);
  const coinBChange = coinBData?.priceChange24h ?? (market.coinBChangePercent ?? 0);

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

  const totalPool = market.upPool + market.downPool;
  const coinAPoolPercent = totalPool > 0 ? (market.upPool / totalPool) * 100 : 50;
  const coinBPoolPercent = totalPool > 0 ? (market.downPool / totalPool) * 100 : 50;

  return (
    <>
      <Card className="hover:shadow-lg transition-shadow max-w-7xl mx-auto">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl font-bold italic" style={{ color: '#fffd7e' }}>
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

        <CardContent className="p-6 sm:p-8">
          {/* Horizontal Layout on all screen sizes: Coin A | VS | Coin B */}
          <div className="grid grid-cols-[1fr_auto_1fr] gap-4 sm:gap-6 md:gap-8 items-stretch">
            
            {/* Coin A - Left Side (Top on mobile) */}
            <div className={`relative rounded-lg border transition-all min-h-[350px] sm:min-h-[400px] flex flex-col ${
              isSettled && market.winningPosition === 'UP' 
                ? 'border-green-500 bg-green-500/5' 
                : 'border-muted hover:border-blue-500/40 bg-card'
            }`}>
              {/* Coin A Image - Top Left Corner */}
              <div className="absolute top-3 left-3 z-10">
                {market.coinAImage ? (
                  <img 
                    src={market.coinAImage} 
                    alt={market.coinASymbol} 
                    className="w-10 h-10 sm:w-12 sm:h-12 rounded-full border-2 border-muted shadow-md" 
                  />
                ) : (
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-blue-500/10 border-2 border-muted shadow-md flex items-center justify-center text-sm sm:text-base font-semibold">
                    {market.coinASymbol.charAt(0)}
                  </div>
                )}
              </div>

              {/* Price Info - Top Right */}
              <div className="absolute top-3 right-3 text-right z-10">
                <div className="font-mono text-sm sm:text-base font-bold">{formatPrice(coinAPrice)}</div>
                <div className={`text-xs sm:text-sm font-bold ${coinAChange >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {coinAChange >= 0 ? '+' : ''}{coinAChange.toFixed(2)}%
                </div>
              </div>

              <div className="p-3 sm:p-4 pt-16 sm:pt-20 flex-1 flex flex-col">
                <div className="mb-2 sm:mb-3">
                  <div className="font-bold text-xl sm:text-2xl">{market.coinASymbol}</div>
                  {market.coinAName && (
                    <div className="text-xs text-muted-foreground truncate">{market.coinAName}</div>
                  )}
                </div>
                
                {/* Coin A Chart */}
                {market.coinAAddress && (
                  <div className="mb-3 sm:mb-4 flex-1">
                    <CoinChart
                      name={market.coinAName || market.coinASymbol}
                      symbol={market.coinASymbol}
                      volume="N/A"
                      growth={`${coinAChange >= 0 ? '+' : ''}${coinAChange.toFixed(2)}%`}
                      contractAddress={market.coinAAddress}
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
                
                <div className="mt-2 sm:mt-3 text-xs text-muted-foreground text-center">
                  Pool: {coinAPoolPercent.toFixed(1)}%
                </div>
              </div>
            </div>

            {/* VS Divider - Center (always visible in horizontal layout) */}
            <div className="flex flex-col items-center justify-center px-2 sm:px-4 gap-4">
              {/* Winning indicator - only show during active betting or after settlement */}
              {(coinAChange !== 0 || coinBChange !== 0) && (
                <div className="flex flex-col items-center gap-3">
                  {/* Animated percentage display */}
                  <div 
                    className="text-2xl sm:text-3xl font-bold animate-pulse"
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
                  <div className="text-sm sm:text-base font-bold" style={{ color: '#fffd7e' }}>
                    Winning:
                  </div>
                  {coinAChange > coinBChange ? (
                    market.coinAImage ? (
                      <img 
                        src={market.coinAImage} 
                        alt={market.coinASymbol} 
                        className="w-16 h-16 sm:w-20 sm:h-20 rounded-full border-3 border-green-500 shadow-lg" 
                      />
                    ) : (
                      <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-green-500/20 border-3 border-green-500 shadow-lg flex items-center justify-center text-xl font-bold">
                        {market.coinASymbol.charAt(0)}
                      </div>
                    )
                  ) : (
                    market.coinBImage ? (
                      <img 
                        src={market.coinBImage} 
                        alt={market.coinBSymbol} 
                        className="w-16 h-16 sm:w-20 sm:h-20 rounded-full border-3 border-green-500 shadow-lg" 
                      />
                    ) : (
                      <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-green-500/20 border-3 border-green-500 shadow-lg flex items-center justify-center text-xl font-bold">
                        {market.coinBSymbol.charAt(0)}
                      </div>
                    )
                  )}
                </div>
              )}
              
              <div className="rounded-lg border border-muted bg-muted/30 px-3 py-4 sm:px-4 sm:py-6">
                <div className="text-xl sm:text-2xl font-bold text-foreground">
                  VS
                </div>
              </div>
            </div>

            {/* Coin B - Right Side (Bottom on mobile) */}
            <div className={`relative rounded-lg border transition-all min-h-[350px] sm:min-h-[400px] flex flex-col ${
              isSettled && market.winningPosition === 'DOWN' 
                ? 'border-green-500 bg-green-500/5' 
                : 'border-muted hover:border-purple-500/40 bg-card'
            }`}>
              {/* Price Info - Top Left */}
              <div className="absolute top-3 left-3 text-left z-10">
                <div className="font-mono text-sm sm:text-base font-bold">{formatPrice(coinBPrice)}</div>
                <div className={`text-xs sm:text-sm font-bold ${coinBChange >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {coinBChange >= 0 ? '+' : ''}{coinBChange.toFixed(2)}%
                </div>
              </div>

              {/* Coin B Image - Top Right Corner */}
              <div className="absolute top-3 right-3 z-10">
                {market.coinBImage ? (
                  <img 
                    src={market.coinBImage} 
                    alt={market.coinBSymbol} 
                    className="w-10 h-10 sm:w-12 sm:h-12 rounded-full border-2 border-muted shadow-md" 
                  />
                ) : (
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-purple-500/10 border-2 border-muted shadow-md flex items-center justify-center text-sm sm:text-base font-semibold">
                    {market.coinBSymbol.charAt(0)}
                  </div>
                )}
              </div>

              <div className="p-3 sm:p-4 pt-16 sm:pt-20 flex-1 flex flex-col">
                <div className="mb-2 sm:mb-3">
                  <div className="font-bold text-xl sm:text-2xl">{market.coinBSymbol}</div>
                  {market.coinBName && (
                    <div className="text-xs text-muted-foreground truncate">{market.coinBName}</div>
                  )}
                </div>
                
                {/* Coin B Chart */}
                {market.coinBAddress && (
                  <div className="mb-3 sm:mb-4 flex-1">
                    <CoinChart
                      name={market.coinBName || market.coinBSymbol}
                      symbol={market.coinBSymbol}
                      volume="N/A"
                      growth={`${coinBChange >= 0 ? '+' : ''}${coinBChange.toFixed(2)}%`}
                      contractAddress={market.coinBAddress}
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
                
                <div className="mt-2 sm:mt-3 text-xs text-muted-foreground text-center">
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
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm pt-3 border-t">
            <div>Total Bets: <span className="font-semibold">{market.totalBets}</span></div>
            <div>Total Pool: <span className="font-semibold">{totalPool.toLocaleString()}</span></div>
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
