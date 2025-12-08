import { useAccount } from 'wagmi';
import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  ArrowLeft,
  Trophy, 
  AlertCircle, 
  History,
  Menu,
  X,
  Trash2
} from 'lucide-react';
import { WalletConnect } from '@/components/WalletConnect';
import { TOKEN_SYMBOL } from '@/config/contract';

// Types for archived bets
export interface ArchivedBet {
  betId: string;
  marketId: number;
  marketName: string;
  bucketLabel: string;
  amountToken: number;
  potentialPayout: number;
  won: boolean;
  claimed: boolean;
  txHash: string;
  archivedAt: number; // timestamp
  // Settlement info
  settlementPrice?: number | null;
  referencePrice?: number | null;
  priceChangePercent?: number | null;
  winningBucketLabel?: string | null;
}

// Local storage key for archived bets
const ARCHIVED_BETS_KEY = 'stingMarkets_archivedBets';

// Helper to get archived bets from localStorage
export function getArchivedBets(address: string): ArchivedBet[] {
  try {
    const key = `${ARCHIVED_BETS_KEY}_${address.toLowerCase()}`;
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

// Helper to archive a bet
export function archiveBet(address: string, bet: ArchivedBet): void {
  try {
    const key = `${ARCHIVED_BETS_KEY}_${address.toLowerCase()}`;
    const existing = getArchivedBets(address);
    // Don't duplicate
    if (existing.some(b => b.betId === bet.betId)) return;
    existing.push({ ...bet, archivedAt: Date.now() });
    localStorage.setItem(key, JSON.stringify(existing));
  } catch (e) {
    console.error('Failed to archive bet:', e);
  }
}

// Helper to remove an archived bet
export function removeArchivedBet(address: string, betId: string): void {
  try {
    const key = `${ARCHIVED_BETS_KEY}_${address.toLowerCase()}`;
    const existing = getArchivedBets(address);
    const filtered = existing.filter(b => b.betId !== betId);
    localStorage.setItem(key, JSON.stringify(filtered));
  } catch (e) {
    console.error('Failed to remove archived bet:', e);
  }
}

// Helper to check if a bet is archived
export function isBetArchived(address: string, betId: string): boolean {
  const archived = getArchivedBets(address);
  return archived.some(b => b.betId === betId);
}

const ADMIN_ADDRESSES = [
  '0x1483D79f79B02774a443B37cf55e22A9999bB320'.toLowerCase(),
  '0x6e0c6f82A4EF5d2331F387d3a807FedC3a50d2a3'.toLowerCase(),
];

export default function BetHistory() {
  const { address, isConnected } = useAccount();
  const isAdmin = address && ADMIN_ADDRESSES.includes(address.toLowerCase());
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [archivedBets, setArchivedBets] = useState<ArchivedBet[]>([]);

  // Load archived bets
  useEffect(() => {
    if (address) {
      setArchivedBets(getArchivedBets(address));
    }
  }, [address]);

  // Handle removing a bet from history
  const handleRemoveBet = (betId: string) => {
    if (!address) return;
    removeArchivedBet(address, betId);
    setArchivedBets(getArchivedBets(address));
  };

  // Handle clearing all history
  const handleClearAll = () => {
    if (!address) return;
    const key = `${ARCHIVED_BETS_KEY}_${address.toLowerCase()}`;
    localStorage.removeItem(key);
    setArchivedBets([]);
  };

  // Separate won and lost bets
  const wonBets = archivedBets.filter(b => b.won);
  const lostBets = archivedBets.filter(b => !b.won);

  // Calculate stats
  const stats = {
    totalBets: archivedBets.length,
    wonCount: wonBets.length,
    lostCount: lostBets.length,
    totalWon: wonBets.reduce((sum, b) => sum + b.potentialPayout, 0),
    totalLost: lostBets.reduce((sum, b) => sum + b.amountToken, 0),
  };

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

      <div className="container mx-auto px-4 py-6 sm:py-8">
        {/* Header with back button */}
        <div className="mb-6 sm:mb-8">
          <Link to="/my-bets" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4">
            <ArrowLeft className="w-4 h-4" />
            <span>Back to My Bets</span>
          </Link>
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold mb-2 flex items-center gap-3">
                <History className="w-8 h-8" />
                Bet History
              </h1>
              <p className="text-sm sm:text-base text-muted-foreground">
                Your settled bets that have been claimed or dismissed
              </p>
            </div>
            {archivedBets.length > 0 && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleClearAll}
                className="self-start text-red-500 hover:text-red-600 hover:bg-red-500/10"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Clear All
              </Button>
            )}
          </div>
        </div>

        {/* Connect Wallet CTA */}
        {!isConnected && (
          <Card className="p-12 text-center">
            <History className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
            <CardTitle className="mb-2">Connect Your Wallet</CardTitle>
            <CardDescription className="mb-6">
              Connect your wallet to view your bet history
            </CardDescription>
            <WalletConnect />
          </Card>
        )}

        {isConnected && (
          <>
            {/* Stats Summary */}
            {archivedBets.length > 0 && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
                <Card>
                  <CardContent className="p-4 sm:p-6">
                    <div className="text-xs sm:text-sm font-medium text-muted-foreground mb-1">Total Archived</div>
                    <div className="text-xl sm:text-2xl font-bold">{stats.totalBets}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 sm:p-6">
                    <div className="text-xs sm:text-sm font-medium text-muted-foreground mb-1">Won</div>
                    <div className="text-xl sm:text-2xl font-bold text-green-500">{stats.wonCount}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 sm:p-6">
                    <div className="text-xs sm:text-sm font-medium text-muted-foreground mb-1">Lost</div>
                    <div className="text-xl sm:text-2xl font-bold text-red-500">{stats.lostCount}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 sm:p-6">
                    <div className="text-xs sm:text-sm font-medium text-muted-foreground mb-1">Total Won</div>
                    <div className="text-xl sm:text-2xl font-bold text-green-500">{stats.totalWon.toFixed(4)} ETH</div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Empty State */}
            {archivedBets.length === 0 && (
              <Card className="p-12 text-center">
                <History className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
                <CardTitle className="mb-2">No Bet History</CardTitle>
                <CardDescription className="mb-6">
                  Your settled bets will appear here after you claim your winnings or dismiss lost bets
                </CardDescription>
                <Button asChild>
                  <Link to="/my-bets">Go to My Bets</Link>
                </Button>
              </Card>
            )}

            {/* Won Bets */}
            {wonBets.length > 0 && (
              <div className="mb-6">
                <h2 className="text-xl sm:text-2xl font-bold mb-4 flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-green-500" />
                  Won Bets ({wonBets.length})
                </h2>
                <div className="space-y-3">
                  {wonBets.map((bet) => (
                    <Card key={bet.betId} className="border-green-500/30">
                      <CardContent className="p-4 sm:p-6">
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-3 flex-wrap">
                              <Trophy className="w-4 h-4 sm:w-5 sm:h-5 text-green-500 shrink-0" />
                              <Badge variant="secondary" className="font-mono text-xs">
                                {bet.bucketLabel}
                              </Badge>
                              <span className="font-semibold text-sm sm:text-base truncate">{bet.marketName}</span>
                              <Badge variant="outline" className="border-green-500 text-green-500 ml-auto">
                                {bet.claimed ? 'Claimed' : 'Won'}
                              </Badge>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                              <div className="flex justify-between sm:block">
                                <span className="text-muted-foreground">Staked:</span>
                                <span className="font-bold sm:ml-2">{bet.amountToken.toFixed(2)} {TOKEN_SYMBOL}</span>
                              </div>
                              <div className="flex justify-between sm:block">
                                <span className="text-muted-foreground">Won:</span>
                                <span className="font-bold text-green-500 sm:ml-2">+{bet.potentialPayout.toFixed(2)} {TOKEN_SYMBOL}</span>
                              </div>
                              {/* Settlement Info */}
                              {bet.settlementPrice != null && (
                                <div className="flex justify-between sm:block">
                                  <span className="text-muted-foreground">Settle Price:</span>
                                  <span className="font-bold sm:ml-2">${bet.settlementPrice.toFixed(2)}</span>
                                </div>
                              )}
                              {bet.priceChangePercent != null && (
                                <div className="flex justify-between sm:block">
                                  <span className="text-muted-foreground">Price Change:</span>
                                  <span className={`font-bold sm:ml-2 ${bet.priceChangePercent >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                    {bet.priceChangePercent >= 0 ? '+' : ''}{bet.priceChangePercent.toFixed(2)}%
                                  </span>
                                </div>
                              )}
                              {bet.winningBucketLabel && (
                                <div className="flex justify-between sm:block sm:col-span-2">
                                  <span className="text-muted-foreground">Winning Bucket:</span>
                                  <Badge variant="outline" className="font-mono text-xs sm:ml-2">
                                    {bet.winningBucketLabel}
                                  </Badge>
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 pt-2 sm:pt-0 border-t sm:border-t-0">
                            <a 
                              href={`https://sepolia.basescan.org/tx/${bet.txHash}`} 
                              target="_blank" 
                              rel="noopener noreferrer" 
                              className="text-xs text-muted-foreground hover:underline"
                            >
                              View Tx
                            </a>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleRemoveBet(bet.betId)}
                              className="text-muted-foreground hover:text-red-500"
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Lost Bets */}
            {lostBets.length > 0 && (
              <div>
                <h2 className="text-xl sm:text-2xl font-bold mb-4 flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-red-500" />
                  Lost Bets ({lostBets.length})
                </h2>
                <div className="space-y-3">
                  {lostBets.map((bet) => (
                    <Card key={bet.betId} className="border-red-500/30">
                      <CardContent className="p-4 sm:p-6">
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-3 flex-wrap">
                              <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 text-red-500 shrink-0" />
                              <Badge variant="secondary" className="font-mono text-xs">
                                {bet.bucketLabel}
                              </Badge>
                              <span className="font-semibold text-sm sm:text-base truncate">{bet.marketName}</span>
                              <Badge variant="outline" className="border-red-500 text-red-500 ml-auto">
                                Lost
                              </Badge>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                              <div className="flex justify-between sm:block">
                                <span className="text-muted-foreground">Staked:</span>
                                <span className="font-bold sm:ml-2">{bet.amountToken.toFixed(2)} {TOKEN_SYMBOL}</span>
                              </div>
                              <div className="flex justify-between sm:block">
                                <span className="text-muted-foreground">Lost:</span>
                                <span className="font-bold text-red-500 sm:ml-2">-{bet.amountToken.toFixed(2)} {TOKEN_SYMBOL}</span>
                              </div>
                              {/* Settlement Info */}
                              {bet.settlementPrice != null && (
                                <div className="flex justify-between sm:block">
                                  <span className="text-muted-foreground">Settle Price:</span>
                                  <span className="font-bold sm:ml-2">${bet.settlementPrice.toFixed(2)}</span>
                                </div>
                              )}
                              {bet.priceChangePercent != null && (
                                <div className="flex justify-between sm:block">
                                  <span className="text-muted-foreground">Price Change:</span>
                                  <span className={`font-bold sm:ml-2 ${bet.priceChangePercent >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                    {bet.priceChangePercent >= 0 ? '+' : ''}{bet.priceChangePercent.toFixed(2)}%
                                  </span>
                                </div>
                              )}
                              {bet.winningBucketLabel && (
                                <div className="flex justify-between sm:block sm:col-span-2">
                                  <span className="text-muted-foreground">Winning Bucket:</span>
                                  <Badge variant="outline" className="font-mono text-xs sm:ml-2">
                                    {bet.winningBucketLabel}
                                  </Badge>
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 pt-2 sm:pt-0 border-t sm:border-t-0">
                            <a 
                              href={`https://sepolia.basescan.org/tx/${bet.txHash}`} 
                              target="_blank" 
                              rel="noopener noreferrer" 
                              className="text-xs text-muted-foreground hover:underline"
                            >
                              View Tx
                            </a>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleRemoveBet(bet.betId)}
                              className="text-muted-foreground hover:text-red-500"
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Info Notice */}
        <Alert className="mt-8">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-xs">
            <strong>Bet History:</strong> This page shows bets you've archived after claiming winnings or dismissing losses. 
            You can remove individual bets or clear all history. This data is stored locally in your browser.
          </AlertDescription>
        </Alert>
      </div>
    </div>
  );
}
