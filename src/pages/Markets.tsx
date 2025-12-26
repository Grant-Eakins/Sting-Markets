import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Market, fetchMarkets } from '@/lib/marketApi';
import { TOKEN_SYMBOL } from '@/config/contract';
import { MarketCard } from '@/components/MarketCard';
import { DualCoinMarketCard } from '@/components/DualCoinMarketCard';
import { WalletConnect } from '@/components/WalletConnect';
import { FarcasterConnect } from '@/components/FarcasterConnect';
import { useFarcasterAuth } from '@/hooks/useFarcasterAuth';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MarketCardSkeleton, StatCardSkeleton } from '@/components/ui/skeleton';
import { Footer } from '@/components/Footer';
import { useAggregateMarketStats } from '@/hooks/useAggregateMarketStats';
import { useAccount } from 'wagmi';

// Authorized admin wallet addresses (lowercase for comparison)
const ADMIN_WALLETS = [
  '0x6b1b7e7b207ec756b8d9edc59db4b32184160b22',
  '0xb0687ef6ea5906089ec3586f9997764650bf1934',
];

export default function Markets() {
  const { address, isConnected } = useAccount();
  const { isInFarcasterClient } = useFarcasterAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  // Check if connected wallet is admin
  const isAdmin = isConnected && address && ADMIN_WALLETS.includes(address.toLowerCase());

  const { data: markets = [], isLoading, refetch } = useQuery({
    queryKey: ['markets', 'active'],
    queryFn: () => fetchMarkets('active'),
    refetchInterval: 30000, // Refetch every 30 seconds
  });

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
        <div className="w-full px-2 sm:container sm:mx-auto sm:px-4 py-3 sm:py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-4 lg:gap-6">
            <Link to="/" className="flex items-center gap-1 sm:gap-2 shrink-0">
              <img src="/Copilot_20251128_175824-removebg-preview.png" alt="Sting Markets" className="h-7 sm:h-10" />
              <span className="text-base sm:text-lg md:text-xl font-bold italic tracking-tight hidden sm:inline">Sting Markets</span>
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
              {isAdmin && (
                <Link to="/admin-167">
                  <Button variant="ghost" size="sm">Admin</Button>
                </Link>
              )}
            </nav>
          </div>
          
          <div className="flex items-center gap-1 sm:gap-2">
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
        <div className="w-full px-1 sm:container sm:mx-auto sm:px-4 py-3 sm:py-8">

        {/* Page Title */}
        <div className="mb-3 sm:mb-8 px-1">
          <h1 className="text-xl sm:text-3xl md:text-4xl font-bold mb-1 sm:mb-2" style={{ color: 'hsl(222 35% 25%)' }}>⚔️ Coin Battles</h1>
          <p className="text-xs sm:text-sm text-muted-foreground" style={{ color: 'hsl(222 35% 25%)' }}>Bet on which coin gains more percentage in head-to-head battles</p>
        </div>

        {/* Coin Battles Grid */}
        {isLoading ? (
          <div className="space-y-6">
            {[...Array(3)].map((_, i) => (
              <MarketCardSkeleton key={i} />
            ))}
          </div>
        ) : markets.filter(m => (m as any).isDualCoin).length === 0 ? (
          <Card className="p-8 sm:p-12 text-center">
            <CardTitle className="mb-2">No Coin Battles Available</CardTitle>
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
        </div>
      </div>
      
      <Footer />
    </div>
  );
}
