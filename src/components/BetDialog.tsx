import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TrendingUp, TrendingDown, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { Market, placeBet } from '@/lib/marketApi';
import { useAccount, useChainId } from 'wagmi';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { usePlaceBet, Position, useMarketProbabilities, useTokenAllowance, useTokenApproval, useTokenBalance, useBucketLiquidity, useDualCoinPlaceBet, useDualCoinTokenAllowance, useDualCoinTokenApproval, useDualCoinBucketLiquidity, useMaxBetSize } from '@/hooks/useContract';
import { CONTRACT_ADDRESSES, DUAL_COIN_CONTRACT_ADDRESSES, TOKEN_DECIMALS, TOKEN_SYMBOL } from '@/config/contract';
import { parseUnits } from 'viem';
import axios from 'axios';

const API_BASE = import.meta.env.PROD ? '/api' : 'http://localhost:3001/api';

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
  const { address, isConnected, chain } = useAccount();
  const chainIdFromHook = useChainId();
  // Fallback to chain.id from useAccount if useChainId fails
  const chainId = chainIdFromHook || chain?.id;
  const [amount, setAmount] = useState('5'); // Default 5 tokens
  const [error, setError] = useState<string | null>(null);
  const [useDemoMode, setUseDemoMode] = useState(false);
  const [needsApproval, setNeedsApproval] = useState(false);
  const [approvalJustConfirmed, setApprovalJustConfirmed] = useState(false);
  const [walletBetLimitEnabled, setWalletBetLimitEnabled] = useState(true);
  const [walletTotalBet, setWalletTotalBet] = useState(0);
  const [checkingWalletTotal, setCheckingWalletTotal] = useState(false);

  // Detect if this is a dual coin market
  const isDualCoin = !!(market as any).isDualCoin;

  // Token hooks - use dual coin versions for dual coin markets
  const { balance: tokenBalance, balanceFormatted: tokenBalanceFormatted } = useTokenBalance();
  
  // Standard market hooks
  const { allowance: stdAllowance, refetch: refetchStdAllowance } = useTokenAllowance();
  const { approve: stdApproveToken, isPending: stdIsApproving, isConfirming: stdIsApprovalConfirming, isConfirmed: stdIsApprovalConfirmed, error: stdApprovalError } = useTokenApproval();
  const { placeBet: stdPlaceBet, isPending: stdIsPending, isConfirming: stdIsConfirming, isConfirmed: stdIsConfirmed, error: stdContractError } = usePlaceBet();
  
  // Dual coin market hooks
  const { allowance: dualAllowance, refetch: refetchDualAllowance } = useDualCoinTokenAllowance();
  const { approve: dualApproveToken, isPending: dualIsApproving, isConfirming: dualIsApprovalConfirming, isConfirmed: dualIsApprovalConfirmed, error: dualApprovalError } = useDualCoinTokenApproval();
  const { placeBet: dualPlaceBet, isPending: dualIsPending, isConfirming: dualIsConfirming, isConfirmed: dualIsConfirmed, error: dualContractError } = useDualCoinPlaceBet();
  
  // Select the right hooks based on market type
  const allowance = isDualCoin ? dualAllowance : stdAllowance;
  const refetchAllowance = isDualCoin ? refetchDualAllowance : refetchStdAllowance;
  const approveToken = isDualCoin ? dualApproveToken : stdApproveToken;
  const isApproving = isDualCoin ? dualIsApproving : stdIsApproving;
  const isApprovalConfirming = isDualCoin ? dualIsApprovalConfirming : stdIsApprovalConfirming;
  const isApprovalConfirmed = isDualCoin ? dualIsApprovalConfirmed : stdIsApprovalConfirmed;
  const approvalError = isDualCoin ? dualApprovalError : stdApprovalError;
  const placeBetOnChain = isDualCoin ? dualPlaceBet : stdPlaceBet;
  const isPending = isDualCoin ? dualIsPending : stdIsPending;
  const isConfirming = isDualCoin ? dualIsConfirming : stdIsConfirming;
  const isConfirmed = isDualCoin ? dualIsConfirmed : stdIsConfirmed;
  const contractError = isDualCoin ? dualContractError : stdContractError;

  // Get live probabilities to calculate bucket-specific odds
  const { probabilities } = useMarketProbabilities(market.blockchainMarketId, isDualCoin);
  
  // Get bucket liquidity for BOTH buckets to calculate relative bonding curve advantage
  const { liquidity: stdBucketLiquidity } = useBucketLiquidity(
    isDualCoin ? undefined : market.blockchainMarketId,
    isDualCoin ? undefined : (bucketIndex !== undefined ? bucketIndex : (position === 'UP' ? 4 : 5))
  );
  
  // For dual coin: get BOTH bucket liquidities
  const { liquidity: dualBucketALiquidity } = useDualCoinBucketLiquidity(
    isDualCoin ? market.blockchainMarketId : undefined,
    isDualCoin ? 0 : undefined
  );
  const { liquidity: dualBucketBLiquidity } = useDualCoinBucketLiquidity(
    isDualCoin ? market.blockchainMarketId : undefined,
    isDualCoin ? 1 : undefined
  );
  
  // Your bucket liquidity
  const yourBucketLiquidity = isDualCoin 
    ? (bucketIndex === 0 ? dualBucketALiquidity : dualBucketBLiquidity)
    : stdBucketLiquidity;
  
  // Get max bet size for dual coin markets
  const { maxBetSize } = useMaxBetSize();
  
  // Default to Base Sepolia (84532) if not connected
  const activeChainId = chainId || 84532;
  const contractAddress = isDualCoin 
    ? DUAL_COIN_CONTRACT_ADDRESSES[activeChainId as keyof typeof DUAL_COIN_CONTRACT_ADDRESSES]
    : CONTRACT_ADDRESSES[activeChainId as keyof typeof CONTRACT_ADDRESSES];
  const isContractDeployed = contractAddress && contractAddress !== '0x0000000000000000000000000000000000000000';

  // Calculate bucket-specific payout estimate for proportional/parimutuel market
  // Formula: If you win, payout = (yourShares / totalSharesInBucket) * totalPool
  let effectiveOdds = odds;
  let bucketProbability = 0;
  
  if (bucketIndex !== undefined && probabilities && probabilities.length > bucketIndex) {
    bucketProbability = probabilities[bucketIndex] / 100; // Convert from percentage to decimal
  }
  
  // Calculate shares using on-chain bucket liquidity data
  // Contract formula: shares = netAmount * 1e18 / (1e18 + bucketLiquidity * STEEPNESS)
  const TOTAL_FEE_BPS = isDualCoin ? 300 : 200; // 3% for dual coin (2% protocol + 1% burn), 2% for standard
  const STEEPNESS = 10; // Bonding curve steepness
  
  let sharesReceived = 0;
  const amountNum = parseFloat(amount || '0');
  let bondingBonus = 1; // Default no bonus
  
  if (yourBucketLiquidity !== undefined && amountNum > 0) {
    // Amount is in tokens (e.g. 5 USDC), convert to base units for calculation
    const amountInUnits = amountNum * Math.pow(10, TOKEN_DECIMALS);
    const totalFee = (amountInUnits * TOTAL_FEE_BPS) / 10000;
    const netAmount = amountInUnits - totalFee;
    
    // Use on-chain liquidity (already in base units)
    const yourLiquidityNum = Number(yourBucketLiquidity);
    
    // Contract formula: shares = (netAmount * 1e18) / (1e18 + bucketLiquidity * STEEPNESS)
    const yourDivisor = 1e18 + (yourLiquidityNum * STEEPNESS);
    const yourShares = (netAmount * 1e18) / yourDivisor;
    sharesReceived = yourShares;
    
    // Calculate bonding curve advantage (how many more shares you get vs a neutral pool)
    // A neutral pool would have divisor of 1e18, giving 1 share per unit
    // Smaller pools give more shares per USDC
    const neutralShares = netAmount; // What you'd get with no bonding curve
    bondingBonus = yourShares / neutralShares; // How much more you get due to bonding curve (usually > 0, < 1)
    
    // Base multiplier from pool probability (1 / probability)
    // This is what you'd win if pools stay the same
    const baseMultiplier = bucketProbability > 0 && bucketProbability < 1 
      ? 1 / bucketProbability 
      : 2;
    
    // The multiplier is just the base - bonding curve gives you more SHARES, 
    // which means you own a larger % of the pool, but payout is still total_pool / winning_pool
    effectiveOdds = Math.min(baseMultiplier, 100);
    
    console.log('🎰 Bonding curve calc:', { 
      yourLiquidityNum, 
      yourShares, 
      bondingBonus: bondingBonus.toFixed(3),
      baseMultiplier: baseMultiplier.toFixed(2), 
      effectiveOdds: effectiveOdds.toFixed(2)
    });
  } else if (amountNum > 0) {
    // Fallback: use simple probability-based multiplier
    if (bucketProbability > 0 && bucketProbability < 1) {
      effectiveOdds = 1 / bucketProbability;
    } else {
      effectiveOdds = 2; // First bet gets ~2x
    }
    effectiveOdds = Math.min(effectiveOdds, 100);
  }

  const potentialWin = parseFloat(amount || '0') * effectiveOdds;

  // Fetch wallet total for this market and wallet limit setting
  useEffect(() => {
    const fetchWalletData = async () => {
      if (!address || !market.id) return;
      setCheckingWalletTotal(true);
      try {
        // Fetch config to get wallet limit setting
        const configRes = await axios.get(`${API_BASE}/auction/config`);
        setWalletBetLimitEnabled(configRes.data?.enableWalletBetLimit ?? true);
        
        // Fetch wallet's total bets on this market
        const totalRes = await axios.get(`${API_BASE}/markets/wallet-total/${market.id}/${address}`);
        setWalletTotalBet(totalRes.data.total || 0);
      } catch (error) {
        console.error('Error fetching wallet data:', error);
      } finally {
        setCheckingWalletTotal(false);
      }
    };
    
    fetchWalletData();
  }, [address, market.id]);

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
    // Prevent double-clicks while processing
    if (isPending || isConfirming || isApproving || isApprovalConfirming) {
      return;
    }
    
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

    // Check wallet bet limit (if enabled)
    if (walletBetLimitEnabled) {
      const newTotal = walletTotalBet + betAmount;
      if (newTotal > 10) {
        setError(`Wallet limit: You've already bet $${walletTotalBet.toFixed(2)} on this market. Max total is $10 per wallet.`);
        return;
      }
    }

    // Check max bet size for dual coin markets
    if (isDualCoin && maxBetSize !== undefined) {
      const maxBetFormatted = Number(maxBetSize) / 1e6;
      if (betAmount > maxBetFormatted) {
        setError(`Maximum bet is ${maxBetFormatted.toFixed(2)} ${TOKEN_SYMBOL}`);
        return;
      }
    } else if (!isDualCoin && betAmount > 10000) {
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

    // Detect mobile browser
    const isMobile = /Mobile|Android|iPhone/i.test(navigator.userAgent);

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
          
          // Mobile: Give user clear guidance
          if (isMobile) {
            setError('📱 Opening wallet app... Approve the transaction and return to this page.');
          }
          
          // Approve the exact amount needed
          await approveToken(betAmountBigInt);
          
          // Mobile: Wait for wallet app to return
          if (isMobile) {
            await new Promise(resolve => setTimeout(resolve, 1500));
          }
          return;
        }
        
        console.log(`🎯 Placing bet on bucket ${outcomeIndex} for market ${marketId}, amount=${amount} ${TOKEN_SYMBOL}`);
        
        // Mobile: Give user clear guidance
        if (isMobile) {
          setError('📱 Opening wallet app... Sign the transaction and return to this page.');
        }
        
        placeBetOnChain(marketId, outcomeIndex, amount);
        
        // Mobile: Wait for transaction to be initiated
        if (isMobile) {
          await new Promise(resolve => setTimeout(resolve, 1500));
          // Clear the guidance message after wallet opens
          setError(null);
        }
      } catch (err: any) {
        console.error('Transaction error:', err);
        
        // Better error messages
        if (err.message?.includes('User rejected') || err.message?.includes('user rejected')) {
          setError('❌ Transaction cancelled');
        } else if (err.message?.includes('insufficient funds')) {
          setError('❌ Insufficient ETH for gas fees');
        } else if (err.code === 'ACTION_REJECTED') {
          setError('❌ Transaction rejected in wallet');
        } else {
          setError(`❌ ${err.message || 'Transaction failed'}`);
        }
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
            {position === 'UP' ? <TrendingUp className="w-5 h-5 text-green-500" /> : <TrendingDown className="w-5 h-5 text-red-500" />}
            <span>{coinName ? `Bet on ${coinName}` : `Bet ${position}`}</span>
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
              <span className="text-muted-foreground">Current Pool:</span>
              <span className="font-bold text-blue-500">
                {(bucketProbability * 100).toFixed(1)}%
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Shares You'll Get:</span>
              <span className="font-bold text-purple-500">
                {sharesReceived > 0 ? (sharesReceived / 1e18).toFixed(2) : '0.00'}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Est. Multiplier:</span>
              <span className="font-bold text-green-500">{effectiveOdds.toFixed(2)}x</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Potential Win:</span>
              <span className="font-bold text-green-500">${potentialWin.toFixed(2)}</span>
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

          {/* Error Display - Cancelled/Rejected */}
          {error && error.startsWith('❌') && (
            <Alert variant="destructive" className="bg-orange-50 border-orange-200">
              <AlertCircle className="h-4 w-4 text-orange-600" />
              <AlertDescription className="text-orange-800">{error}</AlertDescription>
            </Alert>
          )}
          
          {/* Error Display - Other Errors */}
          {error && !error.startsWith('📱') && !error.startsWith('❌') && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          
          {/* Mobile Transaction Guidance */}
          {error && error.startsWith('📱') && (
            <Alert className="bg-blue-50 border-blue-200">
              <AlertCircle className="h-4 w-4 text-blue-600" />
              <AlertDescription className="text-blue-800">
                {error}
              </AlertDescription>
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
          ) : isPending || isApproving ? (
            <Alert className="bg-blue-50 border-blue-200">
              <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />
              <AlertDescription className="text-blue-800">
                <strong>Waiting for wallet...</strong> Check your wallet to approve the transaction.
              </AlertDescription>
            </Alert>
          ) : isConfirming || isApprovalConfirming ? (
            <Alert className="bg-blue-50 border-blue-200">
              <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />
              <AlertDescription className="text-blue-800">
                <strong>Processing...</strong> Transaction submitted, waiting for confirmation.
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
            {(isApproving || isApprovalConfirming || isPending || isConfirming) && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            {isApproving ? `Approving ${TOKEN_SYMBOL}...` :
             isApprovalConfirming ? 'Confirming Approval...' :
             approvalJustConfirmed ? 'Updating Allowance...' :
             needsApproval ? `Approve ${TOKEN_SYMBOL}` :
             isPending ? 'Confirm in Wallet...' : 
             isConfirming ? 'Processing Transaction...' : 
             isConfirmed ? 'Bet Placed! ✅' : 
             coinName ? `Bet ${amount} on ${coinName}` : `Bet ${amount} ${position}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
