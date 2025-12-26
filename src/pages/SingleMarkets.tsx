import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { fetchMarkets } from '@/lib/marketApi';
import { MarketCard } from '@/components/MarketCard';
import { WalletConnect } from '@/components/WalletConnect';
import { FarcasterConnect } from '@/components/FarcasterConnect';
import { useFarcasterAuth } from '@/hooks/useFarcasterAuth';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Menu, X, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MarketCardSkeleton } from '@/components/ui/skeleton';
import { Footer } from '@/components/Footer';
import { useAccount } from 'wagmi';

// Authorized admin wallet addresses (lowercase for comparison)
const ADMIN_WALLETS = [
  '0x6b1b7e7b207ec756b8d9edc59db4b32184160b22',
  '0xb0687ef6ea5906089ec3586f9997764650bf1934',
];

export default function SingleMarkets() {
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

  // Filter for single-coin markets only
  const singleCoinMarkets = markets.filter(m => !(m as any).isDualCoin);

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
              <Link to="/admin-167" onClick={() => setMobileMenuOpen(false)}>
                <Button variant="ghost" size="sm" className="w-full justify-start">Admin</Button>
              </Link>
            )}
          </div>
        )}
      </div>
      
      {/* Main Content Area with Yellow Background */}
      <div className="flex-1 bg-yellow-content">
        <div className="container mx-auto px-4 py-8">

        {/* Page Title */}
        <div className="mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold mb-2 flex items-center gap-2">
            <TrendingUp className="w-8 h-8" />
            Single Coin Markets
          </h1>
          <p className="text-muted-foreground">Bet on whether a single coin will go up or down</p>
        </div>

        {/* Markets Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {[...Array(6)].map((_, i) => (
              <MarketCardSkeleton key={i} />
            ))}
          </div>
        ) : singleCoinMarkets.length === 0 ? (
          <Card className="p-8 sm:p-12 text-center">
            <CardTitle className="mb-2">No Single Coin Markets Available</CardTitle>
            <CardDescription>
              Check back soon for single coin markets!
            </CardDescription>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {singleCoinMarkets.map((market) => (
              <MarketCard key={market.id} market={market} onBetPlaced={() => refetch()} />
            ))}
          </div>
        )}
        </div>
      </div>
      
      <Footer />
    </div>
  );
}
