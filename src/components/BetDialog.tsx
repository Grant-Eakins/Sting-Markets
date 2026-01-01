import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TrendingUp, TrendingDown, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Market, placeBet } from '@/lib/marketApi';
import { useAccount, useChainId } from 'wagmi';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { usePlaceBet, Position, useMarketProbabilities, useTokenAllowance, useTokenApproval, useTokenBalance, useBucketLiquidity } from '@/hooks/useContract';
import { CONTRACT_ADDRESSES, TOKEN_DECIMALS, TOKEN_SYMBOL } from '@/config/contract';
import { parseUnits } from 'viem';

interface BetDialogProps {
  market: Market;
  position: 'UP' | 'DOWN';
  odds: number;
  bucketIndex?: number; // Actual contract bucket index from PriceSpinner
  coinName?: string; // For dual coin markets - display coin name instead of UP/DOWN
  onClose: () => void;
  onBetPlaced: () => void;
}

export function BetDialog({ market, position, odds, bucketIndex, coinName, onClose, onBetPlaced }: BetDialogProps) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const [amount, setAmount] = useState('5'); // Default 5 tokens
  const [error, setError] = useState<string | null>(null);
  const [useDemoMode, setUseDemoMode] = useState(false);
  const [needsApproval, setNeedsApproval] = useState(false);
  const [approvalJustConfirmed, setApprovalJustConfirmed] = useState(false);

  // Token hooks
  const { balance: tokenBalance, balanceFormatted: tokenBalanceFormatted } = useTokenBalance();
  const { allowance, refetch: refetchAllowance } = useTokenAllowance();
  const { approve: approveToken, isPending: isApproving, isConfirming: isApprovalConfirming, isConfirmed: isApprovalConfirmed, error: approvalError } = useTokenApproval();

  // Get live probabilities to calculate bucket-specific odds
  const { probabilities } = useMarketProbabilities(market.blockchainMarketId);
  
  // Get bucket liquidity for share calculation
  const { liquidity: bucketLiquidity } = useBucketLiquidity(
    market.blockchainMarketId,
    bucketIndex !== undefined ? bucketIndex : (position === 'UP' ? 4 : 5)
  );

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
  
  // Calculate shares using on-chain bucket liquidity data
  // Contract formula: shares = netAmount * 1e18 / (1e18 + bucketLiquidity * STEEPNESS)
  const TOTAL_FEE_BPS = 300; // 3% total (2% protocol + 1% burn)
  const STEEPNESS = 10; // Bonding curve steepness
  
  let sharesReceived = 0;
  const amountNum = parseFloat(amount || '0');
  
  if (bucketLiquidity !== undefined && amountNum > 0) {
    // Amount is in tokens (e.g. 5 USDC), convert to base units for calculation
    const amountInUnits = amountNum * Math.pow(10, TOKEN_DECIMALS);
    const totalFee = (amountInUnits * TOTAL_FEE_BPS) / 10000;
    const netAmount = amountInUnits - totalFee;
    
    // Use on-chain liquidity (already in base units)
    const liquidityNum = Number(bucketLiquidity);
    const divisor = Math.pow(10, TOKEN_DECIMALS) * 1e12 + (liquidityNum * STEEPNESS);
    const sharesInUnits = (netAmount * 1e18) / divisor;
    sharesReceived = sharesInUnits / 1e18; // Convert to readable number
  } else if (amountNum > 0) {
    // Fallback if liquidity not loaded: assume empty bucket
    const amountInUnits = amountNum * Math.pow(10, TOKEN_DECIMALS);
    const totalFee = (amountInUnits * TOTAL_FEE_BPS) / 10000;
    const netAmount = amountInUnits - totalFee;
    sharesReceived = netAmount / Math.pow(10, TOKEN_DECIMALS); // Max shares when bucket is empty
  }

  // Auto-close on successful transaction
  useEffect(() => {
    if (isConfirmed) {
      setTimeout(() => {
        onBetPlaced();
        onClose();
      }, 1500);
    }
  }, [isConfirmed, onBetPlaced, onClose]);

  // Check if approval is needed
  useEffect(() => {
    const betAmountBigInt = parseUnits(amount || '0', TOKEN_DECIMALS);
    // If allowance is undefined, we haven't loaded it yet - assume approval is needed
    // If allowance is loaded and less than bet amount, approval is needed
    if (allowance === undefined) {
      setNeedsApproval(true); // Assume needs approval until we know otherwise
    } else if (betAmountBigInt > allowance) {
      setNeedsApproval(true);
    } else {
      setNeedsApproval(false);
    }
  }, [amount, allowance]);

  // Refetch allowance after approval confirmed
  useEffect(() => {
    if (isApprovalConfirmed) {
      console.log('✅ Approval confirmed, refetching allowance...');
      setApprovalJustConfirmed(true);
      // Give it time for the blockchain state to update
      setTimeout(() => {
        refetchAllowance();
      }, 2000);
    }
  }, [isApprovalConfirmed, refetchAllowance]);

  // After approval, automatically place bet (skip approval check)
  useEffect(() => {
    if (approvalJustConfirmed && allowance !== undefined) {
      const betAmountBigInt = parseUnits(amount || '0', TOKEN_DECIMALS);
      if (betAmountBigInt <= allowance) {
        console.log('✅ Allowance sufficient, proceeding with bet...');
        setNeedsApproval(false);
        setApprovalJustConfirmed(false);
        
        // Place bet directly without going through approval check again
        const betAmount = parseFloat(amount);
        if (isConnected && address && !isNaN(betAmount) && betAmount > 0) {
          const marketId = (market as any).blockchainMarketId;
          if (marketId !== undefined && marketId !== null && marketId !== 0) {
            let outcomeIndex: number;
            if (bucketIndex !== undefined) {
              outcomeIndex = bucketIndex;
            } else {
              const isDualCoin = (market as any).isDualCoin;
              outcomeIndex = isDualCoin ? (position === 'UP' ? 0 : 1) : (position === 'UP' ? 4 : 5);
            }
            console.log(`🎯 Auto-placing bet on bucket ${outcomeIndex} for market ${marketId}`);
            placeBetOnChain(marketId, outcomeIndex, amount);
          }
        }
      }
    }
  }, [approvalJustConfirmed, allowance, amount]);

  // Handle contract errors
  useEffect(() => {
    if (contractError) {
      setError(contractError.message || 'Transaction failed');
    }
    if (approvalError) {
      setError(approvalError.message || 'Approval failed');
    }
  }, [contractError, approvalError]);

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

    if (betAmount < 1) {
      setError(`Minimum bet is 1 ${TOKEN_SYMBOL}`);
      return;
    }

    if (betAmount > 10000) {
      setError(`Maximum bet is 10,000 ${TOKEN_SYMBOL}`);
      return;
    }

    // Check token balance
    if (tokenBalance !== undefined) {
      const betAmountBigInt = parseUnits(amount, TOKEN_DECIMALS);
      if (betAmountBigInt > tokenBalance) {
        setError(`Insufficient ${TOKEN_SYMBOL} balance. You have ${tokenBalanceFormatted.toFixed(2)} ${TOKEN_SYMBOL}`);
        return;
      }
    }

    setError(null);

    // Use blockchain if contract is deployed, otherwise demo mode
    if (isContractDeployed && !useDemoMode) {
      try {
        // Get blockchain market ID from market data
        const marketId = (market as any).blockchainMarketId;
        
        // Market IDs start at 1 in the contract, so 0, undefined, or null are invalid
        if (marketId === undefined || marketId === null || marketId === 0) {
          setError('This market has not been created on-chain yet');
          return;
        }
        
        // Use actual bucket index from PriceSpinner, or fallback based on market type
        let outcomeIndex: number;
        if (bucketIndex !== undefined) {
          outcomeIndex = bucketIndex;
        } else {
          // Determine market type from backend data
          const isDualCoin = (market as any).isDualCoin;
          
          if (isDualCoin) {
            // Dual-coin: 2 buckets only - 0=Coin A, 1=Coin B
            outcomeIndex = position === 'UP' ? 0 : 1;
          } else {
            // Solo markets: 10 buckets - bucket 4 = 0-5% gain, bucket 5 = 0 to -5% loss
            outcomeIndex = position === 'UP' ? 4 : 5;
          }
        }
        
        // Validate bucket exists in market (safety check)
        // Note: We don't have numOutcomes here, but contract will reject if invalid
        
        // Check if approval is needed first
        const betAmountBigInt = parseUnits(amount, TOKEN_DECIMALS);
        console.log(`🔍 Checking approval: needsApproval=${needsApproval}, allowance=${allowance}, betAmount=${betAmountBigInt}`);
        
        if (needsApproval) {
          console.log(`🔓 Requesting ${TOKEN_SYMBOL} approval for ${amount} tokens...`);
          // Approve the exact amount needed
          await approveToken(betAmountBigInt);
          return;
        }
        
        console.log(`🎯 Placing bet on bucket ${outcomeIndex} for market ${marketId}, amount=${amount} ${TOKEN_SYMBOL}`);
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
            <TrendingUp className="w-5 h-5 text-green-500" />
            <span>Bet UP{coinName ? ` (${coinName})` : ''}</span>
          </DialogTitle>
          <DialogDescription className="line-clamp-2">
            {market.stockSymbol || market.stockName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Token Balance */}
          {isConnected && (
            <div className="text-sm text-muted-foreground">
              {TOKEN_SYMBOL} Balance: <span className="font-medium text-foreground">{tokenBalanceFormatted.toFixed(2)}</span>
            </div>
          )}

          {/* Amount Input */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Label htmlFor="amount">Bet Amount ({TOKEN_SYMBOL})</Label>
              <span className="text-xs text-muted-foreground">
                ${parseFloat(amount || '0').toFixed(2)}
              </span>
            </div>
            <Input
              id="amount"
              type="number"
              step="1"
              min="1"
              max="10000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="5"
            />
          </div>

          {/* Odds Display */}
          <div className="p-4 bg-muted rounded-lg space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Shares Received:</span>
              <span className="font-bold text-blue-500">
                {sharesReceived.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Win Chance:</span>
              <span className="font-bold">{(bucketProbability * 100).toFixed(1)}%</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Multiplier:</span>
              <span className="font-bold">{effectiveOdds.toFixed(2)}x</span>
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
          ) : isApprovalConfirmed && needsApproval ? (
            <Alert className="bg-blue-50 border-blue-200">
              <CheckCircle2 className="h-4 w-4 text-blue-600" />
              <AlertDescription className="text-blue-800">
                <strong>Approval confirmed!</strong> Updating... Please wait then click "Bet" again.
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
          ) : needsApproval ? (
            <Alert className="bg-amber-50 border-amber-200">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-800 text-xs">
                <strong>Step 1:</strong> You need to approve {TOKEN_SYMBOL} spending first. Click "Approve {TOKEN_SYMBOL}" below.
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
            disabled={!isConnected || isPending || isConfirming || isConfirmed || isApproving || isApprovalConfirming || approvalJustConfirmed}
            className='bg-green-500 hover:bg-green-600'
          >
            {isApproving ? `Approving ${TOKEN_SYMBOL}...` :
             isApprovalConfirming ? 'Confirming Approval...' :
             approvalJustConfirmed ? 'Updating Allowance...' :
             needsApproval ? `Approve ${TOKEN_SYMBOL}` :
             isPending ? 'Confirm in Wallet...' : 
             isConfirming ? 'Processing Transaction...' : 
             isConfirmed ? 'Bet Placed!' : 
             `Bet ${amount} ${position}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
