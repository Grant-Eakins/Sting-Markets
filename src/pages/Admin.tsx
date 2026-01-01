import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { CheckCircle, AlertCircle, Plus, Lock, ShieldX, Trash2, RefreshCw, TrendingUp, Search, Filter, DollarSign } from 'lucide-react';
import { WalletConnect } from '@/components/WalletConnect';
import { FarcasterConnect } from '@/components/FarcasterConnect';
import { useFarcasterAuth } from '@/hooks/useFarcasterAuth';
import { useAccount } from 'wagmi';
import { TOKEN_SYMBOL, TOKEN_DECIMALS } from '@/config/contract';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useWithdrawFees, useProtocolFees, useMaxBetSize, useSetMaxBetSize, useBurnConfig, useConfigureBurn } from '@/hooks/useContract';
import { formatUnits, parseUnits } from 'viem';

const API_BASE = import.meta.env.PROD ? '/api' : 'http://localhost:3001/api';

// Authorized admin wallet addresses (lowercase for comparison)
const ADMIN_WALLETS = [
  '0x6b1b7e7b207ec756b8d9edc59db4b32184160b22',
  '0xb0687ef6ea5906089ec3586f9997764650bf1934',
];

enum MarketStatus {
  ACTIVE = 'ACTIVE',
  LOCKED = 'LOCKED',
  SETTLED = 'SETTLED',
}

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
  upBettors?: number;
  downBettors?: number;
  winningPosition?: string;
  isDualCoin?: boolean;
  coinASymbol?: string;
  coinBSymbol?: string;
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
    autoRecreate: true,
  });
  const [tokenPreview, setTokenPreview] = useState<{
    symbol: string;
    name: string;
    price: number;
    liquidity: number;
    chainId: string;
  } | null>(null);
  const [tokenLoading, setTokenLoading] = useState(false);

  // Dual-coin market creation state
  const [dualCoinData, setDualCoinData] = useState({
    coinAAddress: '',
    coinBAddress: '',
    lockMinutes: 720,
    settleMinutes: 720.05,
    createTiming: 'scheduled' as 'now' | 'scheduled', // 'now' = immediate, 'scheduled' = next cycle
  });
  const [dualCoinPreview, setDualCoinPreview] = useState<{
    coinA: { symbol: string; name: string; price: number; liquidity: number } | null;
    coinB: { symbol: string; name: string; price: number; liquidity: number } | null;
  }>({ coinA: null, coinB: null });
  const [dualCoinLoading, setDualCoinLoading] = useState({ coinA: false, coinB: false });
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Contract configuration state
  const [newMaxBetInput, setNewMaxBetInput] = useState('');
  const [burnConfigInput, setBurnConfigInput] = useState({
    utilityToken: '',
    router: '',
    enabled: false,
  });

  // Protocol fees hooks
  const { feesCollected, isLoading: feesLoading, refetch: refetchFees } = useProtocolFees();
  const { withdrawFees, isPending: isWithdrawing, isConfirming, isConfirmed, error: withdrawError } = useWithdrawFees();

  // Max bet size hooks
  const { maxBetSize, isLoading: maxBetLoading, refetch: refetchMaxBet } = useMaxBetSize();
  const { setMaxBetSize, isPending: isSettingMaxBet, isConfirming: isConfirmingMaxBet, isConfirmed: isMaxBetConfirmed, error: maxBetError, reset: resetMaxBet } = useSetMaxBetSize();

  // Burn config hooks
  const { burnEnabled, totalBurned, utilityToken, uniswapRouter, isLoading: burnConfigLoading, refetch: refetchBurnConfig } = useBurnConfig();
  const { configureBurn, isPending: isConfiguringBurn, isConfirming: isConfirmingBurn, isConfirmed: isBurnConfigured, error: burnError, reset: resetBurn } = useConfigureBurn();

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

  // Delete market mutation
  const deleteMarket = useMutation({
    mutationFn: async (marketId: string) => {
      const response = await axios.delete(`${API_BASE}/markets/${marketId}`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-markets'] });
    },
    onError: (error: any) => {
      alert(`❌ Error deleting: ${error.response?.data?.error || error.message}`);
    },
  });

  // Delete settled markets mutation
  const deleteSettled = useMutation({
    mutationFn: async () => {
      const response = await axios.delete(`${API_BASE}/markets/settled`);
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin-markets'] });
      alert(`✅ Deleted ${data.count} settled markets`);
    },
    onError: (error: any) => {
      alert(`❌ Error: ${error.response?.data?.error || error.message}`);
    },
  });

  // Refresh markets mutation
  const refreshMarkets = useMutation({
    mutationFn: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin-markets'] });
      return { success: true };
    },
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

  // Manual settle mutation for dual coin markets (uses auto-settlement logic)
  const manualSettleDualCoin = useMutation({
    mutationFn: async (marketId: string) => {
      const response = await axios.post(`${API_BASE}/markets/${marketId}/settle-dual-coin`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-markets'] });
      alert('✅ Dual coin market settled successfully!');
    },
    onError: (error: any) => {
      alert(`❌ Error settling dual coin market: ${error.response?.data?.error || error.message}`);
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
        autoRecreate: true,
      });
      setTokenPreview(null);
      alert(`✅ Market created for ${data.tokenInfo.symbol}! On-chain pool ID: ${data.blockchainMarketId}`);
    },
    onError: (error: any) => {
      alert(`❌ Error: ${error.response?.data?.error || error.message}`);
    },
  });

  // Create dual-coin market mutation
  const createDualCoin = useMutation({
    mutationFn: async (data: typeof dualCoinData) => {
      const payload = {
        contractAddressA: data.coinAAddress,
        contractAddressB: data.coinBAddress,
        lockMinutes: data.lockMinutes,
        settleMinutes: data.settleMinutes,
        createTiming: data.createTiming,
      };
      const response = await axios.post(`${API_BASE}/markets/create-dual-coin`, payload);
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin-markets'] });
      setDualCoinData({
        coinAAddress: '',
        coinBAddress: '',
        lockMinutes: 720,
        settleMinutes: 720.05,
        createTiming: 'scheduled',
      });
      setDualCoinPreview({ coinA: null, coinB: null });
      const coinASymbol = data.tokenA?.symbol || data.market?.coinASymbol || 'Coin A';
      const coinBSymbol = data.tokenB?.symbol || data.market?.coinBSymbol || 'Coin B';
      alert(`✅ Dual-coin market created: ${coinASymbol} vs ${coinBSymbol}! ID: ${data.blockchainMarketId}`);
    },
    onError: (error: any) => {
      alert(`❌ Error: ${error.response?.data?.error || error.message}`);
    },
  });

  // Lookup token by contract address
  const handleContractLookup = async () => {
    // Validate address format - support both Ethereum (0x...) and Solana (base58)
    const isEthAddress = /^0x[a-fA-F0-9]{40}$/.test(contractData.contractAddress);
    const isSolanaAddress = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(contractData.contractAddress);
    
    if (!contractData.contractAddress || (!isEthAddress && !isSolanaAddress)) {
      alert('Please enter a valid contract address (0x... for Base or base58 for Solana)');
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

  // Dual-coin handlers
  const handleDualCoinLookup = async (coin: 'A' | 'B') => {
    const address = coin === 'A' ? dualCoinData.coinAAddress : dualCoinData.coinBAddress;
    
    // Validate address format - support both Ethereum (0x...) and Solana (base58)
    const isEthAddress = /^0x[a-fA-F0-9]{40}$/.test(address);
    const isSolanaAddress = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
    
    if (!address || (!isEthAddress && !isSolanaAddress)) {
      alert('Please enter a valid contract address (0x... for Base or base58 for Solana)');
      return;
    }
    
    setDualCoinLoading({ ...dualCoinLoading, [`coin${coin}`]: true });
    
    try {
      const response = await axios.get(`${API_BASE}/markets/token/${address}`);
      if (response.data.success && response.data.token) {
        const tokenData = {
          symbol: response.data.token.symbol,
          name: response.data.token.name,
          price: response.data.token.price,
          liquidity: response.data.token.liquidity,
        };
        setDualCoinPreview({ 
          ...dualCoinPreview, 
          [`coin${coin}`]: tokenData 
        });
      }
    } catch (error: any) {
      alert(`❌ Token not found: ${error.response?.data?.error || error.message}`);
    } finally {
      setDualCoinLoading({ ...dualCoinLoading, [`coin${coin}`]: false });
    }
  };

  const handleDualCoinCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!dualCoinPreview.coinA || !dualCoinPreview.coinB) {
      alert('Please look up both tokens first');
      return;
    }
    createDualCoin.mutate(dualCoinData);
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

  const handleDeleteMarket = (marketId: string, symbol: string) => {
    if (confirm(`Are you sure you want to delete the market for ${symbol}? This action cannot be undone.`)) {
      deleteMarket.mutate(marketId);
    }
  };

  const handleDeleteSettled = () => {
    if (confirm('Are you sure you want to delete ALL settled markets? This action cannot be undone.')) {
      deleteSettled.mutate();
    }
  };

  // Filter markets based on search and status
  const filteredMarkets = markets.filter(market => {
    const matchesSearch = searchQuery === '' || 
      market.stockSymbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
      market.stockName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      market.id.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || market.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  // Calculate statistics
  const stats = {
    total: markets.length,
    active: markets.filter(m => m.status === MarketStatus.ACTIVE).length,
    locked: markets.filter(m => m.status === MarketStatus.LOCKED).length,
    settled: markets.filter(m => m.status === MarketStatus.SETTLED).length,
    totalVolume: markets.reduce((sum, m) => sum + m.upPool + m.downPool, 0),
    totalBets: markets.reduce((sum, m) => sum + m.totalBets, 0),
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
                <Button variant="ghost" size="sm">Coin Battles</Button>
              </Link>
              <Link to="/single-markets">
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
      <div className="p-4 md:p-6 lg:p-8">
        <div className="container mx-auto max-w-7xl">
          <div className="mb-8">
            <h1 className="text-4xl font-bold mb-2">Admin Dashboard</h1>
            <p className="text-muted-foreground">Create and manage prediction markets</p>
          </div>

          {/* Protocol Fees Card */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="w-5 h-5" />
                Protocol Fees
              </CardTitle>
              <CardDescription>
                Collect accumulated protocol fees (2% of all bets)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                  <div>
                    <p className="text-sm text-muted-foreground">Fees Available</p>
                    <p className="text-2xl font-bold">
                      {feesLoading ? '...' : feesCollected ? `${formatUnits(feesCollected, TOKEN_DECIMALS)} ${TOKEN_SYMBOL}` : '0 ' + TOKEN_SYMBOL}
                    </p>
                  </div>
                  <Button
                    onClick={() => withdrawFees()}
                    disabled={isWithdrawing || isConfirming || !feesCollected || feesCollected === 0n}
                    size="lg"
                  >
                    {isWithdrawing && 'Initiating...'}
                    {isConfirming && 'Confirming...'}
                    {!isWithdrawing && !isConfirming && 'Collect Fees'}
                  </Button>
                </div>
                
                {isConfirmed && (
                  <Alert>
                    <CheckCircle className="h-4 w-4" />
                    <AlertDescription>
                      ✅ Fees successfully collected!
                    </AlertDescription>
                  </Alert>
                )}
                
                {withdrawError && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      Error: {withdrawError.message}
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Contract Configuration */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Max Bet Size Configuration */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="w-5 h-5" />
                  Max Bet Size
                </CardTitle>
                <CardDescription>
                  Configure the maximum bet size allowed per transaction
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                    <div>
                      <p className="text-sm text-muted-foreground">Current Max Bet</p>
                      <p className="text-2xl font-bold">
                        {maxBetLoading ? '...' : maxBetSize ? `$${(Number(maxBetSize) / 1e6).toFixed(2)} USDC` : 'Not set'}
                      </p>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="newMaxBet">New Max Bet (USDC)</Label>
                    <div className="flex gap-2">
                      <Input
                        id="newMaxBet"
                        type="number"
                        min="1"
                        step="1"
                        value={newMaxBetInput}
                        onChange={(e) => setNewMaxBetInput(e.target.value)}
                        placeholder="e.g., 100 for $100"
                      />
                      <Button
                        onClick={async () => {
                          if (!newMaxBetInput) return;
                          try {
                            await setMaxBetSize(parseUnits(newMaxBetInput, 6));
                            setNewMaxBetInput('');
                          } catch (err) {
                            console.error('Failed to set max bet:', err);
                          }
                        }}
                        disabled={isSettingMaxBet || isConfirmingMaxBet || !newMaxBetInput}
                      >
                        {isSettingMaxBet && 'Sending...'}
                        {isConfirmingMaxBet && 'Confirming...'}
                        {!isSettingMaxBet && !isConfirmingMaxBet && 'Update'}
                      </Button>
                    </div>
                  </div>
                  
                  {isMaxBetConfirmed && (
                    <Alert>
                      <CheckCircle className="h-4 w-4" />
                      <AlertDescription>
                        ✅ Max bet size updated! Refresh to see new value.
                      </AlertDescription>
                    </Alert>
                  )}
                  
                  {maxBetError && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        Error: {maxBetError.message}
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Burn Mechanism Configuration */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  🔥 Burn Mechanism
                </CardTitle>
                <CardDescription>
                  Configure auto-swap and burn of utility tokens (1% of bets)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 p-4 bg-muted rounded-lg">
                    <div>
                      <p className="text-sm text-muted-foreground">Status</p>
                      <p className={`text-lg font-bold ${burnEnabled ? 'text-green-500' : 'text-red-500'}`}>
                        {burnConfigLoading ? '...' : burnEnabled ? '✅ Enabled' : '❌ Disabled'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Total Burned</p>
                      <p className="text-lg font-bold">
                        {burnConfigLoading ? '...' : totalBurned ? `${formatUnits(totalBurned, 18)}` : '0'}
                      </p>
                    </div>
                  </div>
                  
                  <div className="space-y-3">
                    <div>
                      <Label htmlFor="utilityToken">Utility Token Address</Label>
                      <Input
                        id="utilityToken"
                        value={burnConfigInput.utilityToken || (utilityToken && utilityToken !== '0x0000000000000000000000000000000000000000' ? utilityToken : '')}
                        onChange={(e) => setBurnConfigInput({ ...burnConfigInput, utilityToken: e.target.value })}
                        placeholder="0x..."
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="router">Uniswap Router Address</Label>
                      <Input
                        id="router"
                        value={burnConfigInput.router || (uniswapRouter && uniswapRouter !== '0x0000000000000000000000000000000000000000' ? uniswapRouter : '')}
                        onChange={(e) => setBurnConfigInput({ ...burnConfigInput, router: e.target.value })}
                        placeholder="0x..."
                      />
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="burnEnabled"
                        checked={burnConfigInput.enabled}
                        onCheckedChange={(checked) => setBurnConfigInput({ ...burnConfigInput, enabled: checked as boolean })}
                      />
                      <Label htmlFor="burnEnabled">Enable Burn Mechanism</Label>
                    </div>
                    
                    <Button
                      onClick={async () => {
                        const tokenAddr = burnConfigInput.utilityToken || utilityToken || '';
                        const routerAddr = burnConfigInput.router || uniswapRouter || '';
                        
                        if (burnConfigInput.enabled && (!tokenAddr || !routerAddr)) {
                          alert('Please provide both token and router addresses to enable burn');
                          return;
                        }
                        
                        try {
                          await configureBurn(tokenAddr, routerAddr, burnConfigInput.enabled);
                        } catch (err) {
                          console.error('Failed to configure burn:', err);
                        }
                      }}
                      disabled={isConfiguringBurn || isConfirmingBurn}
                      className="w-full"
                    >
                      {isConfiguringBurn && 'Sending...'}
                      {isConfirmingBurn && 'Confirming...'}
                      {!isConfiguringBurn && !isConfirmingBurn && 'Update Burn Config'}
                    </Button>
                  </div>
                  
                  {isBurnConfigured && (
                    <Alert>
                      <CheckCircle className="h-4 w-4" />
                      <AlertDescription>
                        ✅ Burn configuration updated!
                      </AlertDescription>
                    </Alert>
                  )}
                  
                  {burnError && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        Error: {burnError.message}
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Statistics Dashboard */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 md:gap-4 mb-6 md:mb-8">
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-blue-500">{stats.total}</div>
                <p className="text-xs text-muted-foreground mt-1">Total Markets</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-green-500">{stats.active}</div>
                <p className="text-xs text-muted-foreground mt-1">Active</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-yellow-500">{stats.locked}</div>
                <p className="text-xs text-muted-foreground mt-1">Locked</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-blue-500">{stats.settled}</div>
                <p className="text-xs text-muted-foreground mt-1">Settled</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">{stats.totalVolume.toFixed(2)}</div>
                <p className="text-xs text-muted-foreground mt-1">Total Volume ({TOKEN_SYMBOL})</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">{stats.totalBets}</div>
                <p className="text-xs text-muted-foreground mt-1">Total Bets</p>
              </CardContent>
            </Card>
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
                Paste a Base or Solana token contract address to create a market
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
                      placeholder="0x... (Base) or base58 (Solana)"
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

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="contractAutoRecreate"
                    checked={contractData.autoRecreate}
                    onCheckedChange={(checked) => setContractData({ 
                      ...contractData, 
                      autoRecreate: checked === true 
                    })}
                  />
                  <Label htmlFor="contractAutoRecreate" className="text-sm cursor-pointer">
                    🔄 Auto-recreate market after settlement (loop forever)
                  </Label>
                </div>

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

          {/* Create Dual-Coin Market Card */}
          <Card className="border-green-500/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                ⚔️ Create Dual-Coin Battle
              </CardTitle>
              <CardDescription>
                Pick two coins - users bet which one gains more %
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleDualCoinCreate} className="space-y-4">
                {/* Coin A */}
                <div>
                  <Label htmlFor="coinAAddress">Coin A Contract Address *</Label>
                  <div className="flex gap-2">
                    <Input
                      id="coinAAddress"
                      value={dualCoinData.coinAAddress}
                      onChange={(e) => {
                        setDualCoinData({ ...dualCoinData, coinAAddress: e.target.value });
                        setDualCoinPreview({ ...dualCoinPreview, coinA: null });
                      }}
                      placeholder="0x..."
                      className="font-mono"
                      required
                    />
                    <Button 
                      type="button" 
                      variant="secondary"
                      onClick={() => handleDualCoinLookup('A')}
                      disabled={dualCoinLoading.coinA}
                    >
                      {dualCoinLoading.coinA ? '...' : 'Lookup'}
                    </Button>
                  </div>
                </div>

                {dualCoinPreview.coinA && (
                  <div className="bg-green-500/10 rounded-lg p-3 space-y-1">
                    <div className="font-bold text-green-500">
                      {dualCoinPreview.coinA.symbol} - {dualCoinPreview.coinA.name}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      ${dualCoinPreview.coinA.price < 0.01 
                        ? dualCoinPreview.coinA.price.toFixed(8) 
                        : dualCoinPreview.coinA.price.toFixed(4)}{' '}
                      | Liq: ${dualCoinPreview.coinA.liquidity.toLocaleString()}
                    </div>
                  </div>
                )}

                {/* Coin B */}
                <div>
                  <Label htmlFor="coinBAddress">Coin B Contract Address *</Label>
                  <div className="flex gap-2">
                    <Input
                      id="coinBAddress"
                      value={dualCoinData.coinBAddress}
                      onChange={(e) => {
                        setDualCoinData({ ...dualCoinData, coinBAddress: e.target.value });
                        setDualCoinPreview({ ...dualCoinPreview, coinB: null });
                      }}
                      placeholder="0x... (Base) or base58 (Solana)"
                      className="font-mono"
                      required
                    />
                    <Button 
                      type="button" 
                      variant="secondary"
                      onClick={() => handleDualCoinLookup('B')}
                      disabled={dualCoinLoading.coinB}
                    >
                      {dualCoinLoading.coinB ? '...' : 'Lookup'}
                    </Button>
                  </div>
                </div>

                {dualCoinPreview.coinB && (
                  <div className="bg-red-500/10 rounded-lg p-3 space-y-1">
                    <div className="font-bold text-red-500">
                      {dualCoinPreview.coinB.symbol} - {dualCoinPreview.coinB.name}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      ${dualCoinPreview.coinB.price < 0.01 
                        ? dualCoinPreview.coinB.price.toFixed(8) 
                        : dualCoinPreview.coinB.price.toFixed(4)}{' '}
                      | Liq: ${dualCoinPreview.coinB.liquidity.toLocaleString()}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="dualCoinLockMinutes">Lock After (minutes)</Label>
                    <Input
                      id="dualCoinLockMinutes"
                      type="number"
                      min="1"
                      value={dualCoinData.lockMinutes}
                      onChange={(e) => setDualCoinData({ 
                        ...dualCoinData, 
                        lockMinutes: parseFloat(e.target.value) || 720 
                      })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="dualCoinSettleMinutes">Settle After (minutes)</Label>
                    <Input
                      id="dualCoinSettleMinutes"
                      type="number"
                      min="1"
                      value={dualCoinData.settleMinutes}
                      onChange={(e) => setDualCoinData({ 
                        ...dualCoinData, 
                        settleMinutes: parseFloat(e.target.value) || 720.05 
                      })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Market Timing</Label>
                  <div className="flex flex-col space-y-2">
                    <div className="flex items-center space-x-2">
                      <input
                        type="radio"
                        id="createNow"
                        name="createTiming"
                        value="now"
                        checked={dualCoinData.createTiming === 'now'}
                        onChange={(e) => setDualCoinData({ 
                          ...dualCoinData, 
                          createTiming: 'now',
                          lockMinutes: 720,
                          settleMinutes: 720.05
                        })}
                        className="w-4 h-4"
                      />
                      <Label htmlFor="createNow" className="text-sm cursor-pointer font-normal">
                        ⚡ Create Now (Active immediately, expires at next scheduled time)
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <input
                        type="radio"
                        id="createScheduled"
                        name="createTiming"
                        value="scheduled"
                        checked={dualCoinData.createTiming === 'scheduled'}
                        onChange={(e) => setDualCoinData({ 
                          ...dualCoinData, 
                          createTiming: 'scheduled',
                          lockMinutes: 720,
                          settleMinutes: 720.05
                        })}
                        className="w-4 h-4"
                      />
                      <Label htmlFor="createScheduled" className="text-sm cursor-pointer font-normal">
                        📅 Create at Scheduled Time (Starts at next noon/midnight UTC)
                      </Label>
                    </div>
                  </div>
                </div>

                <Button 
                  type="submit" 
                  className="w-full bg-green-600 hover:bg-green-700" 
                  disabled={!dualCoinPreview.coinA || !dualCoinPreview.coinB || createDualCoin.isPending}
                >
                  {createDualCoin.isPending 
                    ? 'Creating Battle...' 
                    : (dualCoinPreview.coinA && dualCoinPreview.coinB)
                      ? `⚔️ ${dualCoinPreview.coinA.symbol} vs ${dualCoinPreview.coinB.symbol}` 
                      : 'Look up both tokens first'}
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
                Resolve a market with final price
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="marketId">Market ID *</Label>
                  <Input
                    id="marketId"
                    value={settleData.marketId}
                    onChange={(e) => setSettleData({ ...settleData, marketId: e.target.value })}
                    placeholder="market-1234567890"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Copy from the markets list below
                  </p>
                </div>

                {(() => {
                  const selectedMarket = markets?.find((m: Market) => m.id === settleData.marketId);
                  const isDualCoin = selectedMarket?.isDualCoin;
                  
                  if (selectedMarket) {
                    if (isDualCoin) {
                      return (
                        <>
                          <Alert>
                            <AlertCircle className="h-4 w-4" />
                            <AlertDescription>
                              ⚔️ Dual Coin Battle: {selectedMarket.coinASymbol} vs {selectedMarket.coinBSymbol}<br/>
                              This market will automatically settle based on percentage changes.
                            </AlertDescription>
                          </Alert>
                          <Button 
                            type="button"
                            onClick={() => manualSettleDualCoin.mutate(settleData.marketId)}
                            className="w-full" 
                            disabled={manualSettleDualCoin.isPending}
                          >
                            {manualSettleDualCoin.isPending ? 'Settling...' : 'Settle Dual Coin Market Now'}
                          </Button>
                        </>
                      );
                    } else {
                      return (
                        <form onSubmit={handleSettleMarket} className="space-y-4">
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
                      );
                    }
                  } else {
                    return (
                      <p className="text-sm text-muted-foreground">
                        Enter a market ID to settle
                      </p>
                    );
                  }
                })()}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Quick Actions
            </CardTitle>
            <CardDescription>
              Bulk operations and utilities
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              <Button
                variant="outline"
                onClick={() => refreshMarkets.mutate()}
                disabled={refreshMarkets.isPending}
                className="flex items-center gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${refreshMarkets.isPending ? 'animate-spin' : ''}`} />
                Refresh Markets
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeleteSettled}
                disabled={deleteSettled.isPending || stats.settled === 0}
                className="flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Delete All Settled ({stats.settled})
              </Button>
              <Button
                variant="outline"
                onClick={() => window.location.href = '/api/markets/admin/reset'}
                className="flex items-center gap-2 text-orange-600 border-orange-600 hover:bg-orange-600/10"
              >
                <RefreshCw className="w-4 h-4" />
                Reset All Markets
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Markets List */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>All Markets</CardTitle>
                <CardDescription>
                  {filteredMarkets.length} of {markets.length} markets {searchQuery || statusFilter !== 'all' ? '(filtered)' : ''}
                </CardDescription>
              </div>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 w-full sm:w-auto">
                <div className="relative flex-1 sm:flex-initial">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="Search markets..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 w-full sm:w-64"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full sm:w-32">
                    <Filter className="w-4 h-4 mr-2" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="ACTIVE">Active</SelectItem>
                    <SelectItem value="LOCKED">Locked</SelectItem>
                    <SelectItem value="SETTLED">Settled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
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
                {filteredMarkets.map((market) => (
                  <div
                    key={market.id}
                    className="border rounded-lg p-3 md:p-4 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex flex-col sm:flex-row items-start justify-between gap-3 sm:gap-4">
                      <div className="flex-1 w-full overflow-hidden">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <h3 className="font-semibold text-sm md:text-base">{market.stockSymbol} {market.stockName && `- ${market.stockName}`}</h3>
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
                          {market.blockchainMarketId !== undefined && (
                            <span className="text-xs px-2 py-1 rounded bg-green-500/20 text-green-500 flex items-center gap-1">
                              <CheckCircle className="w-3 h-3" />
                              On-Chain
                            </span>
                          )}
                          {market.status === 'SETTLED' && market.winningPosition && (
                            <span className={`text-xs px-2 py-1 rounded font-semibold flex items-center gap-1 ${
                              market.winningPosition === 'UP' 
                                ? 'bg-green-500/20 text-green-500' 
                                : 'bg-red-500/20 text-red-500'
                            }`}>
                              <TrendingUp className={`w-3 h-3 ${market.winningPosition === 'DOWN' ? 'rotate-180' : ''}`} />
                              {market.isDualCoin && market.coinASymbol && market.coinBSymbol
                                ? `Winner: ${market.winningPosition === 'UP' ? market.coinASymbol : market.coinBSymbol}`
                                : `Winner: ${market.winningPosition}`
                              }
                            </span>
                          )}
                        </div>
                        <p className="text-xs md:text-sm text-muted-foreground mb-2 truncate">
                          ID: <code className="text-xs bg-muted px-1 py-0.5 rounded font-mono break-all">{market.id}</code>
                        </p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 md:gap-3 text-xs md:text-sm">
                          <div>
                            <span className="text-muted-foreground text-xs">Opening:</span>
                            <div className="font-medium">${(market.openingPrice / 100).toFixed(2)}</div>
                          </div>
                          {market.currentPrice && (
                            <div>
                              <span className="text-muted-foreground text-xs">Current:</span>
                              <div className="font-medium">${(market.currentPrice / 100).toFixed(2)}</div>
                            </div>
                          )}
                          {market.closingPrice && (
                            <div>
                              <span className="text-muted-foreground text-xs">Closing:</span>
                              <div className="font-medium">${(market.closingPrice / 100).toFixed(2)}</div>
                            </div>
                          )}
                          <div>
                            <span className="text-muted-foreground text-xs">Pool ID:</span>
                            <div className="font-medium">{market.blockchainMarketId ?? 'N/A'}</div>
                          </div>
                          <div>
                            <span className="text-muted-foreground text-xs">Volume:</span>
                            <div className="font-medium truncate">{(market.upPool + market.downPool).toFixed(2)} {TOKEN_SYMBOL}</div>
                            {market.blockchainMarketId && (market.upPool + market.downPool) === 0 && (
                              <div className="text-[10px] text-yellow-500">Backend only - check chain</div>
                            )}
                          </div>
                          <div>
                            <span className="text-muted-foreground text-xs">Bets:</span>
                            <div className="font-medium">{market.totalBets}</div>
                            {market.blockchainMarketId && market.totalBets === 0 && (
                              <div className="text-[10px] text-yellow-500">Backend only</div>
                            )}
                          </div>
                          <div>
                            <span className="text-muted-foreground text-xs">UP Pool:</span>
                            <div className="font-medium text-green-500">{market.upPool.toFixed(2)}</div>
                          </div>
                          <div>
                            <span className="text-muted-foreground text-xs">DOWN Pool:</span>
                            <div className="font-medium text-red-500">{market.downPool.toFixed(2)}</div>
                          </div>
                          <div>
                            <span className="text-muted-foreground text-xs">UP Bettors:</span>
                            <div className="font-medium">{market.upBettors}</div>
                          </div>
                          <div>
                            <span className="text-muted-foreground text-xs">DOWN Bettors:</span>
                            <div className="font-medium">{market.downBettors}</div>
                          </div>
                        </div>
                      </div>
                      <div className="flex sm:flex-col items-center sm:items-end gap-2 flex-shrink-0 w-full sm:w-auto">
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => {
                            const symbol = market.isDualCoin 
                              ? `${market.coinASymbol} vs ${market.coinBSymbol}`
                              : market.stockSymbol;
                            handleDeleteMarket(market.id, symbol);
                          }}
                          disabled={deleteMarket.isPending}
                          className="flex items-center gap-1 w-full sm:w-auto"
                        >
                          <Trash2 className="w-4 h-4" />
                          <span className="sm:inline">{deleteMarket.isPending ? 'Deleting...' : 'Delete'}</span>
                        </Button>
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
