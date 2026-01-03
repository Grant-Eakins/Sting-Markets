import { Link, useLocation } from 'react-router-dom';
import { Swords, TrendingUp, Wallet, Menu, Trophy } from 'lucide-react';
import { useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';

export function MobileFooterNav() {
  const location = useLocation();
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  const isActive = (path: string) => {
    return location.pathname === path;
  };

  return (
    <>
      {/* Fixed bottom navigation bar for mobile - shows on all devices including Farcaster */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-t z-50 safe-area-inset-bottom">
        <div className="flex items-center justify-around h-20 px-2">
          {/* Coin Battles */}
          <Link 
            to="/" 
            className={`flex flex-col items-center justify-center flex-1 gap-1.5 py-2 transition-colors ${
              isActive('/') ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Swords className="h-7 w-7" />
            <span className="text-sm font-medium">Battles</span>
          </Link>

          {/* Markets */}
          <Link 
            to="/single-markets" 
            className={`flex flex-col items-center justify-center flex-1 gap-1.5 py-2 transition-colors ${
              isActive('/single-markets') ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <TrendingUp className="h-7 w-7" />
            <span className="text-sm font-medium">Markets</span>
          </Link>

          {/* My Bets */}
          <Link 
            to="/my-bets" 
            className={`flex flex-col items-center justify-center flex-1 gap-1.5 py-2 transition-colors ${
              isActive('/my-bets') ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Wallet className="h-7 w-7" />
            <span className="text-sm font-medium">My Bets</span>
          </Link>

          {/* More */}
          <Sheet open={isMoreOpen} onOpenChange={setIsMoreOpen}>
            <SheetTrigger asChild>
              <button 
                className={`flex flex-col items-center justify-center flex-1 gap-1.5 py-2 transition-colors ${
                  isMoreOpen ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Menu className="h-7 w-7" />
                <span className="text-sm font-medium">More</span>
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="h-auto max-h-[80vh]">
              <SheetHeader>
                <SheetTitle>More</SheetTitle>
                <SheetDescription>
                  Additional pages and information
                </SheetDescription>
              </SheetHeader>
              <div className="flex flex-col gap-2 mt-6">
                <Link to="/auction" onClick={() => setIsMoreOpen(false)}>
                  <Button variant="outline" className="w-full justify-start" size="lg">
                    <Trophy className="h-4 w-4 mr-2" />
                    Listing Auction
                  </Button>
                </Link>
                <Link to="/how-it-works" onClick={() => setIsMoreOpen(false)}>
                  <Button variant="outline" className="w-full justify-start" size="lg">
                    How It Works
                  </Button>
                </Link>
                <Link to="/terms" onClick={() => setIsMoreOpen(false)}>
                  <Button variant="outline" className="w-full justify-start" size="lg">
                    Terms of Service
                  </Button>
                </Link>
                <Link to="/privacy" onClick={() => setIsMoreOpen(false)}>
                  <Button variant="outline" className="w-full justify-start" size="lg">
                    Privacy Policy
                  </Button>
                </Link>
                <Link to="/risk-disclaimer" onClick={() => setIsMoreOpen(false)}>
                  <Button variant="outline" className="w-full justify-start" size="lg">
                    Risk Disclaimer
                  </Button>
                </Link>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </nav>

      {/* Spacer to prevent content from being hidden behind fixed nav */}
      <div className="md:hidden h-20" />
    </>
  );
}
