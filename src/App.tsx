import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { WagmiProvider } from "wagmi";
import { RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { config } from "@/config/wagmi";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ScrollToTop } from "@/components/ScrollToTop";
import { MobileFooterNav } from "@/components/MobileFooterNav";
import { FarcasterAuthProvider } from "@/hooks/useFarcasterAuth";
import { FarcasterAutoConnect } from "@/components/FarcasterAutoConnect";
import Index from "./pages/Index";
import Markets from "./pages/Markets";
import SingleMarkets from "./pages/SingleMarkets";
import MyBets from "./pages/MyBets";
import BetHistory from "./pages/BetHistory";
import HowItWorks from "./pages/HowItWorks";
import Admin from "./pages/Admin";
import NotFound from "./pages/NotFound";
import Terms from "./pages/Terms";
import Privacy from "./pages/Privacy";
import RiskDisclaimer from "./pages/RiskDisclaimer";
import AuctionLeaderboard from "./pages/AuctionLeaderboard";
import Token from "./pages/Token";

import "@rainbow-me/rainbowkit/styles.css";

const queryClient = new QueryClient();

const App = () => (
  <ErrorBoundary>
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>
          <FarcasterAuthProvider>
            <FarcasterAutoConnect />
            <TooltipProvider>
              <Toaster />
              <Sonner />
              <BrowserRouter>
                <ScrollToTop />
                <Routes>
                  <Route path="/" element={<Markets />} />
                  <Route path="/single-markets" element={<SingleMarkets />} />
                  <Route path="/my-bets" element={<MyBets />} />
                  <Route path="/bet-history" element={<BetHistory />} />
                  <Route path="/how-it-works" element={<HowItWorks />} />
                  <Route path="/admin-167" element={<Admin />} />
                  <Route path="/landing" element={<Index />} />
                  <Route path="/terms" element={<Terms />} />
                  <Route path="/privacy" element={<Privacy />} />
                  <Route path="/risk-disclaimer" element={<RiskDisclaimer />} />
                  <Route path="/auction" element={<AuctionLeaderboard />} />
                  <Route path="/token" element={<Token />} />
                  {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                  <Route path="*" element={<NotFound />} />
                </Routes>
                <MobileFooterNav />
              </BrowserRouter>
            </TooltipProvider>
          </FarcasterAuthProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </ErrorBoundary>
);

export default App;
