import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAccount } from 'wagmi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { WalletConnect } from '@/components/WalletConnect';
import { FarcasterConnect } from '@/components/FarcasterConnect';
import { useFarcasterAuth } from '@/hooks/useFarcasterAuth';
import { Menu, X, ChevronDown, ExternalLink, Copy, Check, Settings } from 'lucide-react';
import { SpinningCoin3D } from '@/components/SpinningCoin3D';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';

const API_BASE = import.meta.env.PROD ? '/api' : 'http://localhost:3001/api';

// Default token contract address (fallback if not set in database)
const DEFAULT_TOKEN_CONTRACT = '0x0000000000000000000000000000000000000000';
const TOKEN_SYMBOL = '$STNG';
const TOKEN_NAME = 'Sting Markets Token';

// Authorized admin wallet addresses (lowercase for comparison)
const ADMIN_WALLETS = [
  '0xb0687ef6ea5906089ec3586f9997764650bf1934',
  '0x6c0512fe7dea0c0d2681c05739171830cd9d9b18',
];

interface TokenData {
  price: string;
  marketCap: string;
  holders: string;
  supply: string;
}

export default function Token() {
  const { address, isConnected } = useAccount();
  const { isInFarcasterClient } = useFarcasterAuth();
  const { toast } = useToast();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [tokenContract, setTokenContract] = useState(DEFAULT_TOKEN_CONTRACT);
  const [tokenData, setTokenData] = useState<TokenData>({ price: '--', marketCap: '--', holders: '--', supply: '--' });
  const [adminTokenAddress, setAdminTokenAddress] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);

  const isAdmin = isConnected && address && ADMIN_WALLETS.includes(address.toLowerCase());

  // Fetch token contract address from server
  useEffect(() => {
    const fetchTokenConfig = async () => {
      try {
        const response = await fetch(`${API_BASE}/token/config`);
        if (response.ok) {
          const data = await response.json();
          if (data.contractAddress) {
            setTokenContract(data.contractAddress);
            setAdminTokenAddress(data.contractAddress);
          }
        }
      } catch (error) {
        console.error('Failed to fetch token config:', error);
      }
    };
    fetchTokenConfig();
  }, []);

  // Fetch token data from DexScreener when contract address is set
  useEffect(() => {
    const fetchTokenData = async () => {
      if (tokenContract === DEFAULT_TOKEN_CONTRACT) return;
      
      try {
        const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenContract}`);
        const data = await response.json();
        
        if (data.pairs && data.pairs.length > 0) {
          const bestPair = data.pairs.sort((a: any, b: any) => 
            (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0)
          )[0];
          
          setTokenData({
            price: bestPair.priceUsd ? `$${Number(bestPair.priceUsd).toFixed(6)}` : '--',
            marketCap: bestPair.fdv ? `$${(bestPair.fdv / 1000000).toFixed(2)}M` : '--',
            holders: '--', // DexScreener doesn't provide holder count
            supply: bestPair.fdv && bestPair.priceUsd ? 
              `${(bestPair.fdv / Number(bestPair.priceUsd) / 1000000).toFixed(1)}M` : '--',
          });
        }
      } catch (error) {
        console.error('Failed to fetch token data:', error);
      }
    };
    
    fetchTokenData();
    const interval = setInterval(fetchTokenData, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [tokenContract]);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(tokenContract);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleUpdateTokenAddress = async () => {
    if (!adminTokenAddress || !isAdmin) return;
    
    setIsUpdating(true);
    try {
      const response = await fetch(`${API_BASE}/token/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contractAddress: adminTokenAddress }),
      });
      
      if (response.ok) {
        setTokenContract(adminTokenAddress);
        toast({ title: '✅ Token address updated!', description: 'The token data will refresh shortly.' });
        setShowAdminPanel(false);
      } else {
        throw new Error('Failed to update');
      }
    } catch (error) {
      toast({ title: '❌ Update failed', description: 'Could not update token address', variant: 'destructive' });
    } finally {
      setIsUpdating(false);
    }
  };

  // DEX links for buying
  const buyLinks = {
    uniswap: `https://app.uniswap.org/swap?outputCurrency=${tokenContract}&chain=base`,
    baseSwap: `https://baseswap.fi/swap?outputCurrency=${tokenContract}`,
  };

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden">
      {/* Space Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-gray-900 via-purple-900/50 to-black">
        <div className="absolute inset-0" style={{
          backgroundImage: `radial-gradient(2px 2px at 20px 30px, white, transparent),
            radial-gradient(2px 2px at 40px 70px, rgba(255,255,255,0.8), transparent),
            radial-gradient(1px 1px at 90px 40px, white, transparent),
            radial-gradient(2px 2px at 160px 120px, rgba(255,255,255,0.9), transparent),
            radial-gradient(1px 1px at 230px 80px, white, transparent),
            radial-gradient(2px 2px at 300px 150px, rgba(255,255,255,0.7), transparent),
            radial-gradient(1px 1px at 350px 200px, white, transparent),
            radial-gradient(2px 2px at 420px 60px, rgba(255,255,255,0.8), transparent),
            radial-gradient(1px 1px at 480px 180px, white, transparent),
            radial-gradient(2px 2px at 550px 100px, rgba(255,255,255,0.9), transparent)`,
          backgroundSize: '600px 250px',
          animation: 'twinkle 4s ease-in-out infinite'
        }} />
        <div className="absolute inset-0" style={{
          backgroundImage: `radial-gradient(1px 1px at 100px 50px, rgba(255,255,255,0.6), transparent),
            radial-gradient(1px 1px at 200px 150px, rgba(255,255,255,0.5), transparent),
            radial-gradient(1px 1px at 300px 80px, rgba(255,255,255,0.4), transparent),
            radial-gradient(1px 1px at 400px 200px, rgba(255,255,255,0.6), transparent),
            radial-gradient(1px 1px at 500px 120px, rgba(255,255,255,0.5), transparent)`,
          backgroundSize: '550px 220px'
        }} />
      </div>

      {/* Navigation Bar */}
      <div className="border-b border-white/10 bg-black/50 backdrop-blur-md sticky top-0 z-50 relative">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4 lg:gap-6">
            <Link to="/" className="flex items-center gap-2 shrink-0">
              <img src="/Copilot_20251128_175824-removebg-preview.png" alt="Sting Markets" className="h-8 sm:h-10" />
              <span className="text-lg sm:text-xl font-bold italic tracking-tight hidden sm:inline text-white">Sting Markets</span>
            </Link>
            {/* Desktop nav */}
            <nav className="hidden md:flex gap-4">
              <Link to="/">
                <Button variant="ghost" size="sm" className="text-gray-300 hover:text-white hover:bg-white/10">Coin Battles</Button>
              </Link>
              <Link to="/my-bets">
                <Button variant="ghost" size="sm" className="text-gray-300 hover:text-white hover:bg-white/10">My Bets</Button>
              </Link>
              <Link to="/auction">
                <Button variant="ghost" size="sm" className="text-gray-300 hover:text-white hover:bg-white/10">Auction</Button>
              </Link>
              <Link to="/token">
                <Button variant="ghost" size="sm" className="text-yellow-400 hover:text-yellow-300 hover:bg-white/10">Token</Button>
              </Link>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-1 text-gray-300 hover:text-white hover:bg-white/10">
                    More
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <Link to="/terms">Terms of Service</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/privacy">Privacy Policy</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/risk-disclaimer">Risk Disclaimer</Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              {isAdmin && (
                <Link to="/admin-167">
                  <Button variant="ghost" size="sm" className="text-gray-300 hover:text-white hover:bg-white/10">Admin</Button>
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
              className="md:hidden text-white hover:bg-white/10"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>
        
        {/* Mobile nav menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-white/10 bg-black/80 backdrop-blur-md px-4 py-3 space-y-1">
            <Link to="/" onClick={() => setMobileMenuOpen(false)}>
              <Button variant="ghost" size="sm" className="w-full justify-start text-gray-300 hover:text-white hover:bg-white/10">Coin Battles</Button>
            </Link>
            <Link to="/my-bets" onClick={() => setMobileMenuOpen(false)}>
              <Button variant="ghost" size="sm" className="w-full justify-start text-gray-300 hover:text-white hover:bg-white/10">My Bets</Button>
            </Link>
            <Link to="/auction" onClick={() => setMobileMenuOpen(false)}>
              <Button variant="ghost" size="sm" className="w-full justify-start text-gray-300 hover:text-white hover:bg-white/10">Auction</Button>
            </Link>
            <Link to="/token" onClick={() => setMobileMenuOpen(false)}>
              <Button variant="ghost" size="sm" className="w-full justify-start text-yellow-400 hover:text-yellow-300 hover:bg-white/10">Token</Button>
            </Link>
            {isAdmin && (
              <Link to="/admin-167" onClick={() => setMobileMenuOpen(false)}>
                <Button variant="ghost" size="sm" className="w-full justify-start text-gray-300 hover:text-white hover:bg-white/10">Admin</Button>
              </Link>
            )}
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 container mx-auto px-4 py-8 mb-20 md:mb-0 relative z-10">
        {/* Token Stats - Top Left */}
        <div className="absolute top-4 left-4 z-20">
          <div className="bg-black/60 backdrop-blur-md rounded-xl p-4 border border-white/10">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-gray-400 text-xs">Price</div>
                <div className="text-white font-semibold">{tokenData.price}</div>
              </div>
              <div>
                <div className="text-gray-400 text-xs">Market Cap</div>
                <div className="text-white font-semibold">{tokenData.marketCap}</div>
              </div>
              <div>
                <div className="text-gray-400 text-xs">Holders</div>
                <div className="text-white font-semibold">{tokenData.holders}</div>
              </div>
              <div>
                <div className="text-gray-400 text-xs">Supply</div>
                <div className="text-white font-semibold">{tokenData.supply}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Purchase Token Button - Top Right */}
        <div className="absolute top-4 right-4 z-20">
          <div className="bg-black/60 backdrop-blur-md rounded-xl p-4 border border-yellow-500/30">
            <div className="text-xs text-gray-400 mb-2">Contract Address</div>
            <div className="flex items-center gap-2 mb-3">
              <code className="text-xs font-mono text-yellow-400 truncate max-w-[120px]">
                {tokenContract.slice(0, 8)}...{tokenContract.slice(-6)}
              </code>
              <Button variant="ghost" size="sm" onClick={copyToClipboard} className="h-6 w-6 p-0 text-white hover:text-yellow-400">
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              </Button>
            </div>
            <a href={buyLinks.uniswap} target="_blank" rel="noopener noreferrer">
              <Button className="w-full bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-400 hover:to-yellow-500 text-black font-bold" size="sm">
                <ExternalLink className="w-3 h-3 mr-1" />
                Buy $STNG
              </Button>
            </a>
            {isAdmin && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setShowAdminPanel(!showAdminPanel)}
                className="w-full mt-2 text-gray-400 hover:text-white"
              >
                <Settings className="w-3 h-3 mr-1" />
                Admin
              </Button>
            )}
          </div>
          
          {/* Admin Panel */}
          {isAdmin && showAdminPanel && (
            <div className="mt-2 bg-black/80 backdrop-blur-md rounded-xl p-4 border border-purple-500/30">
              <div className="text-xs text-purple-400 mb-2 font-semibold">Set Token Address</div>
              <Input
                value={adminTokenAddress}
                onChange={(e) => setAdminTokenAddress(e.target.value)}
                placeholder="0x..."
                className="bg-black/50 border-purple-500/30 text-white text-xs mb-2"
              />
              <Button 
                onClick={handleUpdateTokenAddress}
                disabled={isUpdating || !adminTokenAddress}
                className="w-full bg-purple-600 hover:bg-purple-500 text-white" 
                size="sm"
              >
                {isUpdating ? 'Updating...' : 'Update Token'}
              </Button>
            </div>
          )}
        </div>

        {/* Centered Coin Display */}
        <div className="flex flex-col items-center justify-center min-h-[70vh]">
          <div className="w-80 h-80 sm:w-96 sm:h-96 md:w-[32rem] md:h-[32rem] lg:w-[40rem] lg:h-[40rem]">
            <SpinningCoin3D className="w-full h-full" />
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold italic tracking-tight mt-6 text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-yellow-300 to-yellow-500">
            $STNG Token
          </h1>
          <p className="text-gray-400 mt-3 text-lg">Utility news coming soon...</p>
          <a 
            href="https://x.com/StingMarkets" 
            target="_blank" 
            rel="noopener noreferrer"
            className="mt-4 flex items-center gap-2 text-gray-300 hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
            </svg>
            <span>@StingMarkets</span>
          </a>
        </div>
      </div>

      <style>{`
        @keyframes twinkle {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
      `}</style>
    </div>
  );
}
