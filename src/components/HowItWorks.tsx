import { Card } from "@/components/ui/card";
import { Search, Zap, Coins, TrendingUp } from "lucide-react";

const steps = [
  {
    icon: Search,
    title: "Monitor Trends",
    description: "We continuously scan Google Trends for emerging topics from the past 7 days",
    color: "text-primary"
  },
  {
    icon: Zap,
    title: "Instant Detection",
    description: "When a trend starts gaining traction, our system immediately identifies it",
    color: "text-secondary"
  },
  {
    icon: Coins,
    title: "Auto Create Token",
    description: "Clanker automatically generates a new coin on Base chain for each trend",
    color: "text-success"
  },
  {
    icon: TrendingUp,
    title: "Trade & Profit",
    description: "Get in early on viral trends before they peak and maximize your gains",
    color: "text-primary"
  }
];

export const HowItWorks = () => {
  return (
    <section className="py-20 bg-card/30">
      <div className="container px-4">
        <div className="max-w-3xl mx-auto text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold mb-4">
            <span className="bg-gradient-primary bg-clip-text text-transparent">How It Works</span>
          </h2>
          <p className="text-lg text-muted-foreground">
            From trending topic to tradeable token in seconds
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl mx-auto">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <Card 
                key={index}
                className="p-6 bg-card border border-border hover:border-primary/50 transition-all duration-300 relative overflow-hidden group"
              >
                {/* Step number */}
                <div className="absolute top-4 right-4 text-6xl font-bold opacity-5 group-hover:opacity-10 transition-opacity">
                  {index + 1}
                </div>
                
                <div className="relative space-y-4">
                  <div className={`w-12 h-12 rounded-lg bg-background flex items-center justify-center ${step.color}`}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <h3 className="text-xl font-semibold text-foreground">
                    {step.title}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {step.description}
                  </p>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
};
