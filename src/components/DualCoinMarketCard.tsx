import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Clock, Lock, CheckCircle2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { BetDialog } from './BetDialog';
import { useLiveCoinPrice } from '@/hooks/useLiveCoinPrice';
import { useDualCoinBucketLiquidity, useMaxBetSize } from '@/hooks/useContract';
import { createPublicClient, http, parseAbiItem } from 'viem';
import { base } from 'wagmi/chains';
import { useChainId } from 'wagmi';
import { DUAL_COIN_CONTRACT_ADDRESSES } from '@/config/contract';

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
  // Prices are stored in two formats:
  // - If original price < $0.01: stored as price * 100,000,000 (micro-units)
  // - If original price >= $0.01: stored as price * 100 (cents)
  // 
  // Detection logic:
  // - Cents format: 1 to 9,999 (represents $0.01 to $99.99)
  // - Micro-units format: 10,000+ (represents $0.0001 to $0.00999999)
  // 
  // Threshold at 10,000: Anything >= 10K treated as micro-units
  // (10K cents = $100, very rare for meme coins, safer to assume micro-units)
  if (price >= 10_000) {
    // Micro-units format for tiny prices
    return price / 100_000_000;
  }
  // Cents format for normal prices
  return price / 100;
}

export function DualCoinMarketCard({ market, userBet }: DualCoinMarketCardProps) {
  const [showBetDialog, setShowBetDialog] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState<'UP' | 'DOWN'>('UP');
  const [onChainBetCount, setOnChainBetCount] = useState<number | null>(null);
  const chainId = useChainId();

  // Fetch live prices from DexScreener
  const { data: coinAData } = useLiveCoinPrice(market.coinAAddress);
  const { data: coinBData } = useLiveCoinPrice(market.coinBAddress);

  // Fetch real-time on-chain pool liquidity for dynamic percentages (using dual coin contract)
  const { liquidity: coinALiquidity } = useDualCoinBucketLiquidity(market.blockchainMarketId, 0);
  const { liquidity: coinBLiquidity } = useDualCoinBucketLiquidity(market.blockchainMarketId, 1);

  // Get max bet size
  const { maxBetSize } = useMaxBetSize();

  // Fetch on-chain bet count
  useEffect(() => {
    async function fetchBetCount() {
      if (market.blockchainMarketId == null) {
        return;
      }

      try {
        const activeChainId = 8453; // Base mainnet only
        const contractAddress = DUAL_COIN_CONTRACT_ADDRESSES[activeChainId as keyof typeof DUAL_COIN_CONTRACT_ADDRESSES];
        const rpcUrl = 'https://mainnet.base.org';
        
        const publicClient = createPublicClient({
          chain: base,
          transport: http(rpcUrl),
        });

        const currentBlock = await publicClient.getBlockNumber();
        
        // Query in chunks to avoid exceeding RPC's 100k block limit
        const CHUNK_SIZE = 50000n;
        const LOOKBACK_BLOCKS = 500000n;
        const startBlock = currentBlock > LOOKBACK_BLOCKS ? currentBlock - LOOKBACK_BLOCKS : 0n;

        const allLogs: any[] = [];
        
        // Query in chunks
        for (let fromBlock = startBlock; fromBlock < currentBlock; fromBlock += CHUNK_SIZE) {
          const toBlock = fromBlock + CHUNK_SIZE - 1n > currentBlock ? currentBlock : fromBlock + CHUNK_SIZE - 1n;
          
          const logs = await publicClient.getLogs({
            address: contractAddress as `0x${string}`,
            event: parseAbiItem('event SharesPurchased(uint256 indexed marketId, address indexed user, uint8 outcomeIndex, uint256 shares, uint256 cost)'),
            args: {
              marketId: BigInt(market.blockchainMarketId),
            },
            fromBlock: fromBlock,
            toBlock: toBlock,
          });
          
          allLogs.push(...logs);
        }

        setOnChainBetCount(allLogs.length);
      } catch (error) {
        console.error('Error fetching bet count:', error);
      }
    }

    fetchBetCount();
    const interval = setInterval(fetchBetCount, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [market.blockchainMarketId]);

  const isLocked = market.status === 'LOCKED';
  const isSettled = market.status === 'SETTLED';
  const isActive = market.status === 'ACTIVE';

  // Convert opening prices from storage format to USD
  // Opening prices are now stored as raw USD values (no encoding/decoding needed)
  const coinAOpeningPrice = market.coinAOpeningPrice;
  const coinBOpeningPrice = market.coinBOpeningPrice;

  // Use live prices when available (already in USD from API), fall back to market data
  const coinAPrice = (coinAData?.price !== undefined && coinAData?.price !== null)
    ? coinAData.price
    : (market.coinACurrentPrice 
        ? convertPriceToUSD(market.coinACurrentPrice)
        : coinAOpeningPrice);

  const coinBPrice = (coinBData?.price !== undefined && coinBData?.price !== null)
    ? coinBData.price
    : (market.coinBCurrentPrice 
        ? convertPriceToUSD(market.coinBCurrentPrice)
        : coinBOpeningPrice);

  // Calculate percentage change from market opening price (not 24h change)
  // For settled markets, use stored change percent. For active/locked, calculate live from opening price
  const coinAChange = isSettled 
    ? (market.coinAChangePercent ?? 0)
    : ((coinAPrice - coinAOpeningPrice) / coinAOpeningPrice) * 100;
  
  const coinBChange = isSettled 
    ? (market.coinBChangePercent ?? 0)
    : ((coinBPrice - coinBOpeningPrice) / coinBOpeningPrice) * 100;

  const handleBet = (coin: 'A' | 'B') => {
    // Set position based on which coin was selected
    // 'UP' = Coin A (bucket 0), 'DOWN' = Coin B (bucket 1)
    setSelectedPosition(coin === 'A' ? 'UP' : 'DOWN');
    setShowBetDialog(true);
  };

  const formatPrice = (price: number | undefined) => {
    if (!price || price === 0) return '$0.00';
    
    // Use toPrecision for significant figures, then clean up trailing zeros
    let formatted: string;
    if (price < 0.00001) {
      formatted = price.toPrecision(4); // 4 significant figures for tiny prices
    } else if (price < 0.001) {
      formatted = price.toPrecision(5); // 5 significant figures
    } else if (price < 1) {
      formatted = price.toPrecision(6); // 6 significant figures
    } else {
      formatted = price.toPrecision(7); // 7 significant figures for prices $1+
    }
    
    // Remove trailing zeros and unnecessary decimal point
    formatted = parseFloat(formatted).toString();
    return `$${formatted}`;
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
            <div className={`relative rounded-lg border transition-all flex flex-col overflow-hidden p-4 sm:p-6 ${
              isSettled && market.winningPosition === 'UP' 
                ? 'border-green-500 bg-green-500/5' 
                : 'border-muted hover:border-blue-500/40 bg-card/80'
            }`}>
              <div className="flex flex-col items-center justify-center flex-1 space-y-4">
                {/* Percentage Change - Above Image */}
                <div 
                  className={`text-3xl sm:text-4xl md:text-5xl font-bold animate-pulse`}
                  style={{
                    color: coinAChange >= 0 ? '#00ff00' : '#ff0000',
                    textShadow: coinAChange >= 0 ? '0 0 10px #00ff00, 0 0 20px #00ff00' : '0 0 10px #ff0000, 0 0 20px #ff0000'
                  }}
                >
                  {coinAChange >= 0 ? '+' : ''}{coinAChange.toFixed(2)}%
                </div>
                
                {/* Coin A Image - Center */}
                <div className="my-4">
                  {market.coinAImage ? (
                    <img 
                      src={market.coinAImage} 
                      alt={market.coinASymbol} 
                      className="w-24 h-24 sm:w-32 sm:h-32 md:w-40 md:h-40 rounded-full shadow-lg coin-gold-border" 
                    />
                  ) : (
                    <div className="w-24 h-24 sm:w-32 sm:h-32 md:w-40 md:h-40 rounded-full bg-blue-500/10 border-4 border-muted shadow-lg flex items-center justify-center text-4xl font-bold">
                      {market.coinASymbol.charAt(0)}
                    </div>
                  )}
                </div>
                
                {/* Symbol and Name */}
                <div className="text-center">
                  <div className="font-bold text-xl sm:text-2xl md:text-3xl text-white">{market.coinASymbol}</div>
                  {market.coinAName && (
                    <div className="text-xs sm:text-sm text-muted-foreground truncate mt-1">{market.coinAName}</div>
                  )}
                  {/* Price Information */}
                  <div className="mt-2 space-y-1">
                    <div className="text-xs text-muted-foreground">
                      Open: {formatPrice(coinAOpeningPrice)}
                    </div>
                    <div className="text-sm font-semibold text-foreground">
                      Now: {formatPrice(coinAPrice)}
                    </div>
                  </div>
                </div>
                
                {/* Pool Liquidity Percentage - Below Image */}
                <div className="text-4xl sm:text-5xl md:text-6xl font-bold text-white">
                  {coinAPoolPercent.toFixed(1)}%
                </div>
                <div className="text-xs sm:text-sm text-muted-foreground">Pool Liquidity</div>
                
                {/* Bet Button */}
                {isActive && !userBet && (
                  <Button 
                    onClick={() => handleBet('A')}
                    className="w-full font-semibold text-black mt-4"
                    style={{ backgroundColor: '#fffd7e' }}
                    size="lg"
                  >
                    <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
                    Bet on {market.coinASymbol}
                  </Button>
                )}
              </div>
            </div>

            {/* VS Divider - Center (always visible in horizontal layout) */}
            <div className="flex flex-col items-center justify-center px-0.5 sm:px-2 md:px-4 gap-1 sm:gap-3 md:gap-4">
              {/* Winning indicator - only show during active betting or after settlement */}
              {(coinAChange !== 0 || coinBChange !== 0) && (
                <div className="flex flex-col items-center gap-2 sm:gap-2 md:gap-3 mb-2 sm:mb-0">
                  {/* Animated percentage display - Larger on mobile */}
                  <div 
                    className="text-lg sm:text-2xl md:text-3xl font-bold animate-pulse"
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
                  <div className="text-xs sm:text-sm md:text-base font-bold -mt-1" style={{ color: '#fffd7e' }}>
                    Winning:
                  </div>
                  {coinAChange > coinBChange ? (
                    market.coinAImage ? (
                      <img 
                        src={market.coinAImage} 
                        alt={market.coinASymbol} 
                        className="w-10 h-10 sm:w-16 sm:h-16 md:w-20 md:h-20 rounded-full shadow-lg coin-gold-border" 
                      />
                    ) : (
                      <div className="w-10 h-10 sm:w-20 sm:h-20 rounded-full bg-green-500/20 border-3 border-green-500 shadow-lg flex items-center justify-center text-sm sm:text-xl font-bold">
                        {market.coinASymbol.charAt(0)}
                      </div>
                    )
                  ) : (
                    market.coinBImage ? (
                      <img 
                        src={market.coinBImage} 
                        alt={market.coinBSymbol} 
                        className="w-10 h-10 sm:w-20 sm:h-20 rounded-full shadow-lg coin-gold-border" 
                      />
                    ) : (
                      <div className="w-10 h-10 sm:w-20 sm:h-20 rounded-full bg-green-500/20 border-3 border-green-500 shadow-lg flex items-center justify-center text-sm sm:text-xl font-bold">
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
            <div className={`relative rounded-lg border transition-all flex flex-col overflow-hidden p-4 sm:p-6 ${
              isSettled && market.winningPosition === 'DOWN' 
                ? 'border-green-500 bg-green-500/5' 
                : 'border-muted hover:border-purple-500/40 bg-card/80'
            }`}>
              <div className="flex flex-col items-center justify-center flex-1 space-y-4">
                {/* Percentage Change - Above Image */}
                <div 
                  className={`text-3xl sm:text-4xl md:text-5xl font-bold animate-pulse`}
                  style={{
                    color: coinBChange >= 0 ? '#00ff00' : '#ff0000',
                    textShadow: coinBChange >= 0 ? '0 0 10px #00ff00, 0 0 20px #00ff00' : '0 0 10px #ff0000, 0 0 20px #ff0000'
                  }}
                >
                  {coinBChange >= 0 ? '+' : ''}{coinBChange.toFixed(2)}%
                </div>
                
                {/* Coin B Image - Center */}
                <div className="my-4">
                  {market.coinBImage ? (
                    <img 
                      src={market.coinBImage} 
                      alt={market.coinBSymbol} 
                      className="w-24 h-24 sm:w-32 sm:h-32 md:w-40 md:h-40 rounded-full shadow-lg coin-gold-border" 
                    />
                  ) : (
                    <div className="w-24 h-24 sm:w-32 sm:h-32 md:w-40 md:h-40 rounded-full bg-purple-500/10 border-4 border-muted shadow-lg flex items-center justify-center text-4xl font-bold">
                      {market.coinBSymbol.charAt(0)}
                    </div>
                  )}
                </div>
                
                {/* Symbol and Name */}
                <div className="text-center">
                  <div className="font-bold text-xl sm:text-2xl md:text-3xl text-white">{market.coinBSymbol}</div>
                  {market.coinBName && (
                    <div className="text-xs sm:text-sm text-muted-foreground truncate mt-1">{market.coinBName}</div>
                  )}
                  {/* Price Information */}
                  <div className="mt-2 space-y-1">
                    <div className="text-xs text-muted-foreground">
                      Open: {formatPrice(coinBOpeningPrice)}
                    </div>
                    <div className="text-sm font-semibold text-foreground">
                      Now: {formatPrice(coinBPrice)}
                    </div>
                  </div>
                </div>
                
                {/* Pool Liquidity Percentage - Below Image */}
                <div className="text-4xl sm:text-5xl md:text-6xl font-bold text-white">
                  {coinBPoolPercent.toFixed(1)}%
                </div>
                <div className="text-xs sm:text-sm text-muted-foreground">Pool Liquidity</div>
                
                {/* Bet Button */}
                {isActive && !userBet && (
                  <Button 
                    onClick={() => handleBet('B')}
                    className="w-full font-semibold text-black mt-4"
                    style={{ backgroundColor: '#fffd7e' }}
                    size="lg"
                  >
                    <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
                    Bet on {market.coinBSymbol}
                  </Button>
                )}
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
            <div>Total Bets: <span className="font-semibold">{onChainBetCount !== null ? onChainBetCount : market.totalBets}</span></div>
            <div>Total Pool: <span className="font-semibold">
              {coinALiquidity !== undefined && coinBLiquidity !== undefined 
                ? ((Number(coinALiquidity) + Number(coinBLiquidity)) / 1e6).toFixed(2)
                : (market.upPool + market.downPool).toLocaleString()
              } {coinALiquidity !== undefined && coinBLiquidity !== undefined ? 'USDC' : ''}
            </span></div>
            <div className="col-span-2">Max Bet: <span className="font-semibold">
              {maxBetSize !== undefined 
                ? `${(Number(maxBetSize) / 1e6).toFixed(2)} USDC`
                : 'Loading...'
              }
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
            isDualCoin: true, // CRITICAL: Mark as dual coin market to use correct contract
          } as any}
          position={selectedPosition}
          odds={2.0} // Placeholder - actual odds calculated from probabilities
          bucketIndex={selectedPosition === 'UP' ? 0 : 1} // Dual-coin has 2 buckets: 0=Coin A, 1=Coin B
          coinName={selectedPosition === 'UP' ? market.coinASymbol : market.coinBSymbol} // Show coin name
          onBetPlaced={() => {
            setShowBetDialog(false);
          }}
        />
      )}
    </>
  );
}
