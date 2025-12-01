import { Button } from "@/components/ui/button";
import { Sparkles, TrendingUp, Coins } from "lucide-react";
import { useNavigate } from "react-router-dom";

export const Hero = () => {
  const navigate = useNavigate();

  const scrollToTrends = () => {
    const trendsSection = document.getElementById('trends-dashboard');
    if (trendsSection) {
      trendsSection.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <section className="relative min-h-screen flex items-center justify-center bg-gradient-hero overflow-hidden">
      {/* Animated background grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--border))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border))_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_50%,#000_70%,transparent_110%)] opacity-20" />
      
      <div className="container px-4 relative z-10">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-card border border-primary/20 text-sm animate-in fade-in slide-in-from-bottom-4 duration-500">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-foreground">Powered by Base Chain & Clanker</span>
          </div>

          {/* Main heading */}
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight animate-in fade-in slide-in-from-bottom-4 duration-700 delay-100">
            <span className="bg-gradient-primary bg-clip-text text-transparent">
              Bet on Trends
            </span>
            <br />
            <span className="text-foreground">Win with Data</span>
          </h1>

          {/* Description */}
          <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700 delay-200">
            Prediction markets for Google Trends. Bet UP or DOWN on trending topics. Win based on real trend data. Powered by Base chain.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center animate-in fade-in slide-in-from-bottom-4 duration-700 delay-300">
            <Button 
              size="lg" 
              className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-glow transition-all duration-300 hover:scale-105"
              onClick={() => navigate('/')}
            >
              <Coins className="w-5 h-5 mr-2" />
              Browse Markets
            </Button>
            <Button 
              size="lg" 
              variant="outline"
              className="border-primary/20 hover:bg-primary/10 hover:border-primary/40 transition-all duration-300"
              onClick={() => navigate('/how-it-works')}
            >
              <TrendingUp className="w-5 h-5 mr-2" />
              How It Works
            </Button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-8 pt-12 max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700 delay-500">
            <div className="space-y-2">
              <div className="text-3xl md:text-4xl font-bold text-primary">UP/DOWN</div>
              <div className="text-sm text-muted-foreground">Simple betting</div>
            </div>
            <div className="space-y-2">
              <div className="text-3xl md:text-4xl font-bold text-secondary">48h</div>
              <div className="text-sm text-muted-foreground">Settlement time</div>
            </div>
            <div className="space-y-2">
              <div className="text-3xl md:text-4xl font-bold text-success">Real</div>
              <div className="text-sm text-muted-foreground">Trend data</div>
            </div>
          </div>
        </div>
      </div>

      {/* Floating orbs for visual interest */}
      <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-primary/20 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-secondary/20 rounded-full blur-3xl animate-pulse delay-1000" />
    </section>
  );
};
