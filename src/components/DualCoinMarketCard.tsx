import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Clock, Lock, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import { BetDialog } from './BetDialog';

interface DualCoinMarketCardProps {
  market: {
    id: string;
    coinASymbol: string;
    coinAName?: string;
    coinAImage?: string;
    coinAOpeningPrice: number;
    coinACurrentPrice?: number;
    coinAClosingPrice?: number;
    coinAChangePercent?: number;
    coinBSymbol: string;
    coinBName?: string;
    coinBImage?: string;
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
      <Card className="hover:shadow-lg transition-shadow border-2 border-primary/20">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl font-bold">
              ⚔️ Coin Battle
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

        <CardContent className="space-y-4">
          {/* Coin A */}
          <div className={`p-4 rounded-lg border-2 ${
            isSettled && market.winningPosition === 'UP' 
              ? 'border-green-500 bg-green-500/10' 
              : 'border-primary/30'
          }`}>
            <div className="flex items-center gap-3 mb-2">
              {market.coinAImage && (
                <img src={market.coinAImage} alt={market.coinASymbol} className="w-8 h-8 rounded-full" />
              )}
              <div className="flex-1">
                <div className="font-bold text-lg">{market.coinASymbol}</div>
                {market.coinAName && (
                  <div className="text-xs text-muted-foreground">{market.coinAName}</div>
                )}
              </div>
              <div className="text-right">
                <div className="font-mono text-sm">{formatPrice(coinAPrice)}</div>
                <div className={`text-xs font-semibold ${coinAChange >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {coinAChange >= 0 ? '+' : ''}{coinAChange.toFixed(2)}%
                </div>
              </div>
            </div>
            
            {isActive && !userBet && (
              <Button 
                onClick={() => handleBet('UP')}
                className="w-full bg-green-600 hover:bg-green-700"
                size="sm"
              >
                <TrendingUp className="w-4 h-4 mr-2" />
                Bet on {market.coinASymbol}
              </Button>
            )}
            
            <div className="mt-2 text-xs text-muted-foreground">
              Pool: {coinAPoolPercent.toFixed(1)}% ({market.upPool.toLocaleString()} {' tokens'})
            </div>
          </div>

          {/* VS Divider */}
          <div className="text-center font-bold text-muted-foreground text-sm">
            VS
          </div>

          {/* Coin B */}
          <div className={`p-4 rounded-lg border-2 ${
            isSettled && market.winningPosition === 'DOWN' 
              ? 'border-green-500 bg-green-500/10' 
              : 'border-primary/30'
          }`}>
            <div className="flex items-center gap-3 mb-2">
              {market.coinBImage && (
                <img src={market.coinBImage} alt={market.coinBSymbol} className="w-8 h-8 rounded-full" />
              )}
              <div className="flex-1">
                <div className="font-bold text-lg">{market.coinBSymbol}</div>
                {market.coinBName && (
                  <div className="text-xs text-muted-foreground">{market.coinBName}</div>
                )}
              </div>
              <div className="text-right">
                <div className="font-mono text-sm">{formatPrice(coinBPrice)}</div>
                <div className={`text-xs font-semibold ${coinBChange >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {coinBChange >= 0 ? '+' : ''}{coinBChange.toFixed(2)}%
                </div>
              </div>
            </div>
            
            {isActive && !userBet && (
              <Button 
                onClick={() => handleBet('DOWN')}
                className="w-full bg-red-600 hover:bg-red-700"
                size="sm"
              >
                <TrendingDown className="w-4 h-4 mr-2" />
                Bet on {market.coinBSymbol}
              </Button>
            )}
            
            <div className="mt-2 text-xs text-muted-foreground">
              Pool: {coinBPoolPercent.toFixed(1)}% ({market.downPool.toLocaleString()} {' tokens'})
            </div>
          </div>

          {/* User's Bet */}
          {userBet && (
            <div className="p-3 bg-primary/10 rounded-lg border border-primary/30">
              <div className="text-sm font-semibold">
                Your Bet: {userBet.amount.toLocaleString()} tokens on{' '}
                {userBet.position === 'UP' ? market.coinASymbol : market.coinBSymbol}
              </div>
              {isSettled && (
                <div className={`text-xs mt-1 font-semibold ${
                  userBet.position === market.winningPosition ? 'text-green-500' : 'text-red-500'
                }`}>
                  {userBet.position === market.winningPosition ? '🎉 Winner!' : '😢 Better luck next time'}
                </div>
              )}
            </div>
          )}

          {/* Market Stats */}
          <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground pt-2 border-t">
            <div>Total Bets: {market.totalBets}</div>
            <div>Total Pool: {totalPool.toLocaleString()}</div>
          </div>
        </CardContent>
      </Card>

      {showBetDialog && (
        <BetDialog
          onClose={() => setShowBetDialog(false)}
          market={{
            id: market.id,
            stockSymbol: `${market.coinASymbol} vs ${market.coinBSymbol}`,
            stockName: 'Dual Coin Battle',
            currentPrice: 0,
            openingPrice: 0,
            upPool: market.upPool,
            downPool: market.downPool,
          } as any}
          position={selectedPosition}
          odds={2.0}
          onBetPlaced={() => {
            setShowBetDialog(false);
          }}
        />
      )}
    </>
  );
}
