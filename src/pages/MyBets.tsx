import { useQuery } from '@tanstack/react-query';
import { fetchMarkets, type Market } from '@/lib/marketApi';
import { useAccount, useWriteContract, useReadContracts } from 'wagmi';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TrendingUp, TrendingDown, Trophy, Wallet, AlertCircle, ArrowRightLeft, Menu, X, History } from 'lucide-react';
import { archiveBet, isBetArchived, type ArchivedBet } from './BetHistory';

// Authorized admin wallet addresses (lowercase for comparison)
const ADMIN_WALLETS = [
  '0x6b1b7e7b207ec756b8d9edc59db4b32184160b22',
  '0xb0687ef6ea5906089ec3586f9997764650bf1934',
];
import { useState, useMemo, useEffect } from 'react';
import { WalletConnect } from '@/components/WalletConnect';
import { FarcasterConnect } from '@/components/FarcasterConnect';
import { useFarcasterAuth } from '@/hooks/useFarcasterAuth';
import { CONTRACT_ADDRESSES, PREDICTION_MARKET_ABI, TOKEN_DECIMALS, TOKEN_SYMBOL, DUAL_COIN_CONTRACT_ADDRESSES } from '@/config/contract';
import { toast } from 'sonner';
import { useBlockchainBets, type BlockchainBet } from '@/hooks/useBlockchainBets';
import { useSellShares } from '@/hooks/useContract';
import { BetCardSkeleton, StatCardSkeleton } from '@/components/ui/skeleton';

// Token divisor (18 decimals for MIND)
const TOKEN_DIVISOR = 10 ** TOKEN_DECIMALS;

// Enriched bet type for display
interface EnrichedBet extends BlockchainBet {
  marketName: string;
  bucketLabel: string;
  amountToken: number;
  sharesNum: number;
  potentialPayout: number;
  probability: string;           // Current probability
  purchaseProbability: string;   // Probability at time of purchase
  isSettled: boolean;
  won: boolean;
  currentValue: number;
  liveSellValue: number | null; // Live sell value from contract
  pnl: number;
  pnlPercent: number;
  isUpBet: boolean;
  // Settlement info
  settlementPrice: number | null;
  referencePrice: number | null;
  priceChangePercent: number | null;
  winningBucketLabel: string | null;
  // Market reference for dual-coin display
  market: Market | undefined;
}

export default function MyBets() {
  const { address, isConnected } = useAccount();
  const { isInFarcasterClient } = useFarcasterAuth();
  const [claimingBetId, setClaimingBetId] = useState<bigint | null>(null);
  const [sellingBetId, setSellingBetId] = useState<bigint | null>(null);
  const [sellDialogBet, setSellDialogBet] = useState<EnrichedBet | null>(null);
  const [sellPercentage, setSellPercentage] = useState(100);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [archivedBetIds, setArchivedBetIds] = useState<Set<string>>(new Set());
  
  // Check if connected wallet is admin
  const isAdmin = isConnected && address && ADMIN_WALLETS.includes(address.toLowerCase());
  
  const { writeContractAsync } = useWriteContract();
  const { bets, isLoading: isLoadingBets, error: betsError, refetch: refetchBets } = useBlockchainBets();
  const { sellShares, isPending: isSellPending, isConfirming: isSellConfirming, isConfirmed: isSellConfirmed, error: sellError, hash: sellHash } = useSellShares();

  // Load archived bet IDs on mount / address change / bets change
  useEffect(() => {
    if (address) {
      const archived = new Set<string>();
      try {
        const key = `stingMarkets_archivedBets_${address.toLowerCase()}`;
        const stored = localStorage.getItem(key);
        if (stored) {
          const bets = JSON.parse(stored) as ArchivedBet[];
          bets.forEach(b => archived.add(b.betId));
        }
      } catch {}
      setArchivedBetIds(archived);
      console.log('📦 Loaded archived bet IDs:', [...archived]);
    }
  }, [address, bets]); // Re-check when bets are fetched

  // Archive a bet and update local state
  const handleArchiveBet = (bet: EnrichedBet) => {
    if (!address) return;
    const archivedBet: ArchivedBet = {
      betId: bet.betId.toString(),
      marketId: Number(bet.marketId),
      marketName: bet.marketName,
      bucketLabel: bet.bucketLabel,
      amountToken: bet.amountToken,
      potentialPayout: bet.potentialPayout,
      won: bet.won,
      claimed: bet.claimed,
      txHash: bet.txHash,
      archivedAt: Date.now(),
      // Include settlement info
      settlementPrice: bet.settlementPrice,
      referencePrice: bet.referencePrice,
      priceChangePercent: bet.priceChangePercent,
      winningBucketLabel: bet.winningBucketLabel,
    };
    archiveBet(address, archivedBet);
    setArchivedBetIds(prev => new Set([...prev, bet.betId.toString()]));
    toast.success(bet.won ? 'Bet moved to history!' : 'Bet dismissed');
  };

  // Debug logging
  console.log('📊 MyBets render:', { 
    address, 
    isConnected, 
    betsCount: bets.length, 
    isLoadingBets, 
    betsError: betsError?.message 
  });

  // Debug: Log bet details
  useEffect(() => {
    if (bets.length > 0) {
      console.log('📊 Bets:', bets.map(b => ({
        marketId: b.marketId.toString(),
        outcomeIndex: b.outcomeIndex,
        shares: Number(b.shares) / TOKEN_DIVISOR,
        cost: Number(b.cost) / TOKEN_DIVISOR
      })));
    }
  }, [bets]);

  // Fetch markets to get market details
  const { data: markets = [], isLoading: isLoadingMarkets } = useQuery({
    queryKey: ['markets'],
    queryFn: () => fetchMarkets('all'),
    refetchInterval: false, // Only refresh manually
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  // Fetch market details from blockchain for all markets in bets
  const marketIds = useMemo(() => {
    return [...new Set(bets.map(bet => bet.marketId))];
  }, [bets]);

  // Determine which markets are dual coin (need to query dual coin contract)
  const marketIdsToDualCoin = useMemo(() => {
    const map = new Map<string, boolean>();
    if (!markets) return map;
    
    const marketsList = Array.isArray(markets) ? markets : [];
    for (const market of marketsList) {
      if (market.blockchainMarketId) {
        map.set(market.blockchainMarketId.toString(), !!(market as any).isDualCoin);
      }
    }
    console.log('📊 Market to contract mapping:', Object.fromEntries(map));
    return map;
  }, [markets]);

  // Split market IDs by contract type
  const { stdMarketIds, dualMarketIds } = useMemo(() => {
    const std: bigint[] = [];
    const dual: bigint[] = [];
    
    for (const marketId of marketIds) {
      const marketIdStr = marketId.toString();
      const isDual = marketIdsToDualCoin.get(marketIdStr);
      console.log(`📊 Checking marketId ${marketIdStr}: isDual=${isDual}, has mapping=${marketIdsToDualCoin.has(marketIdStr)}`);
      
      if (isDual === true) {
        dual.push(marketId);
      } else if (isDual === false) {
        std.push(marketId);
      }
      // Skip if undefined (market not found in API yet)
    }
    
    console.log(`📊 Split markets: ${std.length} standard (MIND), ${dual.length} dual coin (USDC)`);
    return { stdMarketIds: std, dualMarketIds: dual };
  }, [marketIds, marketIdsToDualCoin]);

  // Query standard MIND contract for standard markets
  const { data: stdMarketsData } = useReadContracts({
    contracts: stdMarketIds.map((marketId) => ({
      address: CONTRACT_ADDRESSES[84532] as `0x${string}`,
      abi: PREDICTION_MARKET_ABI,
      functionName: 'getMarket',
      args: [marketId],
    })) as any,
    query: {
      enabled: stdMarketIds.length > 0,
      refetchInterval: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  } as any);

  // Query dual coin USDC contract for dual coin markets
  const { data: dualMarketsData } = useReadContracts({
    contracts: dualMarketIds.map((marketId) => ({
      address: DUAL_COIN_CONTRACT_ADDRESSES[84532] as `0x${string}`,
      abi: PREDICTION_MARKET_ABI,
      functionName: 'getMarket',
      args: [marketId],
    })) as any,
    query: {
      enabled: dualMarketIds.length > 0,
      refetchInterval: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  } as any);

  // Merge market data from both contracts
  const marketsData = useMemo(() => {
    if (!stdMarketsData && !dualMarketsData) return undefined;
    
    const merged: any[] = [];
    for (const marketId of marketIds) {
      const isDual = marketIdsToDualCoin.get(marketId.toString());
      if (isDual) {
        const index = dualMarketIds.indexOf(marketId);
        if (index !== -1 && dualMarketsData?.[index]) {
          merged.push(dualMarketsData[index]);
        }
      } else {
        const index = stdMarketIds.indexOf(marketId);
        if (index !== -1 && stdMarketsData?.[index]) {
          merged.push(stdMarketsData[index]);
        }
      }
    }
    console.log(`📊 Merged ${merged.length} market data results from both contracts`);
    return merged.length > 0 ? merged : undefined;
  }, [marketIds, stdMarketIds, dualMarketIds, stdMarketsData, dualMarketsData, marketIdsToDualCoin]);

  // Debug: Log markets data
  useEffect(() => {
    if (marketsData) {
      console.log('📊 marketsData:', marketsData);
      console.log('📊 marketIds:', marketIds.map(id => id.toString()));
    }
  }, [marketsData, marketIds]);

  // Fetch probabilities for each market to calculate estimated payouts
  // Query standard markets
  const { data: stdProbabilitiesData } = useReadContracts({
    contracts: stdMarketIds.map((marketId) => ({
      address: CONTRACT_ADDRESSES[84532] as `0x${string}`,
      abi: PREDICTION_MARKET_ABI,
      functionName: 'getProbabilities',
      args: [marketId],
    })) as any,
    query: {
      enabled: stdMarketIds.length > 0,
      refetchInterval: 60000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  } as any);

  // Query dual coin markets
  const { data: dualProbabilitiesData } = useReadContracts({
    contracts: dualMarketIds.map((marketId) => ({
      address: DUAL_COIN_CONTRACT_ADDRESSES[84532] as `0x${string}`,
      abi: PREDICTION_MARKET_ABI,
      functionName: 'getProbabilities',
      args: [marketId],
    })) as any,
    query: {
      enabled: dualMarketIds.length > 0,
      refetchInterval: 60000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  } as any);

  // Merge probabilities data
  const probabilitiesData = useMemo(() => {
    if (!stdProbabilitiesData && !dualProbabilitiesData) return undefined;
    
    const merged: any[] = [];
    for (const marketId of marketIds) {
      const isDual = marketIdsToDualCoin.get(marketId.toString());
      if (isDual) {
        const index = dualMarketIds.indexOf(marketId);
        if (index !== -1 && dualProbabilitiesData?.[index]) {
          merged.push(dualProbabilitiesData[index]);
        }
      } else {
        const index = stdMarketIds.indexOf(marketId);
        if (index !== -1 && stdProbabilitiesData?.[index]) {
          merged.push(stdProbabilitiesData[index]);
        }
      }
    }
    return merged.length > 0 ? merged : undefined;
  }, [marketIds, stdMarketIds, dualMarketIds, stdProbabilitiesData, dualProbabilitiesData, marketIdsToDualCoin]);

  // Sell feature disabled - no sell quotes needed

  const isLoading = isLoadingBets || isLoadingMarkets;

  // ProportionalMarket uses claimPayout(marketId) instead of claimWinnings(betId)
  const handleClaim = async (marketId: bigint) => {
    if (!address) return;
    
    setClaimingBetId(marketId);
    try {
      // Determine if this is a dual coin market
      const isDualCoin = marketIdsToDualCoin.get(marketId.toString()) || false;
      const contractAddress = isDualCoin 
        ? DUAL_COIN_CONTRACT_ADDRESSES[84532]
        : CONTRACT_ADDRESSES[84532];
      
      console.log(`💰 Claiming payout for market ${marketId} (isDualCoin: ${isDualCoin}, contract: ${contractAddress})`);
      
      const hash = await writeContractAsync({
        address: contractAddress as `0x${string}`,
        abi: PREDICTION_MARKET_ABI,
        functionName: 'claimPayout',
        args: [marketId],
        chain: undefined,
        account: address,
      });
      
      toast.success(`Claim transaction submitted! Hash: ${hash.slice(0, 10)}...`);
      
      setTimeout(async () => {
        await refetchBets();
        toast.success('Winnings claimed successfully!');
      }, 5000);
      
    } catch (error: any) {
      // Check if user rejected the transaction
      if (error.message?.includes('User rejected') || error.message?.includes('User denied')) {
        toast.info('Transaction canceled');
      } else {
        console.error('Claim error:', error);
        toast.error(error.shortMessage || error.message || 'Failed to claim winnings');
      }
    } finally {
      setClaimingBetId(null);
    }
  };

  // Open sell dialog for partial selling
  const openSellDialog = (bet: EnrichedBet) => {
    setSellDialogBet(bet);
    setSellPercentage(100); // Default to selling all
  };

  // Execute the partial sell
  const handlePartialSell = async () => {
    if (!address || !sellDialogBet) return;
    
    const sharesToSell = (sellDialogBet.shares * BigInt(sellPercentage)) / 100n;
    if (sharesToSell === 0n) {
      toast.error('Amount too small to sell');
      return;
    }
    
    setSellingBetId(sellDialogBet.betId);
    setSellDialogBet(null);
    
    try {
      // minPayout = 0 for now (no slippage protection)
      sellShares(Number(sellDialogBet.marketId), sellDialogBet.outcomeIndex, sharesToSell, 0n);
      toast.info(`Selling ${sellPercentage}% of position...`);
    } catch (error: any) {
      if (error.message?.includes('User rejected') || error.message?.includes('User denied')) {
        toast.info('Transaction canceled');
      } else {
        console.error('Sell error:', error);
        toast.error(error.shortMessage || error.message || 'Failed to sell position');
      }
      setSellingBetId(null);
    }
  };

  // Legacy full sell (keeping for backward compatibility)
  const handleSell = async (bet: EnrichedBet) => {
    if (!address) return;
    
    setSellingBetId(bet.betId);
    try {
      // Sell all shares in this position
      // minPayout = 0 for now (no slippage protection) - can add UI for this later
      sellShares(Number(bet.marketId), bet.outcomeIndex, bet.shares, 0n);
      
      toast.info('Sell transaction submitted...');
      
    } catch (error: any) {
      if (error.message?.includes('User rejected') || error.message?.includes('User denied')) {
        toast.info('Transaction canceled');
      } else {
        console.error('Sell error:', error);
        toast.error(error.shortMessage || error.message || 'Failed to sell position');
      }
      setSellingBetId(null);
    }
  };

  // Handle sell confirmation with useEffect to properly trigger refetch
  useEffect(() => {
    if (isSellConfirmed && sellingBetId) {
      toast.success('Position sold successfully! Updating...');
      setSellingBetId(null);
      // Wait for blockchain to index the transaction, then refetch multiple times
      // to ensure we get the updated data
      setTimeout(() => {
        refetchBets();
        toast.info('Refreshing positions...');
      }, 3000);
      // Second refetch after 6 seconds in case first one was too early
      setTimeout(() => {
        refetchBets();
      }, 6000);
    }
  }, [isSellConfirmed, sellingBetId, refetchBets]);

  // Handle sell errors
  useEffect(() => {
    if (sellError && sellingBetId) {
      const errorMsg = (sellError as any)?.shortMessage || sellError.message || 'Failed to sell';
      if (!errorMsg.includes('User rejected') && !errorMsg.includes('User denied')) {
        toast.error(errorMsg);
      }
      setSellingBetId(null);
    }
  }, [sellError, sellingBetId]);

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
        {/* Navigation Bar */}
        <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
          <div className="container mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-4 lg:gap-6">
              <Link to="/" className="flex items-center gap-2 shrink-0">
                <img src="/Copilot_20251128_175824-removebg-preview.png" alt="Sting Markets" className="h-8 sm:h-10" />
                <span className="text-lg sm:text-xl font-bold italic tracking-tight hidden sm:inline">Sting Markets</span>
              </Link>
              <nav className="hidden md:flex gap-4">
                <Link to="/">
                  <Button variant="ghost" size="sm">Coin Battles</Button>
                </Link>
                <Link to="/single-markets">
                  <Button variant="ghost" size="sm">Markets</Button>
                </Link>
                <Link to="/my-bets">
                  <Button variant="ghost" size="sm">My Bets</Button>
                </Link>
              </nav>
            </div>
            <div className="flex items-center gap-2">
              <FarcasterConnect />
              {!isInFarcasterClient && <WalletConnect />}
            </div>
          </div>
        </div>
        <div className="container mx-auto px-4 py-8">
          <h1 className="text-3xl sm:text-4xl font-bold mb-8">My Bets</h1>
          
          <Card className="p-8 sm:p-12 text-center">
            <Wallet className="w-12 sm:w-16 h-12 sm:h-16 mx-auto mb-4 text-muted-foreground" />
            <CardTitle className="mb-2">Connect Your Wallet</CardTitle>
            <CardDescription className="mb-6">
              Connect your wallet to view your betting history and claim winnings
            </CardDescription>
            {!isInFarcasterClient && <WalletConnect />}
          </Card>
        </div>
      </div>
    );
  }

  // Calculate stats from blockchain bets
  // ProportionalMarket.getMarket returns:
  // [stockSymbol, sessionType, status, numOutcomes, referencePrice, finalPrice, lockTime, settleTime, settled, winningOutcome, totalLiquidity]
  // ProportionalMarketDualCoin.getMarket returns:
  // [coinASymbol, coinBSymbol, status, coinAPool, coinBPool, totalPool, lockTime, settleTime, settled, winningOutcome]
  const getBetMarketData = (marketId: bigint) => {
    const index = marketIds.indexOf(marketId);
    if (index === -1 || !marketsData?.[index]) return null;
    const marketResult: any = marketsData[index];
    if (marketResult.status !== 'success' || !marketResult.result) return null;
    const result: any = marketResult.result;
    
    // Check if this is a dual coin market
    const isDualCoin = marketIdsToDualCoin.get(marketId.toString()) || false;
    
    // Get probabilities for this market
    let probabilities: number[] = [];
    if (probabilitiesData?.[index]) {
      const probResult: any = probabilitiesData[index];
      if (probResult.status === 'success' && probResult.result) {
        probabilities = (probResult.result as bigint[]).map(p => Number(p) / 10000); // Convert from bps to decimal
      }
    }
    
    if (isDualCoin) {
      // Dual Coin contract format:
      // [coinASymbol, coinBSymbol, status, coinAPool, coinBPool, totalPool, lockTime, settleTime, settled, winningOutcome]
      const totalPool = Number(result[5]) / 1e6; // USDC has 6 decimals
      const coinAPool = Number(result[3]) / 1e6;
      const coinBPool = Number(result[4]) / 1e6;
      
      // Calculate probabilities from pools if not provided
      if (probabilities.length === 0 && totalPool > 0) {
        probabilities = [coinAPool / totalPool, coinBPool / totalPool];
      }
      
      return {
        stockSymbol: `${result[0]} vs ${result[1]}`,
        sessionType: 0,
        status: result[2], // 0=ACTIVE, 1=LOCKED, 2=SETTLED, 3=CANCELLED
        numOutcomes: 2,
        referencePrice: 0n,
        finalPrice: 0n,
        settled: result[8] === true,
        winningOutcome: Number(result[9]), // The winning bucket index (0=CoinA, 1=CoinB)
        totalLiquidity: totalPool,
        probabilities,
      };
    } else {
      // Standard contract format:
      // [stockSymbol, sessionType, status, numOutcomes, referencePrice, finalPrice, lockTime, settleTime, settled, winningOutcome, totalLiquidity]
      return {
        stockSymbol: result[0] || 'Unknown Market',
        sessionType: result[1],
        status: result[2], // 0=ACTIVE, 1=LOCKED, 2=SETTLED, 3=CANCELLED
        numOutcomes: Number(result[3]),
        referencePrice: result[4],
        finalPrice: result[5],
        settled: result[8] === true,
        winningOutcome: Number(result[9]), // The winning bucket index
        totalLiquidity: Number(result[10]) / TOKEN_DIVISOR,
        probabilities,
      };
    }
  };

  // Enrich bets with market data and categorize
  const enrichedBets = bets.map((bet, index) => {
    const marketData = getBetMarketData(bet.marketId);
    
    // Debug: Log market data lookup
    console.log(`📊 Enriching bet ${index}: marketId=${bet.marketId.toString()}, marketData=`, marketData ? {
      settled: marketData.settled,
      winningOutcome: marketData.winningOutcome,
      status: marketData.status
    } : 'NULL');
    
    const marketsList = Array.isArray(markets) ? markets : [];
    const market = marketsList.find((m: Market) => m.blockchainMarketId === Number(bet.marketId));
    const isDualCoin = !!(market as any)?.isDualCoin;
    
    // For dual coin markets: cost is in USDC (6 decimals), shares are in 18 decimals
    // For standard markets: both cost and shares are in 18 decimals (MIND token)
    const amountToken = Number(bet.cost) / (isDualCoin ? 1e6 : TOKEN_DIVISOR);  // Cost in USDC (6 decimals) or MIND (18 decimals)
    const sharesNum = Number(bet.shares) / 1e18; // Shares always 18 decimals on-chain
    
    // Calculate purchase probability from shares/cost ratio
    const netAmount = amountToken * 0.97; // 3% fee taken out
    let purchaseProbability = 0.5; // Default 50%
    
    console.log(`🔍 Bet ${bet.betId}: amountToken=${amountToken}, sharesNum=${sharesNum}, netAmount=${netAmount}`);
    
    if (sharesNum > 0 && netAmount > 0) {
      if (isDualCoin) {
        // DUAL COIN: Simple probability = amount paid / shares received
        // If you get MORE shares than you paid → LOW probability (good odds)
        // If you get FEWER shares than you paid → HIGH probability (bad odds)
        purchaseProbability = Math.min(0.99, Math.max(0.01, netAmount / sharesNum));
        console.log(`🎯 Dual coin purchase probability: ${(purchaseProbability * 100).toFixed(1)}% (${netAmount} / ${sharesNum})`);
      } else {
        // BONDING CURVE (standard markets)
        purchaseProbability = Math.min(0.99, Math.max(0.01, netAmount / sharesNum));
      }
    }
    
    const isSettled = marketData?.settled || false;
    // Win if the user's bet bucket matches the winning outcome
    const won = isSettled && marketData?.winningOutcome === bet.outcomeIndex;
    
    console.log(`📊 Bet ${index} result: isSettled=${isSettled}, won=${won}, outcomeIndex=${bet.outcomeIndex}, winningOutcome=${marketData?.winningOutcome}, isDualCoin=${market?.isDualCoin}`);
    
    // Selling disabled - no live sell value
    
    // Calculate estimated payout based on current shares and market state
    let potentialPayout = amountToken; // Default: get your money back
    let currentValue = amountToken; // Cost basis
    let probability = 0;
    
    if (marketData && marketData.probabilities && marketData.probabilities.length > bet.outcomeIndex) {
      probability = marketData.probabilities[bet.outcomeIndex];
      
      if (probability > 0 && marketData.totalLiquidity > 0) {
        if (isDualCoin) {
          // DUAL COIN MARKETS: Simple parimutuel - shares represent direct claim on pool
          // Formula: payout = (yourShares / totalSharesInBucket) * totalPool
          // We need to get totalShares from contract, but for estimate use: 
          // totalSharesInBucket ≈ bucketLiquidity / averageSharePrice
          // Since sharePrice = probability × 1e6 (for USDC 6 decimals)
          // totalSharesInBucket ≈ (totalLiquidity × probability) / (probability × 1e6) × 1e18
          // Simplified: totalSharesInBucket ≈ totalLiquidity × 1e12
          const bucketLiquidity = marketData.totalLiquidity * probability;
          const avgSharePrice = probability; // In USDC (normalized to 1.0)
          const estimatedTotalShares = (bucketLiquidity / avgSharePrice); // Rough estimate
          const yourShareOfBucket = sharesNum / estimatedTotalShares;
          potentialPayout = marketData.totalLiquidity * yourShareOfBucket;
        } else {
          // STANDARD MARKETS: Bonding curve proportional payout
          const yourShareOfWinningBucket = amountToken / (marketData.totalLiquidity * probability);
          const losingBucketSize = marketData.totalLiquidity * (1 - probability);
          potentialPayout = amountToken + (yourShareOfWinningBucket * losingBucketSize);
        }
        
        // Cap at reasonable max (can't win more than total pool)
        potentialPayout = Math.min(potentialPayout, marketData.totalLiquidity);
      }
    }
    
    // Format the bucket as a price range based on contract's getBucketIndex logic
    // Contract mapping: bucket 0 = >+10%, lower buckets = higher positive %, higher buckets = negative %
    const getBucketLabel = (outcomeIndex: number, numOutcomes: number = 42, isDualCoin: boolean = false, market?: any) => {
      // For 2-bucket dual-coin markets
      if (isDualCoin && numOutcomes === 2) {
        // Get actual coin symbols from market
        if (market) {
          const coinASymbol = market.coinASymbol || (market.symbol?.split('-')[0]) || 'Coin A';
          const coinBSymbol = market.coinBSymbol || (market.symbol?.split('-')[1]) || 'Coin B';
          return outcomeIndex === 0 ? coinASymbol : coinBSymbol;
        }
        return outcomeIndex === 0 ? 'Coin A' : 'Coin B';
      }
      
      // For 10-bucket solo markets
      if (numOutcomes === 10) {
        // Gain buckets (0-4): 20%+, 15-20%, 10-15%, 5-10%, 0-5%
        if (outcomeIndex === 0) return '>+20%';
        if (outcomeIndex === 1) return '+15% to +20%';
        if (outcomeIndex === 2) return '+10% to +15%';
        if (outcomeIndex === 3) return '+5% to +10%';
        if (outcomeIndex === 4) return '0% to +5%';
        // Loss buckets (5-9): 0 to -5%, -5 to -10%, -10 to -15%, -15 to -20%, -20%+
        if (outcomeIndex === 5) return '0% to -5%';
        if (outcomeIndex === 6) return '-5% to -10%';
        if (outcomeIndex === 7) return '-10% to -15%';
        if (outcomeIndex === 8) return '-15% to -20%';
        if (outcomeIndex === 9) return '<-20%';
      }
      
      // Legacy: For 22/42 bucket LMSR markets (if you ever use them)
      const isIntraday = numOutcomes === 22;
      const increment = isIntraday ? 1 : 0.5;
      const maxBucket = numOutcomes - 1;
      
      if (outcomeIndex === 0) return '>+10%';
      if (outcomeIndex === maxBucket) return '<-10%';
      
      const pctHigh = 10 - (outcomeIndex - 1) * increment;
      const pctLow = pctHigh - increment;
      
      if (pctLow >= 0) {
        return `+${pctLow}% to +${pctHigh}%`;
      } else if (pctHigh > 0) {
        return `${pctLow}% to +${pctHigh}%`;
      } else {
        return `${pctLow}% to ${pctHigh}%`;
      }
    };
    
    // Determine if this is an UP or DOWN bet based on bucket index
    // UP = positive price change buckets (lower indices)
    // DOWN = negative price change buckets (higher indices)
    const getIsUpBet = (outcomeIndex: number, numOutcomes: number = 42) => {
      // For 2-bucket dual-coin markets: 0=UP/Coin A, 1=DOWN/Coin B
      if (numOutcomes === 2) {
        return outcomeIndex === 0;
      }
      
      // For 10-bucket solo markets: 0-4=UP (gains), 5-9=DOWN (losses)
      if (numOutcomes === 10) {
        return outcomeIndex <= 4;
      }
      
      // Legacy: For 22/42 bucket LMSR markets
      const isIntraday = numOutcomes === 22;
      const zeroChangeBucket = isIntraday ? 10 : 20;
      return outcomeIndex <= zeroChangeBucket;
    };
    
    // Override the position from useBlockchainBets with correct calculation
    const isUpBet = getIsUpBet(bet.outcomeIndex, marketData?.numOutcomes);
    
    // Calculate settlement price info for settled markets
    let settlementPrice: number | null = null;
    let referencePrice: number | null = null;
    let priceChangePercent: number | null = null;
    let winningBucketLabel: string | null = null;
    
    if (isSettled && marketData) {
      if (marketData.finalPrice) {
        // Prices are stored in cents (e.g., 231 = $2.31)
        settlementPrice = Number(marketData.finalPrice) / 100;
      }
      if (marketData.referencePrice) {
        // Prices are stored in cents (e.g., 231 = $2.31)
        referencePrice = Number(marketData.referencePrice) / 100;
      }
      if (settlementPrice && referencePrice && referencePrice > 0) {
        priceChangePercent = ((settlementPrice - referencePrice) / referencePrice) * 100;
      }
      if (marketData.winningOutcome !== undefined) {
        // For dual-coin markets, store the winningPosition (UP/DOWN) to use for coin symbol lookup later
        // For regular markets, use bucket label
        if (market?.isDualCoin) {
          winningBucketLabel = marketData.winningOutcome === 0 ? 'UP' : 'DOWN';
        } else {
          winningBucketLabel = getBucketLabel(marketData.winningOutcome, marketData.numOutcomes);
        }
      }
    }
    
    // For dual-coin markets, construct the full "Coin A vs Coin B" market name
    let displayMarketName = marketData?.stockSymbol || market?.stockSymbol || market?.stockName || `Market #${bet.marketId}`;
    if (market?.isDualCoin) {
      // Try to get coin symbols from market data
      let coinASymbol = market.coinASymbol;
      let coinBSymbol = market.coinBSymbol;
      
      // Fallback: Parse from symbol field if individual fields missing (e.g., "fish-BULLISH" → "fish" vs "BULLISH")
      if ((!coinASymbol || !coinBSymbol) && (market as any).symbol) {
        const parts = (market as any).symbol.split('-');
        if (parts.length === 2) {
          coinASymbol = coinASymbol || parts[0];
          coinBSymbol = coinBSymbol || parts[1];
        }
      }
      
      // Always show both coins for dual coin markets
      if (coinASymbol && coinBSymbol) {
        displayMarketName = `${coinASymbol} vs ${coinBSymbol}`;
      }
    }
    
    return {
      ...bet,
      marketName: displayMarketName,
      bucketLabel: getBucketLabel(bet.outcomeIndex, marketData?.numOutcomes, market?.isDualCoin, market),
      amountToken,
      sharesNum,
      potentialPayout,
      probability: (probability * 100).toFixed(1), // Current probability as percentage string
      purchaseProbability: (purchaseProbability * 100).toFixed(1), // Purchase probability as percentage string
      isSettled,
      won,
      currentValue,
      liveSellValue: null, // Sell feature disabled
      pnl: 0,
      pnlPercent: 0,
      isUpBet, // Correctly determined UP or DOWN
      settlementPrice,
      referencePrice,
      priceChangePercent,
      winningBucketLabel,
      market, // Include market reference for dual-coin display
    };
  });

  // Filter out archived bets from display
  const visibleBets = enrichedBets.filter(b => !archivedBetIds.has(b.betId.toString()));
  const activeBets = visibleBets.filter(b => !b.isSettled);
  const settledBets = visibleBets.filter(b => b.isSettled);
  const claimableBets = settledBets.filter(b => b.won && !b.claimed);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 flex flex-col">
      {/* Navigation Bar */}
      <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4 lg:gap-6">
            <Link to="/" className="flex items-center gap-2 shrink-0">
              <img src="/Copilot_20251128_175824-removebg-preview.png" alt="Sting Markets" className="h-8 sm:h-10" />
              <span className="text-lg sm:text-xl font-bold italic tracking-tight hidden sm:inline">Sting Markets</span>
            </Link>
            {/* Desktop nav */}
            <nav className="hidden md:flex gap-4">
              <Link to="/">
                <Button variant="ghost" size="sm">Coin Battles</Button>
              </Link>
              <Link to="/single-markets">
                <Button variant="ghost" size="sm">Markets</Button>
              </Link>
              <Link to="/my-bets">
                <Button variant="ghost" size="sm">My Bets</Button>
              </Link>
              <Link to="/auction">
                <Button variant="ghost" size="sm">Auction</Button>
              </Link>
              {isAdmin && (
                <Link to="/admin-167">
                  <Button variant="ghost" size="sm">Admin</Button>
                </Link>
              )}
            </nav>
          </div>
          
          <div className="flex items-center gap-2">
            <FarcasterConnect />
            {!isInFarcasterClient && <WalletConnect />}
            {/* Mobile menu button */}
            <Button 
              variant="ghost" 
              size="sm" 
              className="md:hidden"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>
        
        {/* Mobile nav menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t bg-background px-4 py-3 space-y-1">
            <Link to="/" onClick={() => setMobileMenuOpen(false)}>
              <Button variant="ghost" size="sm" className="w-full justify-start">Coin Battles</Button>
            </Link>
            <Link to="/single-markets" onClick={() => setMobileMenuOpen(false)}>
              <Button variant="ghost" size="sm" className="w-full justify-start">Markets</Button>
            </Link>
            <Link to="/my-bets" onClick={() => setMobileMenuOpen(false)}>
              <Button variant="ghost" size="sm" className="w-full justify-start">My Bets</Button>
            </Link>
            {isAdmin && (
              <Link to="/admin" onClick={() => setMobileMenuOpen(false)}>
                <Button variant="ghost" size="sm" className="w-full justify-start">Admin</Button>
              </Link>
            )}
          </div>
        )}
      </div>
      <div className="flex-1 container mx-auto px-4 py-6 sm:py-8">
        {/* Header */}
        <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold mb-2">My Bets</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Track your positions, view your history, and claim your winnings
            </p>
          </div>
          <div className="flex gap-2 self-start">
            <Link to="/bet-history">
              <Button variant="outline" size="sm">
                <History className="w-4 h-4 mr-2" />
                Bet History
              </Button>
            </Link>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => refetchBets()}
              disabled={isLoadingBets}
            >
              {isLoadingBets ? 'Refreshing...' : '🔄 Refresh'}
            </Button>
          </div>
        </div>

        {/* Bonding Curve Explainer */}
        {activeBets.length > 0 && (
          <Alert className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>Why different share amounts?</strong> This market uses a bonding curve - early bets get MORE shares per {TOKEN_SYMBOL}, 
              late bets get FEWER shares. Your share count depends on when you bought, not just how much you spent. 
              Check "Your Avg Cost" to see your entry price!
            </AlertDescription>
          </Alert>
        )}

        {/* Bets List */}
        <div className="space-y-6">
          {/* Active Bets */}
          {activeBets.length > 0 && (
            <div>
              <h2 className="text-xl sm:text-2xl font-bold mb-4">Active Bets</h2>
              <div className="space-y-3">
                {activeBets.map((bet) => {
                  // Calculate potential winnings based on share ratio * opposite bucket liquidity
                  // This requires fetching pool data from the contract
                  const marketData = getBetMarketData(bet.marketId);
                  let potentialWinnings = bet.potentialPayout;
                  
                  // If we have market data with probabilities, calculate more accurately
                  if (marketData && marketData.probabilities && marketData.probabilities.length > bet.outcomeIndex) {
                    const yourProbability = marketData.probabilities[bet.outcomeIndex];
                    if (yourProbability > 0 && marketData.totalLiquidity > 0) {
                      // Your proportional share of winning bucket
                      const yourShareOfWinningBucket = bet.amountToken / (marketData.totalLiquidity * yourProbability);
                      // Size of losing bucket
                      const losingBucketSize = marketData.totalLiquidity * (1 - yourProbability);
                      // Potential payout = your bet + your share of losing side
                      potentialWinnings = bet.amountToken + (yourShareOfWinningBucket * losingBucketSize);
                      // Cap at total liquidity
                      potentialWinnings = Math.min(potentialWinnings, marketData.totalLiquidity);
                    }
                  }
                  
                  return (
                    <Card key={bet.betId.toString()}>
                      <CardContent className="p-4 sm:p-6">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                          <div className="flex-1 space-y-2">
                            {/* Coin/Market Name */}
                            <div className="flex items-center gap-2">
                              {bet.market?.isDualCoin ? (
                                <TrendingUp className="w-5 h-5 text-green-500 shrink-0" />
                              ) : bet.isUpBet ? (
                                <TrendingUp className="w-5 h-5 text-green-500 shrink-0" />
                              ) : (
                                <TrendingDown className="w-5 h-5 text-red-500 shrink-0" />
                              )}
                              <span className="font-bold text-lg">{bet.marketName}</span>
                              <Badge variant="secondary" className="font-mono text-xs">
                                {bet.market?.isDualCoin 
                                  ? (bet.outcomeIndex === 0 
                                      ? (bet.market.coinASymbol || ((bet.market as any).symbol?.split('-')[0]) || 'Coin A')
                                      : (bet.market.coinBSymbol || ((bet.market as any).symbol?.split('-')[1]) || 'Coin B'))
                                  : bet.bucketLabel
                                }
                              </Badge>
                            </div>
                            
                            {/* Simple stats */}
                            <div className="grid grid-cols-4 gap-4 text-sm">
                              <div>
                                <span className="text-muted-foreground">Amount Bet:</span>
                                <p className="font-bold text-lg">{bet.amountToken.toFixed(2)} {TOKEN_SYMBOL}</p>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Shares:</span>
                                <p className="font-bold text-lg text-purple-500">{bet.sharesNum.toFixed(2)}</p>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Bought at:</span>
                                <p className="font-bold text-lg text-blue-500">{bet.purchaseProbability}%</p>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Potential Win:</span>
                                <p className="font-bold text-lg text-green-500">{potentialWinnings.toFixed(2)} {TOKEN_SYMBOL}</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {/* Settled Bets */}
          {settledBets.length > 0 && (
            <div>
              <h2 className="text-xl sm:text-2xl font-bold mb-4">Settled Bets</h2>
              <div className="space-y-3">
                {settledBets.map((bet) => (
                  <Card key={bet.betId.toString()} className={bet.won ? 'border-green-500' : 'border-red-500/30'}>
                    <CardContent className="p-4 sm:p-6">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div className="flex-1 space-y-2">
                          {/* Coin/Market Name with result icon */}
                          <div className="flex items-center gap-2">
                            {bet.won ? (
                              <Trophy className="w-5 h-5 text-green-500 shrink-0" />
                            ) : (
                              <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
                            )}
                            <span className="font-bold text-lg">{bet.marketName}</span>
                            <Badge variant="secondary" className="font-mono text-xs">
                              {bet.market?.isDualCoin 
                                ? (bet.outcomeIndex === 0 
                                    ? (bet.market.coinASymbol || ((bet.market as any).symbol?.split('-')[0]) || 'Coin A')
                                    : (bet.market.coinBSymbol || ((bet.market as any).symbol?.split('-')[1]) || 'Coin B'))
                                : bet.bucketLabel
                              }
                            </Badge>
                            {bet.won ? (
                              <Badge variant="outline" className="border-green-500 text-green-500 ml-auto">Won</Badge>
                            ) : (
                              <Badge variant="outline" className="border-red-500 text-red-500 ml-auto">Lost</Badge>
                            )}
                          </div>
                          
                          {/* Simple stats */}
                          <div className="grid grid-cols-4 gap-4 text-sm">
                            <div>
                              <span className="text-muted-foreground">Amount Bet:</span>
                              <p className="font-bold text-lg">{bet.amountToken.toFixed(2)} {TOKEN_SYMBOL}</p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Shares:</span>
                              <p className="font-bold text-lg text-purple-500">{bet.sharesNum.toFixed(2)}</p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Bought at:</span>
                              <p className="font-bold text-lg text-blue-500">{bet.purchaseProbability}%</p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Result:</span>
                              <p className={`font-bold text-lg ${bet.won ? 'text-green-500' : 'text-red-500'}`}>
                                {bet.won ? `${bet.potentialPayout.toFixed(2)} ${TOKEN_SYMBOL}` : 'Lost'}
                              </p>
                            </div>
                          </div>
                        </div>
                        
                        {/* Action buttons */}
                        <div className="flex sm:flex-col gap-2">
                          {bet.won && !bet.claimed && (
                            <Button
                              size="sm"
                              onClick={() => handleClaim(bet.marketId)}
                              disabled={claimingBetId === bet.marketId}
                              className="bg-green-500 hover:bg-green-600"
                            >
                              {claimingBetId === bet.marketId ? 'Claiming...' : 'Claim'}
                            </Button>
                          )}
                          {bet.claimed && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleArchiveBet(bet)}
                              className="text-muted-foreground hover:text-foreground"
                            >
                              <History className="w-3 h-3 mr-1" />
                              Archive
                            </Button>
                          )}
                          {!bet.won && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleArchiveBet(bet)}
                              className="text-muted-foreground hover:text-red-500"
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Loading State */}
          {isLoadingBets && (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <BetCardSkeleton key={i} />
              ))}
            </div>
          )}

          {/* Error State */}
          {betsError && !isLoadingBets && (
            <Alert variant="destructive" className="mb-6">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>Error loading bets:</strong> {betsError.message}
                <br />
                <Button variant="outline" size="sm" className="mt-2" onClick={() => refetchBets()}>
                  Retry
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {/* Empty State */}
          {enrichedBets.length === 0 && !isLoadingBets && !betsError && (
            <Card className="p-12 text-center">
              <Wallet className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
              <CardTitle className="mb-2">No Bets Yet</CardTitle>
              <CardDescription className="mb-4">
                Start betting on prediction markets to see your positions here
              </CardDescription>
              <CardDescription className="mb-6 text-xs">
                Connected: {address?.slice(0, 6)}...{address?.slice(-4)}
                <br />
                Contract: {CONTRACT_ADDRESSES[84532].slice(0, 10)}...
              </CardDescription>
              <Button asChild>
                <a href="/">Browse Markets</a>
              </Button>
            </Card>
          )}
        </div>

        {/* Blockchain Notice */}
        <Alert className="mt-8">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-xs">
            <strong>On-Chain Betting:</strong> All bets are recorded on Base Sepolia testnet. Claims transfer funds directly from the smart contract to your wallet.
            <br />
            <strong>Sell Positions:</strong> Exit active bets early at current odds before market locks. Value based on pool distribution (like Polymarket).
          </AlertDescription>
        </Alert>
      </div>

      {/* Partial Sell Dialog */}
      <Dialog open={sellDialogBet !== null} onOpenChange={(open) => !open && setSellDialogBet(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="w-5 h-5 text-orange-500" />
              Sell Position
            </DialogTitle>
            <DialogDescription>
              Choose how much of your position to sell
            </DialogDescription>
          </DialogHeader>
          
          {sellDialogBet && (
            <div className="space-y-6 py-4">
              {/* Position Info */}
              <div className="p-4 bg-muted rounded-lg space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Market:</span>
                  <span className="font-bold">{sellDialogBet.marketName}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Position:</span>
                  <Badge variant="secondary" className="font-mono">{sellDialogBet.bucketLabel}</Badge>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total Shares:</span>
                  <span className="font-bold">{sellDialogBet.sharesNum.toFixed(6)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Est. Full Value:</span>
                  <span className="font-bold text-orange-500">
                    ~{(sellDialogBet.currentValue * 0.99).toFixed(2)} {TOKEN_SYMBOL}
                  </span>
                </div>
              </div>

              {/* Percentage Slider */}
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <Label>Amount to Sell</Label>
                  <span className="text-2xl font-bold text-orange-500">{sellPercentage}%</span>
                </div>
                <Slider
                  value={[sellPercentage]}
                  onValueChange={(value) => setSellPercentage(value[0])}
                  min={10}
                  max={100}
                  step={10}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>10%</span>
                  <span>50%</span>
                  <span>100%</span>
                </div>
              </div>

              {/* Quick Select Buttons */}
              <div className="flex gap-2">
                {[25, 50, 75, 100].map((pct) => (
                  <Button
                    key={pct}
                    variant={sellPercentage === pct ? "default" : "outline"}
                    size="sm"
                    className="flex-1"
                    onClick={() => setSellPercentage(pct)}
                  >
                    {pct}%
                  </Button>
                ))}
              </div>

              {/* Sell Summary */}
              <div className="p-4 bg-orange-500/10 border border-orange-500/30 rounded-lg space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Shares to Sell:</span>
                  <span className="font-bold">{(sellDialogBet.sharesNum * sellPercentage / 100).toFixed(6)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Est. Payout:</span>
                  <span className="font-bold text-orange-500">
                    ~{(sellDialogBet.currentValue * 0.99 * sellPercentage / 100).toFixed(2)} {TOKEN_SYMBOL}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Remaining:</span>
                  <span className="font-bold">{(100 - sellPercentage)}% of position</span>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="flex gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setSellDialogBet(null)}>
              Cancel
            </Button>
            <Button 
              onClick={handlePartialSell}
              className="bg-orange-500 hover:bg-orange-600"
              disabled={isSellPending || isSellConfirming}
            >
              {isSellPending || isSellConfirming ? 'Selling...' : `Sell ${sellPercentage}%`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
