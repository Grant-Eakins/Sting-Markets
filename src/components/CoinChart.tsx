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
  marketOpeningTime?: string; // ISO timestamp when market opened
  openingPrice?: number; // Opening price in USD
}

interface ChartDataPoint {
  timestamp: string;
  price: number;
}

export const CoinChart = ({ name, symbol, growth, tokenAddress, contractAddress, marketOpeningTime, openingPrice }: CoinChartProps) => {
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
    refetchInterval: 15000, // Refresh every 15 seconds for live updates
    staleTime: 10000,
  });

  // Use real data if available, otherwise generate mock data
  const chartData = useMemo(() => {
    if (chartResponse?.data && chartResponse.data.length > 0) {
      // Filter data to only show prices from market opening onwards
      const marketOpenTime = marketOpeningTime ? new Date(marketOpeningTime).getTime() : 0;
      let filteredData = chartResponse.data;
      
      if (marketOpenTime > 0) {
        filteredData = chartResponse.data.filter((point: ChartDataPoint) => {
          const pointTime = new Date(point.timestamp).getTime();
          return pointTime >= marketOpenTime;
        });
        
        // If no data points after market open, start with opening price
        if (filteredData.length === 0 && openingPrice) {
          return [openingPrice, openingPrice];
        }
        
        // Prepend opening price as first point if we have it
        if (openingPrice && filteredData.length > 0) {
          const firstDataPoint = filteredData[0];
          const firstTime = new Date(firstDataPoint.timestamp).getTime();
          // Only add opening price if first data point is after market open
          if (firstTime > marketOpenTime) {
            filteredData = [{ timestamp: marketOpeningTime, price: openingPrice }, ...filteredData];
          }
        }
      }
      
      return filteredData.map((point: ChartDataPoint) => point.price);
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
  const avgValue = (maxValue + minValue) / 2;
  
  // Calculate percentage change to determine appropriate scaling
  const percentChange = avgValue > 0 ? (dataRange / avgValue) * 100 : 0;
  
  let paddedMin: number;
  let paddedMax: number;
  
  if (percentChange < 0.1) {
    // Very small change (< 0.1%) - zoom in significantly
    const zoomRange = avgValue * 0.002; // 0.2% range minimum
    paddedMin = avgValue - zoomRange;
    paddedMax = avgValue + zoomRange;
  } else if (percentChange < 1) {
    // Small change (< 1%) - moderate zoom
    const paddingPercent = 0.5; // 50% padding for visibility
    paddedMin = minValue - dataRange * paddingPercent;
    paddedMax = maxValue + dataRange * paddingPercent;
  } else {
    // Normal change - standard padding
    const paddingPercent = 0.15; // 15% padding
    paddedMin = minValue - dataRange * paddingPercent;
    paddedMax = maxValue + dataRange * paddingPercent;
  }
  
  // Ensure positive range
  paddedMin = Math.max(0, paddedMin);
  
  const range = paddedMax - paddedMin || avgValue * 0.01 || 1; // Avoid division by zero

  // Create SVG path for the chart with smooth curves
  const createPath = () => {
    const width = 300;
    const height = 100;
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
    const width = 300;
    const height = 100;
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
              preserveAspectRatio="xMidYMid meet"
            >
              {/* Gradient and glow definitions */}
              <defs>
                <linearGradient id={`gradient-${symbol}`} x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor={chartIsPositive ? "hsl(var(--success))" : "hsl(var(--destructive))"} stopOpacity="0.3" />
                  <stop offset="100%" stopColor={chartIsPositive ? "hsl(var(--success))" : "hsl(var(--destructive))"} stopOpacity="0" />
                </linearGradient>
                
                {/* Glow filter for orb */}
                <filter id={`glow-${symbol}`} x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
                  <feMerge>
                    <feMergeNode in="coloredBlur"/>
                    <feMergeNode in="SourceGraphic"/>
                  </feMerge>
                </filter>
                
                {/* Strong glow for outer ring */}
                <filter id={`glow-strong-${symbol}`} x="-100%" y="-100%" width="300%" height="300%">
                  <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
                  <feMerge>
                    <feMergeNode in="coloredBlur"/>
                    <feMergeNode in="SourceGraphic"/>
                  </feMerge>
                </filter>
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
              
              {/* Flashing orb at the tip with enhanced effects */}
              {chartData.length > 0 && (() => {
                const width = 300;
                const height = 100;
                const lastIndex = chartData.length - 1;
                const x = (lastIndex / (chartData.length - 1)) * width;
                const y = height - ((chartData[lastIndex] - paddedMin) / range) * height;
                const orbColor = chartIsPositive ? "hsl(var(--success))" : "hsl(var(--destructive))";
                
                return (
                  <g>
                    {/* Outermost expanding ring */}
                    <circle
                      cx={x}
                      cy={y}
                      r="10"
                      fill="none"
                      stroke={orbColor}
                      strokeWidth="2"
                      opacity="0.2"
                      className="animate-ping"
                      filter={`url(#glow-strong-${symbol})`}
                    />
                    
                    {/* Middle pulse ring */}
                    <circle
                      cx={x}
                      cy={y}
                      r="7"
                      fill={orbColor}
                      opacity="0.4"
                      className="animate-pulse"
                      style={{ animationDuration: '1.5s' }}
                      filter={`url(#glow-${symbol})`}
                    />
                    
                    {/* Inner glow layer */}
                    <circle
                      cx={x}
                      cy={y}
                      r="4"
                      fill={orbColor}
                      opacity="0.8"
                      filter={`url(#glow-${symbol})`}
                    />
                    
                    {/* Core bright spot */}
                    <circle
                      cx={x}
                      cy={y}
                      r="2.5"
                      fill="white"
                      opacity="0.9"
                      className="animate-pulse"
                      style={{ animationDuration: '1s' }}
                    />
                  </g>
                );
              })()}
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
