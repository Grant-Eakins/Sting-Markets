import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Clock, Lock, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import { BetDialog } from './BetDialog';
import { CoinChart } from './CoinChart';

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

  const isLocked = market.status === 'LOCKED';
  const isSettled = market.status === 'SETTLED';
  const isActive = market.status === 'ACTIVE';

  const coinAPrice = isSettled && market.coinAClosingPrice 
    ? convertPriceToUSD(market.coinAClosingPrice)
    : market.coinACurrentPrice 
    ? convertPriceToUSD(market.coinACurrentPrice)
    : market.coinAOpeningPrice 
    ? convertPriceToUSD(market.coinAOpeningPrice)
    : 0;

  const coinBPrice = isSettled && market.coinBClosingPrice 
    ? convertPriceToUSD(market.coinBClosingPrice)
    : market.coinBCurrentPrice 
    ? convertPriceToUSD(market.coinBCurrentPrice)
    : market.coinBOpeningPrice
    ? convertPriceToUSD(market.coinBOpeningPrice)
    : 0;

  const coinAChange = market.coinAChangePercent ?? 
    ((market.coinACurrentPrice && market.coinAOpeningPrice
      ? ((market.coinACurrentPrice - market.coinAOpeningPrice) / market.coinAOpeningPrice) * 100 
      : 0) || 0);

  const coinBChange = market.coinBChangePercent ?? 
    ((market.coinBCurrentPrice && market.coinBOpeningPrice
      ? ((market.coinBCurrentPrice - market.coinBOpeningPrice) / market.coinBOpeningPrice) * 100 
      : 0) || 0);

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
      <Card className="hover:shadow-xl transition-all duration-300 border-2 border-yellow-500/50 bg-gradient-to-br from-background via-background to-yellow-500/5">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-2xl font-bold flex items-center gap-2">
              <span className="text-3xl">🐝</span>
              <span className="bg-gradient-to-r from-yellow-400 to-orange-500 bg-clip-text text-transparent">
                STING BATTLE
              </span>
            </CardTitle>
            {isActive && (
              <Badge variant="default" className="bg-green-500 animate-pulse">
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

        <CardContent className="space-y-4">
          {/* Horizontal Layout: Coin A | VS | Coin B */}
          <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-center">
            
            {/* Coin A - Left Side */}
            <div className={`p-4 rounded-lg border-2 transition-all ${
              isSettled && market.winningPosition === 'UP' 
                ? 'border-green-500 bg-green-500/20 shadow-lg shadow-green-500/50' 
                : 'border-blue-500/50 hover:border-blue-500'
            }`}>
              {/* Coin A Image - Large in corner */}
              <div className="flex items-start justify-between mb-3">
                <div className="relative">
                  {market.coinAImage && (
                    <img 
                      src={market.coinAImage} 
                      alt={market.coinASymbol} 
                      className="w-16 h-16 rounded-full ring-4 ring-blue-500/30 shadow-lg" 
                    />
                  )}
                  {isSettled && market.winningPosition === 'UP' && (
                    <div className="absolute -top-1 -right-1 text-2xl animate-bounce">👑</div>
                  )}
                </div>
                <div className="text-right">
                  <div className="font-mono text-lg font-bold">{formatPrice(coinAPrice)}</div>
                  <div className={`text-sm font-bold ${coinAChange >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {coinAChange >= 0 ? '↗' : '↘'} {coinAChange >= 0 ? '+' : ''}{coinAChange.toFixed(2)}%
                  </div>
                </div>
              </div>

              <div className="mb-2">
                <div className="font-bold text-xl">{market.coinASymbol}</div>
                {market.coinAName && (
                  <div className="text-xs text-muted-foreground truncate">{market.coinAName}</div>
                )}
              </div>
              
              {/* Coin A Chart */}
              {market.coinAAddress && (
                <div className="mb-3">
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
                  className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 shadow-lg hover:shadow-blue-500/50 transition-all"
                  size="lg"
                >
                  <TrendingUp className="w-5 h-5 mr-2" />
                  BET {market.coinASymbol}
                </Button>
              )}
              
              <div className="mt-2 text-xs text-muted-foreground text-center">
                Pool: {coinAPoolPercent.toFixed(1)}%
              </div>
            </div>

            {/* VS Divider - Center with Hornet Theme */}
            <div className="flex flex-col items-center justify-center px-2 py-8">
              <div className="relative">
                {/* Hornet Sting Effect */}
                <div className="absolute inset-0 bg-yellow-500/20 blur-xl rounded-full animate-pulse"></div>
                <div className="relative bg-gradient-to-br from-yellow-400 via-orange-500 to-red-500 rounded-full p-4 shadow-2xl border-4 border-yellow-300/50">
                  <div className="text-4xl font-black text-white drop-shadow-lg tracking-wider">
                    VS
                  </div>
                </div>
              </div>
              <div className="mt-3 text-xs font-bold text-yellow-600 dark:text-yellow-400 uppercase tracking-widest">
                ⚡ Duel ⚡
              </div>
            </div>

            {/* Coin B - Right Side */}
            <div className={`p-4 rounded-lg border-2 transition-all ${
              isSettled && market.winningPosition === 'DOWN' 
                ? 'border-green-500 bg-green-500/20 shadow-lg shadow-green-500/50' 
                : 'border-purple-500/50 hover:border-purple-500'
            }`}>
              {/* Coin B Image - Large in corner */}
              <div className="flex items-start justify-between mb-3">
                <div className="text-left">
                  <div className="font-mono text-lg font-bold">{formatPrice(coinBPrice)}</div>
                  <div className={`text-sm font-bold ${coinBChange >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {coinBChange >= 0 ? '↗' : '↘'} {coinBChange >= 0 ? '+' : ''}{coinBChange.toFixed(2)}%
                  </div>
                </div>
                <div className="relative">
                  {market.coinBImage && (
                    <img 
                      src={market.coinBImage} 
                      alt={market.coinBSymbol} 
                      className="w-16 h-16 rounded-full ring-4 ring-purple-500/30 shadow-lg" 
                    />
                  )}
                  {isSettled && market.winningPosition === 'DOWN' && (
                    <div className="absolute -top-1 -right-1 text-2xl animate-bounce">👑</div>
                  )}
                </div>
              </div>

              <div className="mb-2">
                <div className="font-bold text-xl">{market.coinBSymbol}</div>
                {market.coinBName && (
                  <div className="text-xs text-muted-foreground truncate">{market.coinBName}</div>
                )}
              </div>
              
              {/* Coin B Chart */}
              {market.coinBAddress && (
                <div className="mb-3">
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
                  className="w-full bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 shadow-lg hover:shadow-purple-500/50 transition-all"
                  size="lg"
                >
                  <TrendingUp className="w-5 h-5 mr-2" />
                  BET {market.coinBSymbol}
                </Button>
              )}
              
              <div className="mt-2 text-xs text-muted-foreground text-center">
                Pool: {coinBPoolPercent.toFixed(1)}%
              </div>
            </div>
          </div>

          {/* User's Bet */}
          {userBet && (
            <div className="p-3 bg-gradient-to-r from-yellow-500/10 to-orange-500/10 rounded-lg border-2 border-yellow-500/30">
              <div className="text-sm font-semibold flex items-center gap-2">
                <span className="text-lg">🎯</span>
                Your Bet: {userBet.amount.toLocaleString()} tokens on{' '}
                <span className="font-bold text-lg">
                  {userBet.position === 'UP' ? market.coinASymbol : market.coinBSymbol}
                </span>
              </div>
              {isSettled && (
                <div className={`text-sm mt-1 font-bold ${
                  userBet.position === market.winningPosition ? 'text-green-500' : 'text-red-500'
                }`}>
                  {userBet.position === market.winningPosition ? '🎉 WINNER! You stung them!' : '😢 Better luck next battle'}
                </div>
              )}
            </div>
          )}

          {/* Market Stats */}
          <div className="grid grid-cols-2 gap-2 text-xs font-semibold pt-2 border-t border-yellow-500/20">
            <div className="flex items-center gap-1">
              <span>📊</span> Total Bets: {market.totalBets}
            </div>
            <div className="flex items-center gap-1">
              <span>💰</span> Total Pool: {totalPool.toLocaleString()}
            </div>
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
