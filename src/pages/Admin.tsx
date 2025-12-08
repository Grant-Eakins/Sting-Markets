import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { CheckCircle, AlertCircle, Plus, Lock, ShieldX } from 'lucide-react';
import { WalletConnect } from '@/components/WalletConnect';
import { useAccount } from 'wagmi';
import { TOKEN_SYMBOL } from '@/config/contract';

const API_BASE = 'http://localhost:3001/api';

// Authorized admin wallet addresses (lowercase for comparison)
const ADMIN_WALLETS = [
  '0x6b1b7e7b207ec756b8d9edc59db4b32184160b22',
  '0xb0687ef6ea5906089ec3586f9997764650bf1934',
];

interface Market {
  id: string;
  stockSymbol: string;
  stockName?: string;
  description: string;
  status: string;
  openingPrice: number;
  currentPrice?: number;
  closingPrice?: number;
  isAfterHours?: boolean;
  blockchainMarketId?: number;
  lockTime: string;
  settleTime: string;
  upPool: number;
  downPool: number;
  totalBets: number;
}

export default function AdminPage() {
  console.log('AdminPage component rendering...');
  const { address, isConnected, status } = useAccount();
  console.log('useAccount result:', { address, isConnected, status });
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    stockSymbol: '',
    description: '',
    openingPrice: 17500,
    isAfterHours: false,
    lockMinutes: 1,
    settleMinutes: 2,
  });

  const [settleData, setSettleData] = useState({
    marketId: '',
    closingPrice: 17500,
  });

  // Check if the connected wallet is an admin
  const addressLower = address?.toLowerCase();
  const isAdmin = isConnected && addressLower && ADMIN_WALLETS.includes(addressLower);
  
  // Debug logging
  console.log('Admin check:', { status, isConnected, address, addressLower, isAdmin, ADMIN_WALLETS });

  // ALL HOOKS MUST BE CALLED BEFORE ANY CONDITIONAL RETURNS
  // Fetch all markets
  const { data: markets = [], isLoading } = useQuery({
    queryKey: ['admin-markets'],
    queryFn: async () => {
      const response = await axios.get(`${API_BASE}/markets?status=all`);
      return response.data.markets as Market[];
    },
    refetchInterval: 10000,
    enabled: isAdmin, // Only fetch if admin
  });

  // Create market mutation
  const createMarket = useMutation({
    mutationFn: async (data: typeof formData) => {
      const response = await axios.post(`${API_BASE}/markets/create`, data);
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin-markets'] });
      setFormData({
        stockSymbol: '',
        description: '',
        openingPrice: 17500,
        isAfterHours: false,
        lockMinutes: 1,
        settleMinutes: 2,
      });
      alert(`✅ Market created! On-chain pool ID: ${data.blockchainMarketId}`);
    },
    onError: (error: any) => {
      alert(`❌ Error: ${error.response?.data?.error || error.message}`);
    },
  });

  // Settle market mutation
  const settleMarket = useMutation({
    mutationFn: async ({ marketId, closingPrice }: { marketId: string; closingPrice: number }) => {
      const response = await axios.post(`${API_BASE}/markets/${marketId}/settle`, { closingPrice });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-markets'] });
      setSettleData({ marketId: '', closingPrice: 17500 });
      alert('✅ Market settled successfully!');
    },
    onError: (error: any) => {
      alert(`❌ Error: ${error.response?.data?.error || error.message}`);
    },
  });

  // Handler functions
  const handleNumberChange = (field: keyof typeof formData, value: string) => {
    const numValue = value === '' ? 0 : parseInt(value);
    setFormData({ ...formData, [field]: isNaN(numValue) ? 0 : numValue });
  };

  const handleSettleNumberChange = (value: string) => {
    const numValue = value === '' ? 0 : parseInt(value);
    setSettleData({ ...settleData, closingPrice: isNaN(numValue) ? 0 : numValue });
  };

  const handleCreateMarket = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.stockSymbol || !formData.openingPrice) {
      alert('Please fill in all required fields');
      return;
    }
    createMarket.mutate(formData);
  };

  const handleSettleMarket = (e: React.FormEvent) => {
    e.preventDefault();
    if (!settleData.marketId || !settleData.closingPrice) {
      alert('Please fill in all fields');
      return;
    }
    settleMarket.mutate(settleData);
  };
  
  // Show loading while wallet is connecting
  if (status === 'connecting' || status === 'reconnecting') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
          <p>Connecting wallet...</p>
        </div>
      </div>
    );
  }

  // If not admin, show access denied
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
        {/* Navigation Bar */}
        <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="container mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <img src="/Copilot_20251128_175824-removebg-preview.png" alt="Sting Markets" className="h-10" />
                <span className="text-xl font-bold italic tracking-tight">Sting Markets</span>
              </div>
              <nav className="flex gap-4">
                <Link to="/">
                  <Button variant="ghost" size="sm">Markets</Button>
                </Link>
                <Link to="/my-bets">
                  <Button variant="ghost" size="sm">My Bets</Button>
                </Link>
              </nav>
            </div>
            <WalletConnect />
          </div>
        </div>
        <div className="container mx-auto px-4 py-16">
          <Card className="max-w-md mx-auto p-8 text-center">
            <ShieldX className="w-16 h-16 mx-auto mb-4 text-destructive" />
            <CardTitle className="mb-2">Access Denied</CardTitle>
            <CardDescription className="mb-6">
              {!isConnected 
                ? 'Please connect your wallet to access the admin panel.'
                : 'Your wallet is not authorized to access this page.'}
            </CardDescription>
            {!isConnected && <WalletConnect />}
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      {/* Navigation Bar */}
      <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <img src="/Copilot_20251128_175824-removebg-preview.png" alt="Sting Markets" className="h-10" />
              <span className="text-xl font-bold italic tracking-tight">Sting Markets</span>
            </div>
            <nav className="flex gap-4">
              <Link to="/">
                <Button variant="ghost" size="sm">Markets</Button>
              </Link>
              <Link to="/my-bets">
                <Button variant="ghost" size="sm">My Bets</Button>
              </Link>
              <Link to="/admin">
                <Button variant="ghost" size="sm">Admin</Button>
              </Link>
            </nav>
          </div>
          <WalletConnect />
        </div>
      </div>
      <div className="p-8">
        <div className="container mx-auto max-w-7xl">
          <div className="mb-8">
            <h1 className="text-4xl font-bold mb-2">Admin Dashboard</h1>
            <p className="text-muted-foreground">Create and manage prediction markets</p>
          </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Create Market Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plus className="w-5 h-5" />
                Create New Market
              </CardTitle>
              <CardDescription>
                Creates a backend market + on-chain liquidity pool
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreateMarket} className="space-y-4">
                <div>
                  <Label htmlFor="stockSymbol">Crypto Symbol *</Label>
                  <Input
                    id="stockSymbol"
                    value={formData.stockSymbol}
                    onChange={(e) => setFormData({ ...formData, stockSymbol: e.target.value.toUpperCase() })}
                    placeholder="e.g., BTC, ETH, SOL"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Optional description of the market"
                    rows={2}
                  />
                </div>

                <div>
                  <Label htmlFor="openingPrice">Opening Price (cents) *</Label>
                  <Input
                    id="openingPrice"
                    type="number"
                    min="1"
                    value={formData.openingPrice}
                    onChange={(e) => handleNumberChange('openingPrice', e.target.value)}
                    placeholder="17500 = $175.00"
                    required
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    In cents: ${(formData.openingPrice / 100).toFixed(2)}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="lockMinutes">Lock After (minutes)</Label>
                    <Input
                      id="lockMinutes"
                      type="number"
                      min="1"
                      value={formData.lockMinutes}
                      onChange={(e) => handleNumberChange('lockMinutes', e.target.value)}
                    />
                  </div>

                  <div>
                    <Label htmlFor="settleMinutes">Settle After (minutes)</Label>
                    <Input
                      id="settleMinutes"
                      type="number"
                      min="1"
                      value={formData.settleMinutes}
                      onChange={(e) => handleNumberChange('settleMinutes', e.target.value)}
                    />
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">
                  ⏱️ Lock in {formData.lockMinutes} min, Settle in {formData.settleMinutes} min
                </p>

                <Button 
                  type="submit" 
                  className="w-full" 
                  disabled={createMarket.isPending}
                >
                  {createMarket.isPending ? 'Creating...' : 'Create Market + On-Chain Pool'}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Settle Market Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="w-5 h-5" />
                Settle Market
              </CardTitle>
              <CardDescription>
                Resolve a market with final interest score
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSettleMarket} className="space-y-4">
                <div>
                  <Label htmlFor="marketId">Market ID *</Label>
                  <Input
                    id="marketId"
                    value={settleData.marketId}
                    onChange={(e) => setSettleData({ ...settleData, marketId: e.target.value })}
                    placeholder="market-1234567890"
                    required
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Copy from the markets list below
                  </p>
                </div>

                <div>
                  <Label htmlFor="closingPrice">Closing Price (cents) *</Label>
                  <Input
                    id="closingPrice"
                    type="number"
                    min="1"
                    value={settleData.closingPrice}
                    onChange={(e) => handleSettleNumberChange(e.target.value)}
                    placeholder="17800 = $178.00"
                    required
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    In cents: ${(settleData.closingPrice / 100).toFixed(2)}. If closing ≥ opening: UP wins. If closing &lt; opening: DOWN wins.
                  </p>
                </div>

                <Button 
                  type="submit" 
                  className="w-full" 
                  disabled={settleMarket.isPending}
                >
                  {settleMarket.isPending ? 'Settling...' : 'Settle Market'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Markets List */}
        <Card>
          <CardHeader>
            <CardTitle>All Markets</CardTitle>
            <CardDescription>
              {markets.length} total markets
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-muted-foreground">Loading markets...</p>
            ) : markets.length === 0 ? (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  No markets yet. Create your first market above!
                </AlertDescription>
              </Alert>
            ) : (
              <div className="space-y-3">
                {markets.map((market) => (
                  <div
                    key={market.id}
                    className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold">{market.stockSymbol} {market.stockName && `- ${market.stockName}`}</h3>
                          <span className={`text-xs px-2 py-1 rounded ${
                            market.status === 'ACTIVE' ? 'bg-green-500/20 text-green-500' :
                            market.status === 'LOCKED' ? 'bg-yellow-500/20 text-yellow-500' :
                            market.status === 'SETTLED' ? 'bg-blue-500/20 text-blue-500' :
                            'bg-gray-500/20 text-gray-500'
                          }`}>
                            {market.status}
                          </span>
                          {market.isAfterHours && (
                            <span className="text-xs px-2 py-1 rounded bg-blue-500/20 text-blue-500">
                              After Hours
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mb-2">
                          ID: <code className="text-xs bg-muted px-1 py-0.5 rounded">{market.id}</code>
                        </p>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                          <div>
                            <span className="text-muted-foreground">Opening:</span> ${(market.openingPrice / 100).toFixed(2)}
                          </div>
                          {market.currentPrice && (
                            <div>
                              <span className="text-muted-foreground">Current:</span> ${(market.currentPrice / 100).toFixed(2)}
                            </div>
                          )}
                          {market.closingPrice && (
                            <div>
                              <span className="text-muted-foreground">Closing:</span> ${(market.closingPrice / 100).toFixed(2)}
                            </div>
                          )}
                          <div>
                            <span className="text-muted-foreground">Pool ID:</span> {market.blockchainMarketId ?? 'N/A'}
                          </div>
                          <div>
                            <span className="text-muted-foreground">Total Pool:</span> {(market.upPool + market.downPool).toFixed(4)} {TOKEN_SYMBOL}
                          </div>
                          <div>
                            <span className="text-muted-foreground">Bets:</span> {market.totalBets}
                          </div>
                        </div>
                      </div>
                      {market.blockchainMarketId && (
                        <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                      )}
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
