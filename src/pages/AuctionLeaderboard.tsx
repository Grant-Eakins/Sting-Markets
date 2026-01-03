import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Trophy, Coins, Timer, DollarSign, TrendingUp, Play, StopCircle, CheckCircle2 } from 'lucide-react';

interface Bid {
  id: string;
  walletAddress: string;
  coinContractAddress: string;
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
  
  const [leaderboard, setLeaderboard] = useState<Bid[]>([]);
  const [config, setConfig] = useState<AuctionConfig | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Bid form
  const [coinAddress, setCoinAddress] = useState('');
  const [bidAmount, setBidAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  
  // Admin settings
  const [minMarketCap, setMinMarketCap] = useState('');
  const [maxMarketCap, setMaxMarketCap] = useState('');
  const [minBid, setMinBid] = useState('');
  const [duration, setDuration] = useState('24');

  const isAdmin = address && ADMIN_WALLETS.includes(address.toLowerCase());

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 10000); // Refresh every 10s
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    try {
      const [configRes, leaderboardRes] = await Promise.all([
        fetch('http://localhost:3001/api/auction/config'),
        fetch('http://localhost:3001/api/auction/leaderboard'),
      ]);

      const configData = await configRes.json();
      const leaderboardData = await leaderboardRes.json();

      setConfig(configData);
      setLeaderboard(leaderboardData);
      
      if (configData && !minMarketCap) {
        setMinMarketCap(String(configData.minMarketCap));
        setMaxMarketCap(String(configData.maxMarketCap));
        setMinBid(String(configData.minBidAmount));
      }
    } catch (error) {
      console.error('Error loading auction data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStartAuction = async () => {
    if (!address) return;

    try {
      const response = await fetch('http://localhost:3001/api/auction/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          walletAddress: address,
          durationHours: parseInt(duration)
        }),
      });

      if (response.ok) {
        toast({ title: '✅ Auction started!' });
        loadData();
      } else {
        throw new Error('Failed to start auction');
      }
    } catch (error: any) {
      toast({ title: '❌ Error', description: error.message, variant: 'destructive' });
    }
  };

  const handleStopAuction = async () => {
    if (!address) return;

    try {
      const response = await fetch('http://localhost:3001/api/auction/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: address }),
      });

      if (response.ok) {
        toast({ title: '🛑 Auction stopped' });
        loadData();
      }
    } catch (error: any) {
      toast({ title: '❌ Error', description: error.message, variant: 'destructive' });
    }
  };

  const handleFinalizeAuction = async () => {
    if (!address) return;

    try {
      const response = await fetch('http://localhost:3001/api/auction/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: address }),
      });

      const data = await response.json();
      
      if (data.success) {
        toast({ 
          title: '🏆 Auction finalized!', 
          description: `Winners: ${data.winners.map((w: Bid) => w.coinSymbol).join(' vs ')}` 
        });
        loadData();
      } else {
        throw new Error('Failed to finalize');
      }
    } catch (error: any) {
      toast({ title: '❌ Error', description: error.message, variant: 'destructive' });
    }
  };

  const handleUpdateConfig = async () => {
    if (!address) return;

    try {
      const response = await fetch('http://localhost:3001/api/auction/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          walletAddress: address,
          minMarketCap: parseFloat(minMarketCap),
          maxMarketCap: parseFloat(maxMarketCap),
          minBidAmount: parseFloat(minBid),
        }),
      });

      if (response.ok) {
        toast({ title: '✅ Config updated!' });
        loadData();
      }
    } catch (error: any) {
      toast({ title: '❌ Error', description: error.message, variant: 'destructive' });
    }
  };

  const handleSubmitBid = async () => {
    if (!address || !coinAddress || !bidAmount) return;

    setSubmitting(true);
    try {
      const response = await fetch('http://localhost:3001/api/auction/bid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: address,
          coinContractAddress: coinAddress,
          bidAmount: parseFloat(bidAmount),
        }),
      });

      const data = await response.json();

      if (data.success) {
        toast({ title: '✅ Bid submitted!', description: `${data.bid.coinSymbol} - ${bidAmount} USDC` });
        setCoinAddress('');
        setBidAmount('');
        loadData();
      } else {
        throw new Error(data.error);
      }
    } catch (error: any) {
      toast({ title: '❌ Error', description: error.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const timeRemaining = config?.currentAuctionEnd 
    ? Math.max(0, new Date(config.currentAuctionEnd).getTime() - Date.now())
    : 0;
  const hoursRemaining = Math.floor(timeRemaining / (1000 * 60 * 60));
  const minutesRemaining = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));

  if (loading) {
    return <div className="container mx-auto px-4 py-8">Loading...</div>;
  }

  return (
    <div className="container mx-auto px-4 py-8 mb-20 md:mb-0">
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

        {/* Admin Controls */}
        {isAdmin && (
          <Card className="mb-6 border-yellow-500/50">
            <CardHeader>
              <CardTitle>Admin Controls</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Input 
                  placeholder="Min Market Cap" 
                  value={minMarketCap}
                  onChange={(e) => setMinMarketCap(e.target.value)}
                  type="number"
                />
                <Input 
                  placeholder="Max Market Cap" 
                  value={maxMarketCap}
                  onChange={(e) => setMaxMarketCap(e.target.value)}
                  type="number"
                />
                <Input 
                  placeholder="Min Bid (USDC)" 
                  value={minBid}
                  onChange={(e) => setMinBid(e.target.value)}
                  type="number"
                />
                <Input 
                  placeholder="Duration (hours)" 
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  type="number"
                />
              </div>
              <div className="flex gap-3">
                <Button onClick={handleUpdateConfig} variant="outline">
                  Update Config
                </Button>
                {!config?.isActive ? (
                  <Button onClick={handleStartAuction} className="bg-green-600">
                    <Play className="h-4 w-4 mr-2" />
                    Start Auction
                  </Button>
                ) : (
                  <>
                    <Button onClick={handleStopAuction} variant="destructive">
                      <StopCircle className="h-4 w-4 mr-2" />
                      Stop Auction
                    </Button>
                    <Button onClick={handleFinalizeAuction} className="bg-yellow-600">
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Finalize & Create Market
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Submit Bid */}
        {config?.isActive && address && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Submit Bid</CardTitle>
              <CardDescription>
                Top 2 highest bids become the next dual coin market
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col md:flex-row gap-3">
                <Input
                  placeholder="Coin Contract Address (Base)"
                  value={coinAddress}
                  onChange={(e) => setCoinAddress(e.target.value)}
                  className="flex-1"
                />
                <Input
                  placeholder="Bid Amount (USDC)"
                  type="number"
                  value={bidAmount}
                  onChange={(e) => setBidAmount(e.target.value)}
                  className="w-full md:w-40"
                />
                <Button 
                  onClick={handleSubmitBid} 
                  disabled={submitting || !coinAddress || !bidAmount}
                  className="w-full md:w-auto"
                >
                  <Coins className="h-4 w-4 mr-2" />
                  Submit Bid
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Leaderboard */}
        <Card>
          <CardHeader>
            <CardTitle>Leaderboard</CardTitle>
            <CardDescription>Top bidders - Winners will be featured in the next market</CardDescription>
          </CardHeader>
          <CardContent>
            {leaderboard.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No bids yet. Be the first!
              </div>
            ) : (
              <div className="space-y-2">
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
                        <div className="text-sm text-muted-foreground">
                          {bid.coinName}
                          {bid.marketCap && (
                            <span className="ml-2">
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
  );
}
