import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Market, fetchMarkets } from '@/lib/marketApi';
import { MarketCard } from '@/components/MarketCard';
import { WalletConnect } from '@/components/WalletConnect';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Search, TrendingUp, DollarSign, Users, Clock, Menu, X } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
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
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'active' | 'all'>('active');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  // Check if connected wallet is admin
  const isAdmin = isConnected && address && ADMIN_WALLETS.includes(address.toLowerCase());

  const { data: markets = [], isLoading, refetch } = useQuery({
    queryKey: ['markets', statusFilter],
    queryFn: () => fetchMarkets(statusFilter),
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

  const filteredMarkets = markets.filter((market) =>
    market.stockSymbol?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    market.stockName?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const activeMarkets = markets.filter(m => m.status === 'ACTIVE');
  
  // Get real-time stats from blockchain
  const stats = useAggregateMarketStats(markets);
  const totalPool = stats.totalPool;
  const totalBets = stats.totalBets;

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
            {/* Desktop nav */}
            <nav className="hidden md:flex gap-4">
              <Link to="/">
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
            <WalletConnect />
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
      
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold mb-2">Crypto Prediction Markets</h1>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
          <Card>
            <CardHeader className="pb-2 sm:pb-3 p-4 sm:p-6">
              <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground flex items-center gap-2">
                <TrendingUp className="w-3 h-3 sm:w-4 sm:h-4" />
                <span className="hidden sm:inline">Active Markets</span>
                <span className="sm:hidden">Active</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 pt-0">
              <div className="text-xl sm:text-2xl font-bold">{activeMarkets.length}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2 sm:pb-3 p-4 sm:p-6">
              <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground flex items-center gap-2">
                <DollarSign className="w-3 h-3 sm:w-4 sm:h-4" />
                <span className="hidden sm:inline">Total Pool</span>
                <span className="sm:hidden">Pool</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 pt-0">
              <div className="text-xl sm:text-2xl font-bold">{totalPool.toFixed(2)} <span className="text-sm font-normal text-muted-foreground">ETH</span></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2 sm:pb-3 p-4 sm:p-6">
              <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Users className="w-3 h-3 sm:w-4 sm:h-4" />
                <span className="hidden sm:inline">Total Bets</span>
                <span className="sm:hidden">Bets</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 pt-0">
              <div className="text-xl sm:text-2xl font-bold">{totalBets}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2 sm:pb-3 p-4 sm:p-6">
              <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Clock className="w-3 h-3 sm:w-4 sm:h-4" />
                <span className="hidden sm:inline">Next Settlement</span>
                <span className="sm:hidden">Next</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 pt-0">
              <div className="text-xl sm:text-2xl font-bold">
                {activeMarkets.length > 0 
                  ? (() => {
                      const nextSettle = activeMarkets
                        .map(m => new Date(m.settleTime).getTime())
                        .filter(t => t > Date.now())
                        .sort((a, b) => a - b)[0];
                      if (!nextSettle) return '—';
                      const hoursLeft = Math.max(0, Math.floor((nextSettle - Date.now()) / (1000 * 60 * 60)));
                      return `${hoursLeft}h`;
                    })()
                  : '—'
                }
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search and Filters */}
        <div className="mb-6 flex flex-col sm:flex-row gap-3 sm:gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              type="text"
              placeholder="Search markets..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as 'active' | 'all')} className="w-full sm:w-auto">
            <TabsList className="w-full sm:w-auto grid grid-cols-2 sm:flex">
              <TabsTrigger value="active" className="text-sm">
                Active
                <Badge variant="secondary" className="ml-2 hidden sm:inline-flex">{activeMarkets.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="all" className="text-sm">
                All
                <Badge variant="secondary" className="ml-2 hidden sm:inline-flex">{markets.length}</Badge>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Markets Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {[...Array(6)].map((_, i) => (
              <MarketCardSkeleton key={i} />
            ))}
          </div>
        ) : filteredMarkets.length === 0 ? (
          <Card className="p-8 sm:p-12 text-center">
            <Search className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <CardTitle className="mb-2">No Markets Found</CardTitle>
            <CardDescription>
              {searchQuery ? 'No markets found matching your search.' : 'No markets available yet.'}
            </CardDescription>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {filteredMarkets.map((market) => (
              <MarketCard key={market.id} market={market} onBetPlaced={() => refetch()} />
            ))}
          </div>
        )}
      </div>
      
      <Footer />
    </div>
  );
}
