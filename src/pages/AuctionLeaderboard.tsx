import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Trophy, Coins, Timer, DollarSign, TrendingUp, Play, StopCircle, CheckCircle2, Menu, X } from 'lucide-react';
import { WalletConnect } from '@/components/WalletConnect';
import { FarcasterConnect } from '@/components/FarcasterConnect';
import { useFarcasterAuth } from '@/hooks/useFarcasterAuth';
import { useAuctionTokenAllowance, useAuctionTokenApproval, useSubmitAuctionBid, useAuctionConfig, useAuctionLeaderboard, useAuctionTotalBids, useBiddingToken, useTokenSymbol } from '@/hooks/useContract';
import { formatUnits } from 'viem';

const API_BASE = import.meta.env.PROD ? '/api' : 'http://localhost:3001/api';

interface Bid {
  id: string;
  bidder: string;
  coinAddress: string;
  chain: string;
  amount: string;
  rank: number;
  coinName?: string;
  coinSymbol?: string;
  coinImage?: string;
}

interface AuctionConfig {
  isActive: boolean;
  minMarketCap: number;
  maxMarketCap: number;
  minBidAmount: number;
  auctionDurationHours: number;
  currentAuctionStart?: string;
  currentAuctionEnd?: string;
}

const ADMIN_WALLETS = [
  '0xb0687ef6ea5906089ec3586f9997764650bf1934',
  '0x6c0512fe7dea0c0d2681c05739171830cd9d9b18',
];

export default function AuctionLeaderboard() {
  const { address } = useAccount();
  const { toast } = useToast();
  const { isInFarcasterClient } = useFarcasterAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  // Bid form
  const [coinAddress, setCoinAddress] = useState('');
  const [bidAmount, setBidAmount] = useState('');
  const [enrichedLeaderboard, setEnrichedLeaderboard] = useState<Bid[]>([]);
  const [isValidatingCoin, setIsValidatingCoin] = useState(false);

  // Blockchain hooks - read directly from contract
  const { config: contractConfig, isLoading: configLoading, refetch: refetchConfig } = useAuctionConfig();
  const { leaderboard, isLoading: leaderboardLoading, refetch: refetchLeaderboard } = useAuctionLeaderboard(50);
  const { totalBids } = useAuctionTotalBids();
  const { tokenAddress: biddingTokenAddress } = useBiddingToken();
  const { symbol: tokenSymbol } = useTokenSymbol(biddingTokenAddress);
  const { allowance, refetch: refetchAllowance } = useAuctionTokenAllowance();
  const { approve, isPending: isApproving, isConfirming: isApprovingConfirm, isConfirmed: isApproved } = useAuctionTokenApproval();
  const { submitBid, isPending: isSubmitting, isConfirming: isSubmitConfirm, isConfirmed: isBidSubmitted, error: bidError } = useSubmitAuctionBid();

  const isAdmin = address && ADMIN_WALLETS.includes(address.toLowerCase());
  const loading = configLoading || leaderboardLoading;
  
  // Parse contract config
  const config = contractConfig ? {
    isActive: contractConfig[0],
    minBidAmount: Number(formatUnits(contractConfig[1] as bigint, 18)),
    auctionStart: new Date(Number(contractConfig[2]) * 1000).toISOString(),
    auctionEnd: new Date(Number(contractConfig[3]) * 1000).toISOString(),
    minMarketCap: Number(contractConfig[4]),
    maxMarketCap: Number(contractConfig[5]),
  } : null;

  // Auto-refresh every 10s
  useEffect(() => {
    const interval = setInterval(() => {
      refetchConfig();
      refetchLeaderboard();
    }, 10000);
    return () => clearInterval(interval);
  }, [refetchConfig, refetchLeaderboard]);

  // Fetch coin metadata for leaderboard
  useEffect(() => {
    const fetchCoinMetadata = async () => {
      if (!leaderboard || leaderboard.length === 0) {
        setEnrichedLeaderboard([]);
        return;
      }

      const enriched = await Promise.all(
        leaderboard.map(async (bid) => {
          try {
            const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${bid.coinAddress}`);
            const data = await response.json();
            
            if (data.pairs && data.pairs.length > 0) {
              const bestPair = data.pairs.sort((a: any, b: any) => 
                (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0)
              )[0];
              
              return {
                ...bid,
                coinName: bestPair.baseToken?.name || 'Unknown',
                coinSymbol: bestPair.baseToken?.symbol || '???',
                coinImage: bestPair.info?.imageUrl,
              };
            }
          } catch (error) {
            console.error(`Failed to fetch metadata for ${bid.coinAddress}:`, error);
          }
          return bid;
        })
      );

      setEnrichedLeaderboard(enriched);
    };

    fetchCoinMetadata();
  }, [leaderboard]);

  // Refetch allowance after approval and auto-submit bid
  useEffect(() => {
    if (isApproved && coinAddress && bidAmount) {
      refetchAllowance();
      toast({ title: '✅ Approved! Submitting bid...', description: `Now sending your ${tokenSymbol || 'MIND'} bid to the auction` });
      
      // Auto-submit after approval
      const isEthAddress = /^0x[a-fA-F0-9]{40}$/.test(coinAddress);
      const detectedChain = isEthAddress ? 'base' : 'solana';
      
      setTimeout(() => {
        submitBid(coinAddress, detectedChain, bidAmount);
      }, 500);
    }
  }, [isApproved]);

  // Handle successful bid submission
  useEffect(() => {
    if (isBidSubmitted) {
      toast({ title: '✅ Bid submitted on-chain!', description: `Your bid for ${coinAddress.slice(0, 10)}... has been recorded` });
      setCoinAddress('');
      setBidAmount('');
      refetchLeaderboard();
      refetchAllowance();
    }
  }, [isBidSubmitted, refetchLeaderboard, refetchAllowance]);

  // Handle bid submission errors
  useEffect(() => {
    if (bidError) {
      let errorMessage = bidError.message;
      
      // Parse common contract errors
      if (errorMessage.includes('No active auction')) {
        errorMessage = 'Auction is not active. Admin needs to start the auction first.';
      } else if (errorMessage.includes('Auction has ended')) {
        errorMessage = 'This auction has already ended.';
      } else if (errorMessage.includes('Bid below minimum')) {
        errorMessage = `Your bid is below the minimum of ${config?.minBidAmount || 0} ${tokenSymbol || 'MIND'} tokens.`;
      } else if (errorMessage.includes('insufficient allowance')) {
        errorMessage = `Please approve ${tokenSymbol || 'MIND'} tokens first.`;
      }
      
      toast({ 
        title: '❌ Bid failed', 
        description: errorMessage,
        variant: 'destructive' 
      });
    }
  }, [bidError, config]);



  const handleSubmitBid = async () => {
    if (!bidAmount || !coinAddress || !address) return;

    // Auto-detect chain based on address format
    const isEthAddress = /^0x[a-fA-F0-9]{40}$/.test(coinAddress);
    const isSolanaAddress = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(coinAddress);
    
    let detectedChain: 'base' | 'solana';
    if (isEthAddress) {
      detectedChain = 'base';
    } else if (isSolanaAddress) {
      detectedChain = 'solana';
    } else {
      toast({ 
        title: '❌ Invalid Address', 
        description: 'Please enter a valid Base (0x...) or Solana contract address',
        variant: 'destructive' 
      });
      return;
    }

    try {
      // Validate market cap BEFORE submitting to contract
      if (config) {
        setIsValidatingCoin(true);
        toast({ title: '🔍 Validating coin...', description: 'Checking market cap requirements' });
        
        try {
          const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${coinAddress}`);
          const data = await response.json();
          
          if (!data.pairs || data.pairs.length === 0) {
            toast({ 
              title: '❌ Token not found', 
              description: 'Could not find this token on DexScreener. Make sure the contract address is correct.',
              variant: 'destructive' 
            });
            setIsValidatingCoin(false);
            return;
          }
          
          // Get the best pair (highest liquidity)
          const supportedPairs = data.pairs.filter((pair: any) => 
            pair.chainId === 'base' || pair.chainId === 'solana'
          );
          
          const pairsToCheck = supportedPairs.length > 0 ? supportedPairs : data.pairs;
          const bestPair = pairsToCheck.sort((a: any, b: any) => 
            (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0)
          )[0];
          
          const marketCap = bestPair.marketCap || bestPair.fdv || 0;
          
          if (marketCap === 0 || !marketCap) {
            toast({ 
              title: '❌ Market cap unavailable', 
              description: 'Could not determine the market cap for this token. It may be too new or have insufficient liquidity.',
              variant: 'destructive' 
            });
            setIsValidatingCoin(false);
            return;
          }
          
          if (marketCap < config.minMarketCap) {
            toast({ 
              title: '❌ Market cap too low', 
              description: `This token has a market cap of $${marketCap.toLocaleString()}, but the minimum required is $${config.minMarketCap.toLocaleString()}`,
              variant: 'destructive' 
            });
            setIsValidatingCoin(false);
            return;
          }
          
          if (marketCap > config.maxMarketCap) {
            toast({ 
              title: '❌ Market cap too high', 
              description: `This token has a market cap of $${marketCap.toLocaleString()}, but the maximum allowed is $${config.maxMarketCap.toLocaleString()}`,
              variant: 'destructive' 
            });
            setIsValidatingCoin(false);
            return;
          }
          
          toast({ 
            title: '✅ Token validated', 
            description: `${bestPair.baseToken?.symbol || 'Token'} has valid market cap: $${marketCap.toLocaleString()}` 
          });
        } catch (error) {
          console.error('Failed to validate coin:', error);
          toast({ 
            title: '❌ Validation failed', 
            description: 'Could not validate the token. Please try again.',
            variant: 'destructive' 
          });
          setIsValidatingCoin(false);
          return;
        }
        
        setIsValidatingCoin(false);
      }

      const amountInWei = BigInt(parseFloat(bidAmount) * 1e18);
      const needsApproval = !allowance || allowance < amountInWei;

      if (needsApproval) {
        toast({ title: '🔓 Approval needed', description: `Approving ${tokenSymbol || 'MIND'} tokens for auction...` });
        approve(bidAmount);
      } else {
        submitBid(coinAddress, detectedChain, bidAmount);
      }
    } catch (error: any) {
      toast({ title: '❌ Error', description: error.message, variant: 'destructive' });
    }
  };

  const isProcessing = isValidatingCoin || isApproving || isApprovingConfirm || isSubmitting || isSubmitConfirm;
  const needsApproval = !allowance || (bidAmount && allowance < BigInt(parseFloat(bidAmount) * 1e18));

  const timeRemaining = config?.auctionEnd 
    ? Math.max(0, new Date(config.auctionEnd).getTime() - Date.now())
    : 0;
  const hoursRemaining = Math.floor(timeRemaining / (1000 * 60 * 60));
  const minutesRemaining = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));

  if (loading) {
    return <div className="container mx-auto px-4 py-8">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
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
            <Link to="/auction" onClick={() => setMobileMenuOpen(false)}>
              <Button variant="ghost" size="sm" className="w-full justify-start">Auction</Button>
            </Link>
            {isAdmin && (
              <Link to="/admin-167" onClick={() => setMobileMenuOpen(false)}>
                <Button variant="ghost" size="sm" className="w-full justify-start">Admin</Button>
              </Link>
            )}
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 container mx-auto px-4 py-8 mb-20 md:mb-0">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-3 mb-6">
            <Trophy className="h-8 w-8 text-yellow-500" />
            <h1 className="text-3xl font-bold">Listing Auction</h1>
          </div>

        {/* Auction Status */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Auction Status</span>
              {config?.isActive ? (
                <Badge className="bg-green-500">Active</Badge>
              ) : (
                <Badge variant="secondary">Inactive</Badge>
              )}
            </CardTitle>
            {config?.isActive && (
              <CardDescription className="flex items-center gap-2 text-lg">
                <Timer className="h-5 w-5" />
                {hoursRemaining}h {minutesRemaining}m remaining
              </CardDescription>
            )}
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="text-sm text-muted-foreground">Min Market Cap</div>
                <div className="text-lg font-bold">${config?.minMarketCap.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Max Market Cap</div>
                <div className="text-lg font-bold">${config?.maxMarketCap.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Min Bid</div>
                <div className="text-lg font-bold">{config?.minBidAmount} {tokenSymbol || 'MIND'}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Total Bids</div>
                <div className="text-lg font-bold">{enrichedLeaderboard.length}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Submit Bid */}
        {config?.isActive && address && (
          <Card className="mb-6">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle>Submit Bid</CardTitle>
                  <CardDescription>
                    Top 2 highest bids become the next Coin Battle
                  </CardDescription>
                </div>
                <Badge variant="outline" className="text-xs">
                  Accepts Solana and Base Contracts
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
                <div className="flex flex-col md:flex-row gap-3">
                  <Input
                    placeholder="Coin Contract Address"
                    value={coinAddress}
                    onChange={(e) => setCoinAddress(e.target.value)}
                    className="flex-1"
                  />
                  <Input
                    placeholder={`Bid Amount (${tokenSymbol || 'MIND'})`}
                    type="number"
                    value={bidAmount}
                    onChange={(e) => setBidAmount(e.target.value)}
                    className="w-full md:w-40"
                  />
                  <Button 
                    onClick={handleSubmitBid} 
                    disabled={isProcessing || !coinAddress || !bidAmount}
                    className="w-full md:w-auto"
                  >
                    <Coins className="h-4 w-4 mr-2" />
                    {isApproving && 'Approving...'}
                    {isApprovingConfirm && 'Confirming Approval...'}
                    {isSubmitting && 'Submitting Bid...'}
                    {isSubmitConfirm && 'Confirming Bid...'}
                    {!isProcessing && needsApproval && `Approve ${tokenSymbol || 'MIND'}`}
                    {!isProcessing && !needsApproval && 'Submit Bid'}
                  </Button>
                </div>
            </CardContent>
          </Card>
        )}

        {/* Leaderboard */}
        <Card>
          <CardHeader>
            <CardTitle>Top Bidders</CardTitle>
            <CardDescription>Top 2 bidders will be featured in the next Coin Battle market</CardDescription>
          </CardHeader>
          <CardContent>
            {enrichedLeaderboard.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No bids yet. Be the first!
              </div>
            ) : (
              <div className="space-y-3">
                {enrichedLeaderboard.map((bid, index) => (
                  <div
                    key={bid.id}
                    className={`flex items-center justify-between p-4 rounded-lg border ${
                      index < 2 ? 'bg-yellow-500/10 border-yellow-500/50' : 'bg-muted/50'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className="text-2xl font-bold w-8">
                        {index === 0 && '🥇'}
                        {index === 1 && '🥈'}
                        {index === 2 && '🥉'}
                        {index > 2 && `#${index + 1}`}
                      </div>
                      {bid.coinImage && (
                        <img 
                          src={bid.coinImage} 
                          alt={bid.coinSymbol || 'Coin'} 
                          className="w-10 h-10 rounded-full"
                          onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        />
                      )}
                      <div>
                        <div className="font-bold">
                          {bid.coinName || `${bid.coinAddress.slice(0, 6)}...${bid.coinAddress.slice(-4)}`}
                        </div>
                        <div className="text-sm text-muted-foreground flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            {bid.coinSymbol || bid.chain.toUpperCase()}
                          </Badge>
                          <span className="text-xs font-mono">
                            {bid.coinAddress.slice(0, 6)}...{bid.coinAddress.slice(-4)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-bold">{(Number(bid.amount) / 1e18).toFixed(0)} {tokenSymbol || 'MIND'}</div>
                      <div className="text-xs text-muted-foreground">Bid Amount</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
    </div>
  );
}
