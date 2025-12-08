import { WalletConnect } from "@/components/WalletConnect";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Link } from "react-router-dom";
import { TOKEN_SYMBOL } from "@/config/contract";
import {
  Coins,
  TrendingUp,
  Zap,
  Shield,
  Globe,
  Clock,
  Rocket,
  ArrowRight,
  Search,
  BarChart3,
  Wallet,
} from "lucide-react";

export default function HowItWorks() {
  return (
    <div className="min-h-screen bg-background">
      <WalletConnect />

      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-40">
        <div className="container px-4 py-4">
          <div className="flex items-center justify-between">
            <Link to="/" className="flex items-center gap-2">
              <img src="/Copilot_20251128_175824-removebg-preview.png" alt="Sting Markets" className="h-10" />
              <span className="text-xl font-bold italic tracking-tight">Sting Markets</span>
            </Link>
            <nav className="hidden md:flex items-center gap-6">
              <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">Markets</Link>
              <Link to="/my-bets" className="text-sm text-muted-foreground hover:text-foreground">My Bets</Link>
              <Link to="/how-it-works" className="text-sm text-foreground font-medium">How It Works</Link>
            </nav>
          </div>
        </div>
      </header>

      <main className="container px-4 py-12">
        {/* Hero Section */}
        <div className="max-w-4xl mx-auto text-center mb-20">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-card border border-primary/20 text-sm mb-6">
            <Zap className="w-4 h-4 text-primary" />
            <span className="text-foreground">Decentralized Crypto Prediction Markets</span>
          </div>
          <h1 className="text-4xl md:text-6xl font-bold mb-6">
            <span className="text-foreground">How</span>{" "}
            <span className="bg-gradient-primary bg-clip-text text-transparent">Sting</span>{" "}
            <span className="text-foreground">Works</span>
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            A fully automated platform for betting on crypto price movements using bonding curve markets on Base chain.
          </p>
        </div>

        {/* Process Flow */}
        <div className="max-w-5xl mx-auto mb-20">
          <h2 className="text-3xl font-bold text-center mb-12">The Process</h2>
          <div className="grid md:grid-cols-3 gap-8 relative">
            {/* Step 1 */}
            <div className="relative">
              <Card className="p-6 bg-card border-border hover:border-primary/50 transition-all">
                <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center mb-4">
                  <Search className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-xl font-semibold mb-2">1. Market Creation</h3>
                <p className="text-muted-foreground">
                  Our system tracks the top 6 cryptos (BTC, ETH, SOL, XRP, DOGE, LINK) and creates 12-hour prediction markets running 24/7.
                </p>
              </Card>
              <ArrowRight className="hidden md:block absolute -right-4 top-1/2 -translate-y-1/2 w-8 h-8 text-primary" />
            </div>

            {/* Step 2 */}
            <div className="relative">
              <Card className="p-6 bg-card border-border hover:border-primary/50 transition-all">
                <div className="w-12 h-12 rounded-full bg-secondary/20 flex items-center justify-center mb-4">
                  <BarChart3 className="w-6 h-6 text-secondary" />
                </div>
                <h3 className="text-xl font-semibold mb-2">2. Pick Your Bucket</h3>
                <p className="text-muted-foreground">
                  Browse active markets, view price charts and liquidity distribution, then pick which price bucket you think the crypto will land in.
                </p>
              </Card>
              <ArrowRight className="hidden md:block absolute -right-4 top-1/2 -translate-y-1/2 w-8 h-8 text-primary" />
            </div>

            {/* Step 3 */}
            <div>
              <Card className="p-6 bg-card border-border hover:border-primary/50 transition-all">
                <div className="w-12 h-12 rounded-full bg-success/20 flex items-center justify-center mb-4">
                  <Coins className="w-6 h-6 text-success" />
                </div>
                <h3 className="text-xl font-semibold mb-2">3. Collect Winnings</h3>
                <p className="text-muted-foreground">
                  Markets settle every 12 hours based on real crypto prices. Winners share the pool proportionally based on their bucket stake.
                </p>
              </Card>
            </div>
          </div>
        </div>

        {/* Technical Details */}
        <div className="max-w-6xl mx-auto mb-20">
          <h2 className="text-3xl font-bold text-center mb-12">Technical Architecture</h2>
          <div className="grid md:grid-cols-2 gap-8">
            <Card className="p-8 bg-card border-border">
              <Globe className="w-10 h-10 text-primary mb-4" />
              <h3 className="text-2xl font-semibold mb-4">Crypto Price API</h3>
              <ul className="space-y-3 text-muted-foreground">
                <li className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2" />
                  <span>Real-time CoinGecko API integration</span>
                </li>
                <li className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2" />
                  <span>Automatic price updates every 2 minutes</span>
                </li>
                <li className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2" />
                  <span>Top 6 cryptos (BTC, ETH, SOL, XRP, DOGE, LINK)</span>
                </li>
                <li className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2" />
                  <span>24/7 operation - crypto never sleeps!</span>
                </li>
              </ul>
            </Card>

            <Card className="p-8 bg-card border-border">
              <Rocket className="w-10 h-10 text-secondary mb-4" />
              <h3 className="text-2xl font-semibold mb-4">Base Chain Smart Contracts</h3>
              <ul className="space-y-3 text-muted-foreground">
                <li className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-secondary mt-2" />
                  <span>Prediction market smart contracts on Base Sepolia</span>
                </li>
                <li className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-secondary mt-2" />
                  <span>Automatic liquidity pool creation</span>
                </li>
                <li className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-secondary mt-2" />
                  <span>Trustless on-chain settlement</span>
                </li>
                <li className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-secondary mt-2" />
                  <span>Proportional payout distribution</span>
                </li>
              </ul>
            </Card>

            <Card className="p-8 bg-card border-border">
              <Clock className="w-10 h-10 text-success mb-4" />
              <h3 className="text-2xl font-semibold mb-4">Market Timeframes</h3>
              <ul className="space-y-3 text-muted-foreground">
                <li className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-success mt-2" />
                  <span>12-hour market cycles running 24/7</span>
                </li>
                <li className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-success mt-2" />
                  <span>Settlement at 00:00 UTC and 12:00 UTC</span>
                </li>
                <li className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-success mt-2" />
                  <span>21 price buckets (±10% in 1% increments)</span>
                </li>
                <li className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-success mt-2" />
                  <span>Automatic new market creation after settlement</span>
                </li>
              </ul>
            </Card>

            <Card className="p-8 bg-card border-border">
              <Shield className="w-10 h-10 text-warning mb-4" />
              <h3 className="text-2xl font-semibold mb-4">Security & Transparency</h3>
              <ul className="space-y-3 text-muted-foreground">
                <li className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-warning mt-2" />
                  <span>On-chain verification of all bets</span>
                </li>
                <li className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-warning mt-2" />
                  <span>Automated settlement based on real crypto prices</span>
                </li>
                <li className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-warning mt-2" />
                  <span>Bonding curve pricing - exit anytime (1% fee)</span>
                </li>
                <li className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-warning mt-2" />
                  <span>Wallet-based ownership and claiming</span>
                </li>
              </ul>
            </Card>
          </div>
        </div>

        {/* User Flow */}
        <div className="max-w-4xl mx-auto mb-20">
          <h2 className="text-3xl font-bold text-center mb-12">For Traders</h2>
          <div className="space-y-6">
            <Card className="p-6 bg-card border-border flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                <Wallet className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="text-lg font-semibold mb-2">1. Connect Your Wallet</h3>
                <p className="text-muted-foreground">
                  Use any Base-compatible wallet (MetaMask, Coinbase Wallet, WalletConnect) to connect to the platform.
                </p>
              </div>
            </Card>

            <Card className="p-6 bg-card border-border flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-secondary/20 flex items-center justify-center flex-shrink-0">
                <TrendingUp className="w-5 h-5 text-secondary" />
              </div>
              <div>
                <h3 className="text-lg font-semibold mb-2">2. Browse Crypto Markets</h3>
                <p className="text-muted-foreground">
                  View active prediction markets for top cryptos with real-time price charts and liquidity distribution across price buckets.
                </p>
              </div>
            </Card>

            <Card className="p-6 bg-card border-border flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-success/20 flex items-center justify-center flex-shrink-0">
                <Zap className="w-5 h-5 text-success" />
              </div>
              <div>
                <h3 className="text-lg font-semibold mb-2">3. Place Your Bet</h3>
                <p className="text-muted-foreground">
                  Choose a target price level, select UP or DOWN, enter your bet amount in {TOKEN_SYMBOL}, and place your prediction on-chain.
                </p>
              </div>
            </Card>

            <Card className="p-6 bg-card border-border flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-warning/20 flex items-center justify-center flex-shrink-0">
                <Coins className="w-5 h-5 text-warning" />
              </div>
              <div>
                <h3 className="text-lg font-semibold mb-2">4. Claim Winnings</h3>
                <p className="text-muted-foreground">
                  After settlement, winners can claim their share of the pool proportionally. Track all your bets in My Bets dashboard.
                </p>
              </div>
            </Card>
          </div>
        </div>

        {/* CTA */}
        <div className="max-w-4xl mx-auto text-center">
          <Card className="p-12 bg-gradient-to-br from-primary/10 to-secondary/10 border-primary/20">
            <h2 className="text-3xl font-bold mb-4">Ready to Predict Crypto Movements?</h2>
            <p className="text-lg text-muted-foreground mb-8">
              Start betting on crypto price predictions with transparent on-chain markets.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/">
                <Button size="lg" className="bg-primary text-primary-foreground hover:bg-primary/90">
                  <TrendingUp className="w-5 h-5 mr-2" />
                  View Markets
                </Button>
              </Link>
              <Link to="/my-bets">
                <Button size="lg" variant="outline">
                  My Bets
                </Button>
              </Link>
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
}
