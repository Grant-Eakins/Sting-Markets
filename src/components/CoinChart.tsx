import { Card } from "@/components/ui/card";
import { TrendingUp, TrendingDown } from "lucide-react";

interface CoinChartProps {
  name: string;
  symbol: string;
  volume: string;
  growth: string;
  tokenAddress?: string;
}

export const CoinChart = ({ name, symbol, volume, growth, tokenAddress }: CoinChartProps) => {
  // Generate mock chart data based on growth
  const growthValue = parseInt(growth.replace(/[^0-9]/g, '')) || 0;
  const isPositive = growth.includes('+');
  
  // Create 30 data points for the chart
  const generateChartData = () => {
    const points = 30;
    const data = [];
    const volatility = growthValue / 10;
    
    for (let i = 0; i < points; i++) {
      const progress = i / points;
      const trend = isPositive ? progress * growthValue : -progress * Math.abs(growthValue);
      const noise = (Math.random() - 0.5) * volatility;
      data.push(Math.max(0, 50 + trend + noise));
    }
    return data;
  };

  const chartData = generateChartData();
  const maxValue = Math.max(...chartData);
  const minValue = Math.min(...chartData);
  const range = maxValue - minValue;

  // Create SVG path for the chart
  const createPath = () => {
    const width = 300;
    const height = 100;
    const points = chartData.map((value, index) => {
      const x = (index / (chartData.length - 1)) * width;
      const y = height - ((value - minValue) / range) * height;
      return `${x},${y}`;
    });
    return `M ${points.join(' L ')}`;
  };

  // Create area path
  const createAreaPath = () => {
    const width = 300;
    const height = 100;
    const points = chartData.map((value, index) => {
      const x = (index / (chartData.length - 1)) * width;
      const y = height - ((value - minValue) / range) * height;
      return `${x},${y}`;
    });
    return `M 0,${height} L ${points.join(' L ')} L ${width},${height} Z`;
  };

  return (
    <Card className="p-6 bg-card border-border">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-foreground">{name}</h3>
            <p className="text-sm text-muted-foreground font-mono">${symbol}</p>
          </div>
          <div className="text-right">
            <p className={`text-lg font-bold flex items-center gap-1 ${isPositive ? 'text-success' : 'text-destructive'}`}>
              {isPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              {growth}
            </p>
            <p className="text-sm text-muted-foreground">{volume}</p>
          </div>
        </div>

        {/* Chart */}
        <div className="relative w-full h-24">
          <svg
            viewBox="0 0 300 100"
            className="w-full h-full"
            preserveAspectRatio="none"
          >
            {/* Gradient definition */}
            <defs>
              <linearGradient id={`gradient-${symbol}`} x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor={isPositive ? "hsl(var(--success))" : "hsl(var(--destructive))"} stopOpacity="0.3" />
                <stop offset="100%" stopColor={isPositive ? "hsl(var(--success))" : "hsl(var(--destructive))"} stopOpacity="0" />
              </linearGradient>
            </defs>
            
            {/* Area fill */}
            <path
              d={createAreaPath()}
              fill={`url(#gradient-${symbol})`}
            />
            
            {/* Line */}
            <path
              d={createPath()}
              fill="none"
              stroke={isPositive ? "hsl(var(--success))" : "hsl(var(--destructive))"}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        {/* Token Address */}
        {tokenAddress && (
          <div className="pt-2 border-t border-border">
            <p className="text-xs text-muted-foreground">
              Contract: <span className="text-primary font-mono">{tokenAddress.slice(0, 10)}...{tokenAddress.slice(-8)}</span>
            </p>
          </div>
        )}
      </div>
    </Card>
  );
};
