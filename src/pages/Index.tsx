import { Hero } from "@/components/Hero";
import { HowItWorks } from "@/components/HowItWorks";
import { WalletConnect } from "@/components/WalletConnect";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

const Index = () => {
  const navigate = useNavigate();
  
  return (
    <div className="min-h-screen bg-background">
      <WalletConnect />
      <Hero />
      <div className="container mx-auto px-4 py-12 text-center">
        <Button 
          size="lg"
          onClick={() => navigate('/')}
          className="bg-primary hover:bg-primary/90"
        >
          Start Betting on Markets
        </Button>
      </div>
      <HowItWorks />
    </div>
  );
};

export default Index;
