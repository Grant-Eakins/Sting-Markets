import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TrendingUp, TrendingDown, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Market, placeBet } from '@/lib/marketApi';
import { useAccount, useChainId } from 'wagmi';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { usePlaceBet, Position, useMarketProbabilities } from '@/hooks/useContract';
import { CONTRACT_ADDRESSES } from '@/config/contract';
import { useEthPrice, formatEthToUsd } from '@/hooks/useEthPrice';

interface BetDialogProps {
  market: Market;
  position: 'UP' | 'DOWN';
  odds: number;
  bucketIndex?: number; // Actual contract bucket index from PriceSpinner
  onClose: () => void;
  onBetPlaced: () => void;
}

export function BetDialog({ market, position, odds, bucketIndex, onClose, onBetPlaced }: BetDialogProps) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const [amount, setAmount] = useState('0.01');
  const [error, setError] = useState<string | null>(null);
  const [useDemoMode, setUseDemoMode] = useState(false);

  // Get ETH price for USD conversion
  const { ethPrice } = useEthPrice();

  // Get live probabilities to calculate bucket-specific odds
  const { probabilities } = useMarketProbabilities(market.blockchainMarketId);

  // Smart contract hooks
  const { placeBet: placeBetOnChain, isPending, isConfirming, isConfirmed, error: contractError } = usePlaceBet();
  
  // Default to Base Sepolia (84532) if not connected
  const activeChainId = chainId || 84532;
  const contractAddress = CONTRACT_ADDRESSES[activeChainId as keyof typeof CONTRACT_ADDRESSES];
  const isContractDeployed = contractAddress && contractAddress !== '0x0000000000000000000000000000000000000000';

  // Calculate bucket-specific payout estimate for proportional/parimutuel market
  // Formula: If you win, payout = (yourShares / totalSharesInBucket) * totalPool
  // Approximation: payout ≈ cost / bucketProbability
  let effectiveOdds = odds;
  let bucketProbability = 0;
  
  if (bucketIndex !== undefined && probabilities && probabilities.length > bucketIndex) {
    bucketProbability = probabilities[bucketIndex] / 100; // Convert from percentage to decimal
    if (bucketProbability > 0) {
      // Odds = 1 / probability (e.g., 5% probability = ~20x payout)
      effectiveOdds = Math.min(1 / bucketProbability, 100); // Cap at 100x
    } else {
      // No liquidity in this bucket yet - first bet gets great odds!
      const numBuckets = probabilities.length;
      effectiveOdds = numBuckets; // Approx uniform odds if you're first
    }
  }

  const potentialWin = parseFloat(amount || '0') * effectiveOdds;

  // Auto-close on successful transaction
  useEffect(() => {
    if (isConfirmed) {
      setTimeout(() => {
        onBetPlaced();
        onClose();
      }, 1500);
    }
  }, [isConfirmed, onBetPlaced, onClose]);

  // Handle contract errors
  useEffect(() => {
    if (contractError) {
      setError(contractError.message || 'Transaction failed');
    }
  }, [contractError]);

  const handlePlaceBet = async () => {
    if (!isConnected || !address) {
      setError('Please connect your wallet first');
      return;
    }

    const betAmount = parseFloat(amount);
    if (isNaN(betAmount) || betAmount <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    if (betAmount < 0.001) {
      setError('Minimum bet is 0.001 ETH (~$3 USD)');
      return;
    }

    if (betAmount > 10) {
      setError('Maximum bet is 10 ETH');
      return;
    }

    setError(null);

    // Use blockchain if contract is deployed, otherwise demo mode
    if (isContractDeployed && !useDemoMode) {
      try {
        // Get blockchain market ID from market data
        const marketId = (market as any).blockchainMarketId ?? 0;
        
        if (marketId === undefined || marketId === null) {
          setError('This market has not been created on-chain yet');
          return;
        }
        
        // Use actual bucket index from PriceSpinner, or fallback to middle bucket +/- 1
        let outcomeIndex: number;
        if (bucketIndex !== undefined) {
          outcomeIndex = bucketIndex;
        } else {
          // Fallback: 23 buckets for intraday (index 10 = 0%), 42 for overnight (index 20 = 0%)
          const isAfterHours = market.isAfterHours;
          const middleBucket = isAfterHours ? 20 : 10;
          outcomeIndex = position === 'UP' ? middleBucket - 1 : middleBucket + 1;
        }
        
        console.log(`🎯 Placing bet on bucket ${outcomeIndex} for market ${marketId}`);
        placeBetOnChain(marketId, outcomeIndex, amount);
      } catch (err: any) {
        setError(err.message || 'Failed to place bet');
      }
    } else {
      // Demo mode: use off-chain API
      try {
        await placeBet(market.id, position, betAmount, address);
        onBetPlaced();
        onClose();
      } catch (err: any) {
        setError(err.message || 'Failed to place bet');
      }
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {position === 'UP' ? (
              <>
                <TrendingUp className="w-5 h-5 text-green-500" />
                <span>Bet UP</span>
              </>
            ) : (
              <>
                <TrendingDown className="w-5 h-5 text-red-500" />
                <span>Bet DOWN</span>
              </>
            )}
          </DialogTitle>
          <DialogDescription className="line-clamp-2">
            {market.stockSymbol || market.stockName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Amount Input */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Label htmlFor="amount">Bet Amount (ETH)</Label>
              {ethPrice && amount && (
                <span className="text-xs text-muted-foreground">
                  ≈ {formatEthToUsd(parseFloat(amount) || 0, ethPrice)}
                </span>
              )}
            </div>
            <Input
              id="amount"
              type="number"
              step="0.001"
              min="0.001"
              max="10"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.01"
            />
          </div>

          {/* Odds Display */}
          <div className="p-4 bg-muted rounded-lg space-y-2">
            {bucketIndex !== undefined && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Bucket:</span>
                <span className="font-bold">#{bucketIndex}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Win Chance:</span>
              <span className="font-bold">{(bucketProbability * 100).toFixed(1)}%</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Multiplier:</span>
              <span className="font-bold">{effectiveOdds.toFixed(2)}x</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Potential Win:</span>
              <span className="font-bold text-green-500">
                {potentialWin.toFixed(4)} ETH
                {ethPrice && <span className="font-normal text-muted-foreground ml-1">({formatEthToUsd(potentialWin, ethPrice)})</span>}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Profit:</span>
              <span className="font-bold">
                {(potentialWin - parseFloat(amount || '0')).toFixed(4)} ETH
                {ethPrice && (
                  <span className="font-normal text-muted-foreground ml-1">
                    ({formatEthToUsd(potentialWin - parseFloat(amount || '0'), ethPrice)})
                  </span>
                )}
              </span>
            </div>
          </div>

          {/* Wallet Status */}
          {!isConnected && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Please connect your wallet to place bets
              </AlertDescription>
            </Alert>
          )}

          {/* Error Display */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Blockchain Status */}
          {!isContractDeployed ? (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                <strong>Demo Mode:</strong> Smart contract not deployed. Using off-chain simulation.
                Deploy contract to Base Sepolia for real transactions.
              </AlertDescription>
            </Alert>
          ) : isConfirmed ? (
            <Alert className="bg-green-50 border-green-200">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                <strong>Success!</strong> Your bet has been placed on-chain.
              </AlertDescription>
            </Alert>
          ) : isConnected && chainId !== 84532 ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                <strong>Wrong Network:</strong> Please switch to Base Sepolia testnet.
              </AlertDescription>
            </Alert>
          ) : null}
        </div>

        <DialogFooter className="flex gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handlePlaceBet}
            disabled={!isConnected || isPending || isConfirming || isConfirmed}
            className={position === 'UP' ? 'bg-green-500 hover:bg-green-600' : 'bg-red-500 hover:bg-red-600'}
          >
            {isPending ? 'Confirm in Wallet...' : 
             isConfirming ? 'Processing Transaction...' : 
             isConfirmed ? 'Bet Placed!' : 
             `Bet ${amount} ETH ${position}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
