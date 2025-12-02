import { Link } from 'react-router-dom';

export function Footer() {
  return (
    <footer className="border-t bg-muted/30 mt-12">
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6">
          {/* Logo and tagline */}
          <div className="flex items-center gap-2">
            <img src="/Copilot_20251128_175824-removebg-preview.png" alt="Sting Markets" className="h-8" />
            <div>
              <span className="font-bold italic">Sting Markets</span>
              <p className="text-xs text-muted-foreground">Crypto Prediction Markets on Base</p>
            </div>
          </div>

          {/* Links */}
          <div className="flex flex-wrap justify-center gap-4 sm:gap-6 text-sm">
            <Link to="/" className="text-muted-foreground hover:text-foreground transition-colors">
              Markets
            </Link>
            <Link to="/my-bets" className="text-muted-foreground hover:text-foreground transition-colors">
              My Bets
            </Link>
            <Link to="/how-it-works" className="text-muted-foreground hover:text-foreground transition-colors">
              How It Works
            </Link>
          </div>

          {/* Legal Links */}
          <div className="flex flex-wrap justify-center gap-4 sm:gap-6 text-sm">
            <Link to="/terms" className="text-muted-foreground hover:text-foreground transition-colors">
              Terms
            </Link>
            <Link to="/privacy" className="text-muted-foreground hover:text-foreground transition-colors">
              Privacy
            </Link>
            <Link to="/risk-disclaimer" className="text-muted-foreground hover:text-foreground transition-colors">
              Risk Disclaimer
            </Link>
          </div>
        </div>

        {/* Bottom row */}
        <div className="mt-6 pt-6 border-t text-center text-xs text-muted-foreground">
          <p className="mb-2">
            ⚠️ <strong>Risk Warning:</strong> Prediction markets involve financial risk. You may lose your entire stake. 
            <Link to="/risk-disclaimer" className="ml-1 underline hover:text-foreground">Learn more</Link>
          </p>
          <p>
            © {new Date().getFullYear()} Sting Markets. Built on Base Sepolia Testnet.
          </p>
        </div>
      </div>
    </footer>
  );
}
