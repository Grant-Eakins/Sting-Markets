import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Market, fetchMarkets } from '@/lib/marketApi';
import { TOKEN_SYMBOL, TOKEN_ADDRESSES } from '@/config/contract';
import { MarketCard } from '@/components/MarketCard';
import { DualCoinMarketCard } from '@/components/DualCoinMarketCard';
import { ScheduledMarketCard } from '@/components/ScheduledMarketCard';
import { WalletConnect } from '@/components/WalletConnect';
import { FarcasterConnect } from '@/components/FarcasterConnect';
import { useFarcasterAuth } from '@/hooks/useFarcasterAuth';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MarketCardSkeleton, StatCardSkeleton } from '@/components/ui/skeleton';
import { useAggregateMarketStats } from '@/hooks/useAggregateMarketStats';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { useToast } from '@/hooks/use-toast';
import { baseSepolia } from 'viem/chains';

// Authorized admin wallet addresses (lowercase for comparison)
const ADMIN_WALLETS = [
  '0x6b1b7e7b207ec756b8d9edc59db4b32184160b22',
  '0xb0687ef6ea5906089ec3586f9997764650bf1934',
];

const MOCK_USDC_ABI = [
  {
    "inputs": [],
    "name": "faucet",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const;

export default function Markets() {
  const { address, isConnected } = useAccount();
  const { isInFarcasterClient } = useFarcasterAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { toast } = useToast();
  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({ hash });
  
  // Check if connected wallet is admin
  const isAdmin = isConnected && address && ADMIN_WALLETS.includes(address.toLowerCase());

  const handleFaucet = async () => {
    if (!isConnected) {
      toast({
        title: "Wallet not connected",
        description: "Please connect your wallet first",
        variant: "destructive",
      });
      return;
    }

    try {
      writeContract({
        address: TOKEN_ADDRESSES[baseSepolia.id] as `0x${string}`,
        abi: MOCK_USDC_ABI,
        functionName: 'faucet',
        chainId: baseSepolia.id,
        chain: undefined,
        account: address,
      });
      
      toast({
        title: "Requesting USDC...",
        description: "Transaction submitted",
      });
    } catch (error) {
      console.error('Faucet error:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to request USDC",
        variant: "destructive",
      });
    }
  };

  // Fetch active markets
  const { data: markets = [], isLoading, refetch } = useQuery({
    queryKey: ['markets', 'active'],
    queryFn: () => fetchMarkets('active'),
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  // Fetch scheduled markets
  const { data: scheduledMarkets = [], isLoading: isLoadingScheduled, refetch: refetchScheduled } = useQuery({
    queryKey: ['markets', 'scheduled'],
    queryFn: () => fetchMarkets('scheduled'),
    refetchInterval: 5000, // Refetch every 5 seconds for countdown updates
  });

  // Callback when countdown completes - refetch both scheduled and active markets
  const handleCountdownComplete = () => {
    console.log('⏰ Countdown completed, refreshing markets...');
    refetchScheduled();
    refetch();
  };

  // Debug: Log markets to see if blockchainMarketId is set
  if (markets.length > 0) {
    console.log('🏪 Markets from API:', markets.map(m => ({
      id: m.id,
      symbol: m.stockSymbol,
      blockchainMarketId: m.blockchainMarketId,
    })));
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Navigation Bar */}
      <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="w-full px-2 sm:container sm:mx-auto sm:px-4 py-4 sm:py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-4 lg:gap-6">
            <Link to="/" className="flex items-center gap-1 sm:gap-2 shrink-0">
              <img src="/Copilot_20251128_175824-removebg-preview.png" alt="Sting Markets" className="h-7 sm:h-10" />
              <span className="text-base sm:text-lg md:text-xl font-bold italic tracking-tight">Sting Markets</span>
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
          
          <div className="flex items-center gap-1 sm:gap-2">
            <div className="hidden sm:flex flex-col items-center">
              <Button 
                size="sm"
                onClick={handleFaucet}
                disabled={!isConnected || isPending || isConfirming}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                {isPending || isConfirming ? "Collecting..." : "Get Test USDC"}
              </Button>
              <span className="text-[10px] text-muted-foreground mt-0.5">(Need test ETH for transactions)</span>
            </div>
            <FarcasterConnect />
            {!isInFarcasterClient && <WalletConnect />}
            {/* Mobile menu button */}
            <Button 
              variant="ghost" 
              size="sm" 
              className="md:hidden p-1"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>
        
        {/* Mobile nav menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t bg-background px-4 py-3 space-y-1">
            <div className="mb-2">
              <Button 
                size="sm"
                onClick={() => {
                  handleFaucet();
                  setMobileMenuOpen(false);
                }}
                disabled={!isConnected || isPending || isConfirming}
                className="w-full bg-green-600 hover:bg-green-700 text-white"
              >
                {isPending || isConfirming ? "Collecting..." : "Get Test USDC"}
              </Button>
              <p className="text-xs text-muted-foreground text-center mt-1">(Need test ETH for transactions)</p>
            </div>
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
              <Link to="/admin-167" onClick={() => setMobileMenuOpen(false)}>
                <Button variant="ghost" size="sm" className="w-full justify-start">Admin</Button>
              </Link>
            )}
          </div>
        )}
      </div>
      
      {/* Main Content Area with Yellow Background */}
      <div className="flex-1 bg-yellow-content">
        <div className="w-full px-2 sm:px-4 sm:container sm:mx-auto py-3 sm:py-8">

        {/* Page Title */}
        <div className="mb-3 sm:mb-8">
          <img src="/Copilot_20251226_230143.png" alt="Coin Battles" className="h-24 sm:h-32 md:h-40" />
        </div>

        {/* Scheduled Battles Section */}
        {!isLoadingScheduled && scheduledMarkets.length > 0 && (
          <div className="mb-6 sm:mb-8">
            <div className="space-y-2 sm:space-y-4">
              {scheduledMarkets
                .filter(m => (m as any).isDualCoin && (m as any).startTime)
                .map((market: any) => (
                  <ScheduledMarketCard
                    key={market.id}
                    coinASymbol={market.coinASymbol || 'COIN A'}
                    coinBSymbol={market.coinBSymbol || 'COIN B'}
                    coinAImage={market.coinAImage}
                    coinBImage={market.coinBImage}
                    startTime={market.startTime}
                    onComplete={handleCountdownComplete}
                  />
                ))}
            </div>
          </div>
        )}

        {/* Active Coin Battles Grid - Only show if no scheduled battles */}
        {scheduledMarkets.length === 0 && (
          <>
            <div className="mb-3 sm:mb-6 flex items-center gap-2">
              <h2 className="text-lg sm:text-2xl font-bold italic" style={{ color: 'hsl(222 35% 25%)' }}>
                Live Battles
              </h2>
              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            </div>
            
            {isLoading ? (
              <div className="space-y-6">
                {[...Array(3)].map((_, i) => (
                  <MarketCardSkeleton key={i} />
                ))}
              </div>
            ) : markets.filter(m => (m as any).isDualCoin).length === 0 ? (
              <Card className="p-8 sm:p-12 text-center">
                <CardTitle className="mb-2">No Active Battles</CardTitle>
                <CardDescription>
                  Check back soon for exciting coin battles!
                </CardDescription>
              </Card>
            ) : (
              <div className="space-y-2 sm:space-y-6">
                {markets
                  .filter(m => (m as any).isDualCoin)
                  .map((market) => (
                    <DualCoinMarketCard key={market.id} market={market as any} />
                  ))}
              </div>
            )}
          </>
        )}
        </div>
      </div>
    </div>
  );
}
