import { Hero } from "@/components/Hero";
import { HowItWorks } from "@/components/HowItWorks";
import { WalletConnect } from "@/components/WalletConnect";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useWriteContract, useWaitForTransactionReceipt, useAccount } from 'wagmi';
import { TOKEN_ADDRESSES } from '@/config/contract';
import { useToast } from '@/hooks/use-toast';
import { baseSepolia } from 'viem/chains';

const MOCK_USDC_ABI = [
  {
    "inputs": [],
    "name": "faucet",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const;

const Index = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isConnected } = useAccount();
  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });
  
  const handleFaucet = async () => {
    if (!isConnected) {
      toast({
        title: "Wallet not connected",
        description: "Please connect your wallet first",
        variant: "destructive",
      });
      return;
    }

    try {
      writeContract({
        address: TOKEN_ADDRESSES[baseSepolia.id] as `0x${string}`,
        abi: MOCK_USDC_ABI,
        functionName: 'faucet',
        chainId: baseSepolia.id,
      });
      
      toast({
        title: "Requesting USDC...",
        description: "Transaction submitted",
      });
    } catch (error) {
      console.error('Faucet error:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to request USDC",
        variant: "destructive",
      });
    }
  };

  // Show success toast when transaction confirms
  if (isSuccess) {
    toast({
      title: "Success!",
      description: "1000 Mock USDC added to your wallet",
    });
  }
  
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
          <Button 
            size="lg"
            onClick={handleFaucet}
            disabled={!isConnected || isPending || isConfirming}
            variant="outline"
            className="bg-green-600 hover:bg-green-700 text-white border-0"
          >
            {isPending || isConfirming ? "Collecting..." : "Collect 1000 Mock USDC"}
          </Button>
        </div>
      </div>
      <HowItWorks />
    </div>
  );
};

export default Index;
