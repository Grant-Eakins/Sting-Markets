import { Card } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useMemo } from "react";

const API_BASE = import.meta.env.PROD ? '/api' : 'http://localhost:3001/api';

interface CoinChartProps {
  name: string;
  symbol: string;
  growth: string;
  tokenAddress?: string;
  contractAddress?: string; // For meme coins - fetches real chart data
}

interface ChartDataPoint {
  timestamp: string;
  price: number;
}

// Format price with appropriate decimal places
const formatPrice = (price: number): string => {
  if (price >= 1000) return `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (price >= 1) return `$${price.toFixed(4)}`;
  if (price >= 0.0001) return `$${price.toFixed(6)}`;
  if (price >= 0.00000001) return `$${price.toFixed(8)}`;
  return `$${price.toExponential(2)}`;
};

// Format price for Y-axis (shorter)
const formatYAxisPrice = (price: number): string => {
  if (price >= 1000) return `$${(price / 1000).toFixed(1)}k`;
  if (price >= 1) return `$${price.toFixed(2)}`;
  if (price >= 0.0001) return `$${price.toFixed(5)}`;
  if (price >= 0.00000001) return `$${price.toFixed(7)}`;
  return `$${price.toExponential(1)}`;
};

export const CoinChart = ({ name, symbol, growth, tokenAddress, contractAddress }: CoinChartProps) => {
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
  const dataRange = maxValue - minValue;
  
  // Dynamic padding based on data range and value magnitude
  const paddingPercent = dataRange < maxValue * 0.05 ? 0.15 : 0.1; // More padding for flat lines
  let paddedMin = minValue - dataRange * paddingPercent;
  let paddedMax = maxValue + dataRange * paddingPercent;
  
  // If the range is too small (flat line), create a reasonable scale
  // Use 5% range minimum for better visibility
  if (dataRange < maxValue * 0.01) {
    const centerValue = (maxValue + minValue) / 2;
    const minRange = centerValue * 0.05; // At least 5% range
    paddedMin = centerValue - minRange;
    paddedMax = centerValue + minRange;
  }
  
  // Ensure we don't go below zero for price charts
  paddedMin = Math.max(0, paddedMin);
  
  const range = paddedMax - paddedMin || 1; // Avoid division by zero
  
  // Calculate Y-axis labels (5 levels)
  const yAxisLabels = useMemo(() => {
    const labels = [];
    for (let i = 0; i <= 4; i++) {
      const value = paddedMin + (range * (4 - i) / 4);
      labels.push(value);
    }
    return labels;
  }, [paddedMin, range]);

  // Create SVG path for the chart with smooth curves
  const createPath = () => {
    const width = 280; // Leave room for Y-axis
    const height = 120;
    const points = chartData.map((value: number, index: number) => {
      const x = (index / (chartData.length - 1)) * width;
      const y = height - ((value - paddedMin) / range) * height;
      return { x, y };
    });
    
    // Create smooth bezier curve path
    if (points.length < 2) return '';
    
    let path = `M ${points[0].x},${points[0].y}`;
    
    for (let i = 0; i < points.length - 1; i++) {
      const current = points[i];
      const next = points[i + 1];
      const controlX = (current.x + next.x) / 2;
      
      path += ` Q ${controlX},${current.y} ${controlX},${(current.y + next.y) / 2}`;
      path += ` Q ${controlX},${next.y} ${next.x},${next.y}`;
    }
    
    return path;
  };

  // Create area path with smooth curves
  const createAreaPath = () => {
    const width = 280;
    const height = 120;
    const points = chartData.map((value: number, index: number) => {
      const x = (index / (chartData.length - 1)) * width;
      const y = height - ((value - paddedMin) / range) * height;
      return { x, y };
    });
    
    if (points.length < 2) return '';
    
    let path = `M 0,${height} L ${points[0].x},${points[0].y}`;
    
    for (let i = 0; i < points.length - 1; i++) {
      const current = points[i];
      const next = points[i + 1];
      const controlX = (current.x + next.x) / 2;
      
      path += ` Q ${controlX},${current.y} ${controlX},${(current.y + next.y) / 2}`;
      path += ` Q ${controlX},${next.y} ${next.x},${next.y}`;
    }
    
    path += ` L ${width},${height} Z`;
    return path;
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
  
  // Get current price
  const currentPrice = useMemo(() => {
    if (chartData.length > 0) {
      return chartData[chartData.length - 1];
    }
    return 0;
  }, [chartData]);

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
            <div className="text-xl font-bold text-foreground font-mono">
              {formatPrice(currentPrice)}
            </div>
            <p className={`text-sm font-bold flex items-center justify-end gap-1 ${chartIsPositive ? 'text-success' : 'text-destructive'}`}>
              {chartIsPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              {growth}
            </p>
          </div>
        </div>

        {/* Chart with Y-axis */}
        <div className="relative w-full h-32">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="flex gap-2 h-full">
              {/* Y-axis labels */}
              <div className="flex flex-col justify-between py-1 text-[10px] font-mono text-muted-foreground">
                {yAxisLabels.map((label, i) => (
                  <div key={i} className="text-right leading-none">
                    {formatYAxisPrice(label)}
                  </div>
                ))}
              </div>
              
              {/* Chart */}
              <div className="flex-1 relative">
                <svg
                  viewBox="0 0 280 120"
                  className="w-full h-full"
                  preserveAspectRatio="none"
                >
                  {/* Grid lines */}
                  <defs>
                    <linearGradient id={`gradient-${symbol}`} x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor={chartIsPositive ? "hsl(var(--success))" : "hsl(var(--destructive))"} stopOpacity="0.3" />
                      <stop offset="100%" stopColor={chartIsPositive ? "hsl(var(--success))" : "hsl(var(--destructive))"} stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  
                  {/* Horizontal grid lines */}
                  {[0, 1, 2, 3, 4].map((i) => (
                    <line
                      key={i}
                      x1="0"
                      y1={i * 30}
                      x2="280"
                      y2={i * 30}
                      stroke="hsl(var(--muted-foreground))"
                      strokeOpacity="0.1"
                      strokeWidth="1"
                    />
                  ))}
                  
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
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  
                  {/* Current price indicator dot */}
                  {chartData.length > 0 && (
                    <circle
                      cx={280}
                      cy={120 - ((currentPrice - paddedMin) / range) * 120}
                      r="3"
                      fill={chartIsPositive ? "hsl(var(--success))" : "hsl(var(--destructive))"}
                      stroke="white"
                      strokeWidth="1.5"
                    />
                  )}
                </svg>
              </div>
            </div>
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
