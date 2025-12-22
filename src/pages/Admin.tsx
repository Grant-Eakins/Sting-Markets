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
import { FarcasterConnect } from '@/components/FarcasterConnect';
import { useFarcasterAuth } from '@/hooks/useFarcasterAuth';
import { useAccount } from 'wagmi';
import { TOKEN_SYMBOL } from '@/config/contract';

const API_BASE = import.meta.env.PROD ? '/api' : 'http://localhost:3001/api';

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
  const { isInFarcasterClient } = useFarcasterAuth();
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

  // Contract address market creation state
  const [contractData, setContractData] = useState({
    contractAddress: '',
    lockMinutes: 720,  // 12 hours default
    settleMinutes: 720.05,
  });
  const [tokenPreview, setTokenPreview] = useState<{
    symbol: string;
    name: string;
    price: number;
    liquidity: number;
    chainId: string;
  } | null>(null);
  const [tokenLoading, setTokenLoading] = useState(false);

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

  // Create market by contract address mutation
  const createByContract = useMutation({
    mutationFn: async (data: typeof contractData) => {
      const response = await axios.post(`${API_BASE}/markets/create-by-contract`, data);
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin-markets'] });
      setContractData({
        contractAddress: '',
        lockMinutes: 720,
        settleMinutes: 720.05,
      });
      setTokenPreview(null);
      alert(`✅ Market created for ${data.tokenInfo.symbol}! On-chain pool ID: ${data.blockchainMarketId}`);
    },
    onError: (error: any) => {
      alert(`❌ Error: ${error.response?.data?.error || error.message}`);
    },
  });

  // Lookup token by contract address
  const handleContractLookup = async () => {
    if (!contractData.contractAddress || !/^0x[a-fA-F0-9]{40}$/.test(contractData.contractAddress)) {
      alert('Please enter a valid contract address (0x...)');
      return;
    }
    
    setTokenLoading(true);
    setTokenPreview(null);
    
    try {
      const response = await axios.get(`${API_BASE}/markets/token/${contractData.contractAddress}`);
      if (response.data.success && response.data.token) {
        setTokenPreview({
          symbol: response.data.token.symbol,
          name: response.data.token.name,
          price: response.data.token.price,
          liquidity: response.data.token.liquidity,
          chainId: response.data.token.chainId,
        });
      }
    } catch (error: any) {
      alert(`❌ Token not found: ${error.response?.data?.error || error.message}`);
    } finally {
      setTokenLoading(false);
    }
  };

  const handleContractCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenPreview) {
      alert('Please look up the token first');
      return;
    }
    createByContract.mutate(contractData);
  };

  // Handler functions
  const handleNumberChange = (field: keyof typeof formData, value: string) => {
    // Use parseFloat for lockMinutes/settleMinutes to allow decimal values (e.g., 1.1 = 1 min 6 sec)
    const isMinutesField = field === 'lockMinutes' || field === 'settleMinutes';
    const numValue = value === '' ? 0 : (isMinutesField ? parseFloat(value) : parseInt(value));
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
            <div className="flex items-center gap-2">
              <FarcasterConnect />
              {!isInFarcasterClient && <WalletConnect />}
            </div>
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
            {!isConnected && !isInFarcasterClient && <WalletConnect />}
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
          <div className="flex items-center gap-2">
            <FarcasterConnect />
            {!isInFarcasterClient && <WalletConnect />}
          </div>
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
                      min="0.1"
                      step="0.1"
                      value={formData.lockMinutes}
                      onChange={(e) => handleNumberChange('lockMinutes', e.target.value)}
                    />
                  </div>

                  <div>
                    <Label htmlFor="settleMinutes">Settle After (minutes)</Label>
                    <Input
                      id="settleMinutes"
                      type="number"
                      min="0.1"
                      step="0.1"
                      value={formData.settleMinutes}
                      onChange={(e) => handleNumberChange('settleMinutes', e.target.value)}
                    />
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">
                  ⏱️ Lock in {formData.lockMinutes} min, Settle in {formData.settleMinutes} min (settle must be after lock)
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

          {/* Create Market by Contract Address Card */}
          <Card className="border-purple-500/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                🪙 Create Meme Coin Market
              </CardTitle>
              <CardDescription>
                Paste a Base token contract address to create a market
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleContractCreate} className="space-y-4">
                <div>
                  <Label htmlFor="contractAddress">Contract Address *</Label>
                  <div className="flex gap-2">
                    <Input
                      id="contractAddress"
                      value={contractData.contractAddress}
                      onChange={(e) => {
                        setContractData({ ...contractData, contractAddress: e.target.value });
                        setTokenPreview(null);
                      }}
                      placeholder="0x..."
                      className="font-mono"
                      required
                    />
                    <Button 
                      type="button" 
                      variant="secondary"
                      onClick={handleContractLookup}
                      disabled={tokenLoading}
                    >
                      {tokenLoading ? '...' : 'Lookup'}
                    </Button>
                  </div>
                </div>

                {/* Token Preview */}
                {tokenPreview && (
                  <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold">{tokenPreview.symbol}</span>
                      <span className="text-muted-foreground">{tokenPreview.name}</span>
                      {tokenPreview.chainId === 'base' && (
                        <span className="text-xs bg-blue-500/20 text-blue-500 px-2 py-0.5 rounded">Base</span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-muted-foreground">Price:</span>{' '}
                        ${tokenPreview.price < 0.01 
                          ? tokenPreview.price.toFixed(8) 
                          : tokenPreview.price.toFixed(4)}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Liquidity:</span>{' '}
                        ${tokenPreview.liquidity.toLocaleString()}
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="contractLockMinutes">Lock After (minutes)</Label>
                    <Input
                      id="contractLockMinutes"
                      type="number"
                      min="1"
                      value={contractData.lockMinutes}
                      onChange={(e) => setContractData({ 
                        ...contractData, 
                        lockMinutes: parseFloat(e.target.value) || 720 
                      })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="contractSettleMinutes">Settle After (minutes)</Label>
                    <Input
                      id="contractSettleMinutes"
                      type="number"
                      min="1"
                      value={contractData.settleMinutes}
                      onChange={(e) => setContractData({ 
                        ...contractData, 
                        settleMinutes: parseFloat(e.target.value) || 720.05 
                      })}
                    />
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">
                  ⏱️ Default: 12 hour session. Lock in {Math.floor(contractData.lockMinutes / 60)}h {Math.round(contractData.lockMinutes % 60)}m
                </p>

                <Button 
                  type="submit" 
                  className="w-full bg-purple-600 hover:bg-purple-700" 
                  disabled={!tokenPreview || createByContract.isPending}
                >
                  {createByContract.isPending 
                    ? 'Creating...' 
                    : tokenPreview 
                      ? `Create ${tokenPreview.symbol} Market` 
                      : 'Look up token first'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
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
