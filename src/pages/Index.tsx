import { Hero } from "@/components/Hero";
import { HowItWorks } from "@/components/HowItWorks";
import { WalletConnect } from "@/components/WalletConnect";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { ExternalLink } from "lucide-react";

const Index = () => {
  const navigate = useNavigate();
  
  return (
    <div className="min-h-screen bg-background">
      <WalletConnect />
      <Hero />
      <div className="container mx-auto px-4 py-12 text-center space-y-4">
        <Button 
          size="lg"
          onClick={() => navigate('/')}
          className="bg-primary hover:bg-primary/90"
        >
          Start Betting on Markets
        </Button>
        <div>
          <a 
            href="https://app.uniswap.org/swap?chain=base&outputCurrency=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button 
              size="lg"
              variant="outline"
              className="bg-blue-600 hover:bg-blue-700 text-white border-0"
            >
              Get USDC <ExternalLink className="w-4 h-4 ml-2" />
            </Button>
          </a>
        </div>
      </div>
      <HowItWorks />
    </div>
  );
};

export default Index;
