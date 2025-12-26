import { Card } from '@/components/ui/card';
import { CountdownTimer } from './CountdownTimer';
import { Swords } from 'lucide-react';

interface ScheduledMarketCardProps {
  coinASymbol: string;
  coinBSymbol: string;
  coinAImage?: string;
  coinBImage?: string;
  startTime: string;
  onComplete?: () => void;
}

export function ScheduledMarketCard({
  coinASymbol,
  coinBSymbol,
  coinAImage,
  coinBImage,
  startTime,
  onComplete,
}: ScheduledMarketCardProps) {
  return (
    <Card className="w-full bg-card border-2 border-yellow-500/50 shadow-lg hover:shadow-yellow-500/20 transition-all duration-300">
      <div className="p-4 sm:p-6">
        {/* Header */}
        <div className="text-center mb-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-yellow-500/20 rounded-full border border-yellow-500/50">
            <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse" />
            <span className="text-xs sm:text-sm font-semibold text-yellow-500">
              UPCOMING BATTLE
            </span>
          </div>
        </div>

        {/* Coin Battle Display */}
        <div className="flex items-center justify-center gap-3 sm:gap-6 mb-6">
          {/* Coin A */}
          <div className="flex flex-col items-center gap-2">
            {coinAImage ? (
              <div className="relative">
                <img
                  src={coinAImage}
                  alt={coinASymbol}
                  className="w-16 h-16 sm:w-20 sm:h-20 rounded-full border-2 border-green-500/50 shadow-lg hover:scale-110 transition-transform"
                />
                <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center text-xs font-bold">
                  ↑
                </div>
              </div>
            ) : (
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-green-500/20 border-2 border-green-500/50 flex items-center justify-center text-2xl font-bold">
                {coinASymbol.charAt(0)}
              </div>
            )}
            <span className="text-sm sm:text-base font-bold text-green-400">
              {coinASymbol}
            </span>
          </div>

          {/* VS Symbol */}
          <div className="flex flex-col items-center">
            <Swords className="w-8 h-8 sm:w-10 sm:h-10 text-yellow-500 animate-pulse" />
            <span className="text-lg sm:text-xl font-bold text-yellow-500 mt-1">
              VS
            </span>
          </div>

          {/* Coin B */}
          <div className="flex flex-col items-center gap-2">
            {coinBImage ? (
              <div className="relative">
                <img
                  src={coinBImage}
                  alt={coinBSymbol}
                  className="w-16 h-16 sm:w-20 sm:h-20 rounded-full border-2 border-green-500/50 shadow-lg hover:scale-110 transition-transform"
                />
                <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center text-xs font-bold">
                  ↑
                </div>
              </div>
            ) : (
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-green-500/20 border-2 border-green-500/50 flex items-center justify-center text-2xl font-bold">
                {coinBSymbol.charAt(0)}
              </div>
            )}
            <span className="text-sm sm:text-base font-bold text-green-400">
              {coinBSymbol}
            </span>
          </div>
        </div>

        {/* Countdown Timer */}
        <div className="pt-4 border-t border-border/50">
          <CountdownTimer startTime={startTime} onComplete={onComplete} />
        </div>

        {/* Info Text */}
        <div className="mt-4 text-center">
          <p className="text-xs sm:text-sm text-muted-foreground">
            Which coin will dominate the next 12 hours?
          </p>
        </div>
      </div>
    </Card>
  );
}
