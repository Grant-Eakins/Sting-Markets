import { Card } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useMemo } from "react";

const API_BASE = 'http://localhost:3001/api';

interface CoinChartProps {
  name: string;
  symbol: string;
  volume: string;
  growth: string;
  tokenAddress?: string;
  contractAddress?: string; // For meme coins - fetches real chart data
}

interface ChartDataPoint {
  timestamp: string;
  price: number;
}

export const CoinChart = ({ name, symbol, volume, growth, tokenAddress, contractAddress }: CoinChartProps) => {
  const growthValue = parseInt(growth.replace(/[^0-9]/g, '')) || 0;
  const isPositive = growth.includes('+');

  // Fetch real chart data if contractAddress is provided
  const { data: chartResponse, isLoading } = useQuery({
    queryKey: ['chart', contractAddress],
    queryFn: async () => {
      if (!contractAddress) return null;
      const response = await axios.get(`${API_BASE}/markets/chart-by-contract/${contractAddress}?timeframe=15m`);
      return response.data;
    },
    enabled: !!contractAddress,
    refetchInterval: 60000, // Refresh every minute
    staleTime: 30000,
  });

  // Use real data if available, otherwise generate mock data
  const chartData = useMemo(() => {
    if (chartResponse?.data && chartResponse.data.length > 0) {
      // Use real data from DexScreener
      return chartResponse.data.map((point: ChartDataPoint) => point.price);
    }
    
    // Fallback: Generate mock chart data based on growth
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
  }, [chartResponse, growthValue, isPositive]);

  const maxValue = Math.max(...chartData);
  const minValue = Math.min(...chartData);
  const range = maxValue - minValue || 1; // Avoid division by zero

  // Create SVG path for the chart
  const createPath = () => {
    const width = 300;
    const height = 100;
    const points = chartData.map((value: number, index: number) => {
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
    const points = chartData.map((value: number, index: number) => {
      const x = (index / (chartData.length - 1)) * width;
      const y = height - ((value - minValue) / range) * height;
      return `${x},${y}`;
    });
    return `M 0,${height} L ${points.join(' L ')} L ${width},${height} Z`;
  };

  // Determine chart color based on actual price movement if we have real data
  const chartIsPositive = useMemo(() => {
    if (chartResponse?.data && chartResponse.data.length >= 2) {
      const firstPrice = chartResponse.data[0].price;
      const lastPrice = chartResponse.data[chartResponse.data.length - 1].price;
      return lastPrice >= firstPrice;
    }
    return isPositive;
  }, [chartResponse, isPositive]);

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
            <p className={`text-lg font-bold flex items-center gap-1 ${chartIsPositive ? 'text-success' : 'text-destructive'}`}>
              {chartIsPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              {growth}
            </p>
            <p className="text-sm text-muted-foreground">{volume}</p>
          </div>
        </div>

        {/* Chart */}
        <div className="relative w-full h-24">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <svg
              viewBox="0 0 300 100"
              className="w-full h-full"
              preserveAspectRatio="none"
            >
              {/* Gradient definition */}
              <defs>
                <linearGradient id={`gradient-${symbol}`} x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor={chartIsPositive ? "hsl(var(--success))" : "hsl(var(--destructive))"} stopOpacity="0.3" />
                  <stop offset="100%" stopColor={chartIsPositive ? "hsl(var(--success))" : "hsl(var(--destructive))"} stopOpacity="0" />
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
                stroke={chartIsPositive ? "hsl(var(--success))" : "hsl(var(--destructive))"}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </div>

        {/* Real data indicator */}
        {contractAddress && chartResponse?.data?.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
            Live data from DexScreener
          </div>
        )}

        {/* Token Address */}
        {(tokenAddress || contractAddress) && (
          <div className="pt-2 border-t border-border">
            <p className="text-xs text-muted-foreground">
              Contract: <span className="text-primary font-mono">{(contractAddress || tokenAddress)?.slice(0, 10)}...{(contractAddress || tokenAddress)?.slice(-8)}</span>
            </p>
          </div>
        )}
      </div>
    </Card>
  );
};
