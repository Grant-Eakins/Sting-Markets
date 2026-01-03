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
import { useAuctionTokenAllowance, useAuctionTokenApproval, useSubmitAuctionBid } from '@/hooks/useContract';
import { formatUnits } from 'viem';

const API_BASE = import.meta.env.PROD ? '/api' : 'http://localhost:3001/api';

interface Bid {
  id: string;
  walletAddress: string;
  coinContractAddress: string;
  chain: 'base' | 'solana';
  coinSymbol: string;
  coinName?: string;
  marketCap?: number;
  bidAmount: number;
  status: string;
  createdAt: string;
  rank?: number;
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
  
  const [leaderboard, setLeaderboard] = useState<Bid[]>([]);
  const [config, setConfig] = useState<AuctionConfig | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Bid form
  const [coinAddress, setCoinAddress] = useState('');
  const [bidAmount, setBidAmount] = useState('');

  // Blockchain hooks
  const { allowance, refetch: refetchAllowance } = useAuctionTokenAllowance();
  const { approve, isPending: isApproving, isConfirming: isApprovingConfirm, isConfirmed: isApproved } = useAuctionTokenApproval();
  const { submitBid, isPending: isSubmitting, isConfirming: isSubmitConfirm, isConfirmed: isBidSubmitted, error: bidError } = useSubmitAuctionBid();

  const isAdmin = address && ADMIN_WALLETS.includes(address.toLowerCase());

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 10000); // Refresh every 10s
    return () => clearInterval(interval);
  }, []);

  // Refetch allowance after approval
  useEffect(() => {
    if (isApproved) {
      refetchAllowance();
      toast({ title: '✅ Approval successful!', description: 'You can now submit your bid' });
    }
  }, [isApproved, refetchAllowance]);

  // Handle successful bid submission
  useEffect(() => {
    if (isBidSubmitted) {
      toast({ title: '✅ Bid submitted on-chain!', description: `Your bid for ${coinAddress.slice(0, 10)}... has been recorded` });
      setCoinAddress('');
      setBidAmount('');
      loadData();
      refetchAllowance();
    }
  }, [isBidSubmitted]);

  // Handle bid submission errors
  useEffect(() => {
    if (bidError) {
      toast({ 
        title: '❌ Bid failed', 
        description: bidError.message,
        variant: 'destructive' 
      });
    }
  }, [bidError]);

  const loadData = async () => {
    try {
      const [configRes, leaderboardRes] = await Promise.all([
        fetch(`${API_BASE}/auction/config`),
        fetch(`${API_BASE}/auction/leaderboard`),
      ]);

      const configData = await configRes.json();
      const leaderboardData = await leaderboardRes.json();

      setConfig(configData);
      setLeaderboard(leaderboardData);
    } catch (error) {
      console.error('Error loading auction data:', error);
    } finally {
      setLoading(false);
    }
  };

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
      const amountInWei = BigInt(parseFloat(bidAmount) * 1e18);
      const needsApproval = !allowance || allowance < amountInWei;

      if (needsApproval) {
        toast({ title: '🔓 Approval needed', description: 'Approving MIND tokens for auction...' });
        approve(bidAmount);
      } else {
        submitBid(coinAddress, detectedChain, bidAmount);
      }
    } catch (error: any) {
      toast({ title: '❌ Error', description: error.message, variant: 'destructive' });
    }
  };

  const isProcessing = isApproving || isApprovingConfirm || isSubmitting || isSubmitConfirm;
  const needsApproval = !allowance || (bidAmount && allowance < BigInt(parseFloat(bidAmount) * 1e18));

  const timeRemaining = config?.currentAuctionEnd 
    ? Math.max(0, new Date(config.currentAuctionEnd).getTime() - Date.now())
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
                <div className="text-lg font-bold">{config?.minBidAmount} USDC</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Total Bids</div>
                <div className="text-lg font-bold">{leaderboard.length}</div>
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
                    placeholder="Bid Amount (MIND)"
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
                    {!isProcessing && needsApproval && 'Approve MIND'}
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
            {leaderboard.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No bids yet. Be the first!
              </div>
            ) : (
              <div className="space-y-3">
                {leaderboard.map((bid, index) => (
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
                      <div>
                        <div className="font-bold">{bid.coinSymbol}</div>
                        <div className="text-sm text-muted-foreground flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            {bid.chain.toUpperCase()}
                          </Badge>
                          {bid.coinName}
                          {bid.marketCap && (
                            <span className="ml-1">
                              <TrendingUp className="inline h-3 w-3" /> ${(bid.marketCap / 1000000).toFixed(2)}M
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-lg flex items-center gap-1">
                        <DollarSign className="h-4 w-4" />
                        {bid.bidAmount.toFixed(2)} USDC
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {bid.walletAddress.slice(0, 6)}...{bid.walletAddress.slice(-4)}
                      </div>
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
