import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, Loader2 } from 'lucide-react';
import axios from 'axios';
import { formatCryptoPrice } from '@/lib/utils';

interface StockChartProps {
  stockSymbol: string;
  currentPrice: number; // in cents (or micro-units for meme coins)
  openingPrice: number; // in cents (or micro-units for meme coins)
  isAfterHours: boolean;
  contractAddress?: string; // For meme coins - uses DexScreener API
  category?: string; // 'meme' for meme coins with tiny prices
}

export function StockChart({ stockSymbol, currentPrice, openingPrice, isAfterHours, contractAddress, category }: StockChartProps) {
  const [priceHistory, setPriceHistory] = useState<Array<{ time: string; price: number; volume?: number }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hoveredPoint, setHoveredPoint] = useState<{ x: number; y: number; price: number; time: string } | null>(null);
  
  // Price handling: meme coins with tiny prices (< $0.01) are stored as micro-units
  const isMicroUnits = category === 'meme' && openingPrice > 1000;
  const priceDivisor = isMicroUnits ? 100_000_000 : 100;
  
  // Convert to dollars for display
  const currentPriceUSD = currentPrice / priceDivisor;
  const openingPriceUSD = openingPrice / priceDivisor;
  
  // Calculate change from chart data if available, otherwise from props
  const firstPrice = priceHistory.length > 0 ? priceHistory[0].price : openingPriceUSD;
  const lastPrice = priceHistory.length > 0 ? priceHistory[priceHistory.length - 1].price : currentPriceUSD;
  const priceChange = lastPrice - firstPrice;
  const priceChangePercent = firstPrice > 0 
    ? ((priceChange / firstPrice) * 100) 
    : 0;
  const isPositive = priceChange >= 0;

  useEffect(() => {
    const fetchChartData = async () => {
      setIsLoading(true);
      try {
        // Use relative URL for production compatibility
        const baseUrl = import.meta.env.PROD ? '' : 'http://localhost:3001';
        
        console.log(`📊 StockChart fetching data for ${stockSymbol}, contractAddress:`, contractAddress);
        
        let response;
        if (contractAddress) {
          // Use DexScreener API for meme coins with contract address
          console.log(`📊 Using DexScreener chart-by-contract for ${stockSymbol}`);
          response = await axios.get(`${baseUrl}/api/markets/chart-by-contract/${contractAddress}`, {
            params: { timeframe: '15m' }
          });
        } else {
          // Use CoinGecko API for known cryptos
          console.log(`📊 Using CoinGecko chart for ${stockSymbol}`);
          response = await axios.get(`${baseUrl}/api/markets/chart/${stockSymbol}`, {
            params: { days: 1 }
          });
        }
        
        if (response.data.success && response.data.data && response.data.data.length > 0) {
          // Both APIs return {timestamp: Date, price: number}
          const formattedData = response.data.data
            .map((point: any) => ({
              time: new Date(point.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
              price: point.price,
              volume: 0,
            }));
          setPriceHistory(formattedData);
        } else {
          // Fallback to mock data if API fails
          setPriceHistory(generateMockData());
        }
      } catch (error) {
        console.error('Failed to fetch chart data:', error);
        // Fallback to mock data
        setPriceHistory(generateMockData());
      } finally {
        setIsLoading(false);
      }
    };

    // Generate smooth mock data as fallback
    const generateMockData = () => {
      const data = [];
      const now = new Date();
      const basePrice = openingPriceUSD;
      const targetPrice = currentPriceUSD;
      const numPoints = 78; // ~6.5 hours of 5-min intervals
      
      // Create a smooth path from opening to current price with realistic noise
      let currentVal = basePrice;
      const overallTrend = (targetPrice - basePrice) / numPoints;
      
      for (let i = 0; i < numPoints; i++) {
        const time = new Date(now.getTime() - (numPoints - 1 - i) * 5 * 60 * 1000);
        
        // Smooth random walk with momentum
        const noise = (Math.random() - 0.5) * basePrice * 0.003; // Small noise
        const momentum = overallTrend * (1 + (Math.random() - 0.5) * 0.5); // Trend with variation
        
        currentVal = currentVal + momentum + noise;
        
        // Keep within reasonable bounds
        const minBound = Math.min(basePrice, targetPrice) * 0.995;
        const maxBound = Math.max(basePrice, targetPrice) * 1.005;
        currentVal = Math.max(minBound, Math.min(maxBound, currentVal));
        
        data.push({
          time: time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
          price: currentVal,
          volume: Math.floor(Math.random() * 1000000),
        });
      }
      
      // Ensure last point matches current price
      if (data.length > 0) {
        data[data.length - 1].price = targetPrice;
      }
      
      return data;
    };

    fetchChartData();
    
    // Refresh chart data every 60 seconds
    const interval = setInterval(fetchChartData, 60000);
    return () => clearInterval(interval);
  }, [stockSymbol, currentPriceUSD, openingPriceUSD, contractAddress]);

  // Calculate chart dimensions - balanced for readability
  const width = 320;
  const height = 140;
  const padding = { top: 10, right: 10, bottom: 20, left: 40 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const prices = priceHistory.map(d => d.price);
  const minPrice = prices.length > 0 ? Math.min(...prices) * 0.998 : openingPriceUSD * 0.98;
  const maxPrice = prices.length > 0 ? Math.max(...prices) * 1.002 : openingPriceUSD * 1.02;
  const priceRange = maxPrice - minPrice || 1;

  // Calculate nice tick values for Y axis - fewer ticks for cleaner look
  const getYTicks = () => {
    const tickCount = 3;
    const step = priceRange / (tickCount - 1);
    return Array.from({ length: tickCount }, (_, i) => minPrice + step * i);
  };

  // Create smooth SVG path using cubic bezier curves
  const createPath = () => {
    if (priceHistory.length === 0) return '';
    if (priceHistory.length === 1) {
      const x = padding.left;
      const y = padding.top + chartHeight / 2;
      return `M ${x} ${y}`;
    }
    
    const xStep = chartWidth / (priceHistory.length - 1);
    const points = priceHistory.map((point, i) => ({
      x: padding.left + i * xStep,
      y: padding.top + chartHeight - ((point.price - minPrice) / priceRange) * chartHeight
    }));
    
    // Start with first point
    let path = `M ${points[0].x} ${points[0].y}`;
    
    // Use smooth cubic bezier curves
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const next = points[i + 1] || curr;
      const prevPrev = points[i - 2] || prev;
      
      // Calculate control points for smooth curve
      const tension = 0.3;
      const cp1x = prev.x + (curr.x - prevPrev.x) * tension;
      const cp1y = prev.y + (curr.y - prevPrev.y) * tension;
      const cp2x = curr.x - (next.x - prev.x) * tension;
      const cp2y = curr.y - (next.y - prev.y) * tension;
      
      path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${curr.x} ${curr.y}`;
    }
    
    return path;
  };

  // Create area fill path using the smooth line
  const createAreaPath = () => {
    if (priceHistory.length === 0) return '';
    
    const linePath = createPath();
    const xStep = chartWidth / (priceHistory.length - 1);
    const lastX = padding.left + (priceHistory.length - 1) * xStep;
    const bottomY = padding.top + chartHeight;
    
    return `${linePath} L ${lastX} ${bottomY} L ${padding.left} ${bottomY} Z`;
  };

  // Get point position for hover
  const getPointPosition = (index: number) => {
    const xStep = chartWidth / (priceHistory.length - 1);
    const point = priceHistory[index];
    const x = padding.left + index * xStep;
    const y = padding.top + chartHeight - ((point.price - minPrice) / priceRange) * chartHeight;
    return { x, y, price: point.price, time: point.time };
  };

  // Handle mouse move on chart
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const relativeX = x - padding.left;
    const xStep = chartWidth / (priceHistory.length - 1);
    const index = Math.round(relativeX / xStep);
    
    if (index >= 0 && index < priceHistory.length) {
      setHoveredPoint(getPointPosition(index));
    }
  };

  return (
    <div className="rounded-lg bg-muted/30 p-2 sm:p-3">
      {/* Header with price info */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="text-lg sm:text-xl font-bold">
            ${hoveredPoint ? formatCryptoPrice(hoveredPoint.price) : formatCryptoPrice(lastPrice)}
          </div>
          {hoveredPoint && (
            <div className="text-[10px] text-muted-foreground">{hoveredPoint.time}</div>
          )}
        </div>
        <div className={`flex items-center gap-1 text-xs sm:text-sm font-medium ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
          {isPositive ? <TrendingUp className="w-3 h-3 sm:w-4 sm:h-4" /> : <TrendingDown className="w-3 h-3 sm:w-4 sm:h-4" />}
          <span>{isPositive ? '+' : ''}{priceChangePercent.toFixed(2)}%</span>
        </div>
      </div>

      {/* Chart area */}
      <div className="relative">
        {isLoading ? (
          <div className="flex items-center justify-center h-[120px]">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <svg 
            viewBox={`0 0 ${width} ${height}`}
            className="w-full h-auto"
            preserveAspectRatio="xMidYMid meet"
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setHoveredPoint(null)}
            onTouchMove={(e) => {
              const touch = e.touches[0];
              const rect = e.currentTarget.getBoundingClientRect();
              const x = touch.clientX - rect.left;
              const scaleX = width / rect.width;
              const relativeX = (x * scaleX) - padding.left;
              const xStep = chartWidth / (priceHistory.length - 1);
              const index = Math.round(relativeX / xStep);
              if (index >= 0 && index < priceHistory.length) {
                setHoveredPoint(getPointPosition(index));
              }
            }}
            onTouchEnd={() => setHoveredPoint(null)}
          >
            {/* Horizontal grid lines */}
            {getYTicks().map((tick, i) => {
              const y = padding.top + chartHeight - ((tick - minPrice) / priceRange) * chartHeight;
              return (
                <g key={i}>
                  <line
                    x1={padding.left}
                    y1={y}
                    x2={width - padding.right}
                    y2={y}
                    stroke="currentColor"
                    strokeOpacity="0.1"
                    strokeDasharray="3,3"
                  />
                  <text
                    x={padding.left - 5}
                    y={y + 3}
                    textAnchor="end"
                    fontSize="9"
                    fill="currentColor"
                    fillOpacity="0.5"
                  >
                    ${formatCryptoPrice(tick)}
                  </text>
                </g>
              );
            })}
            
            {/* Opening price reference line */}
            <line
              x1={padding.left}
              y1={padding.top + chartHeight - ((openingPriceUSD - minPrice) / priceRange) * chartHeight}
              x2={width - padding.right}
              y2={padding.top + chartHeight - ((openingPriceUSD - minPrice) / priceRange) * chartHeight}
              stroke={isPositive ? 'rgb(34, 197, 94)' : 'rgb(239, 68, 68)'}
              strokeOpacity="0.3"
              strokeDasharray="5,5"
            />
            
            {/* Area fill */}
            <path
              d={createAreaPath()}
              fill={isPositive ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)'}
            />
            
            {/* Price line */}
            <path
              d={createPath()}
              fill="none"
              stroke={isPositive ? 'rgb(34, 197, 94)' : 'rgb(239, 68, 68)'}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Data points on hover */}
            {priceHistory.map((_, i) => {
              const pos = getPointPosition(i);
              return (
                <circle
                  key={i}
                  cx={pos.x}
                  cy={pos.y}
                  r={hoveredPoint && Math.abs(hoveredPoint.x - pos.x) < 1 ? 4 : 0}
                  fill={isPositive ? 'rgb(34, 197, 94)' : 'rgb(239, 68, 68)'}
                  stroke="white"
                  strokeWidth="2"
                />
              );
            })}

            {/* Hover crosshair */}
            {hoveredPoint && (
              <>
                <line
                  x1={hoveredPoint.x}
                  y1={padding.top}
                  x2={hoveredPoint.x}
                  y2={padding.top + chartHeight}
                  stroke="currentColor"
                  strokeOpacity="0.3"
                  strokeDasharray="3,3"
                />
                <line
                  x1={padding.left}
                  y1={hoveredPoint.y}
                  x2={width - padding.right}
                  y2={hoveredPoint.y}
                  stroke="currentColor"
                  strokeOpacity="0.3"
                  strokeDasharray="3,3"
                />
              </>
            )}
            
            {/* X-axis time labels */}
            {priceHistory.length > 0 && [0, Math.floor(priceHistory.length / 2), priceHistory.length - 1].map((i) => {
              const xStep = chartWidth / (priceHistory.length - 1);
              const x = padding.left + i * xStep;
              return (
                <text
                  key={i}
                  x={x}
                  y={height - 8}
                  textAnchor="middle"
                  fontSize="9"
                  fill="currentColor"
                  fillOpacity="0.5"
                >
                  {priceHistory[i]?.time?.split(' ')[0] || ''}
                </text>
              );
            })}
          </svg>
        )}
      </div>

      {/* Bottom stats row */}
      <div className="flex items-center justify-between text-[10px] sm:text-xs text-muted-foreground">
        <span>O: ${firstPrice.toFixed(2)}</span>
        <span>H: ${maxPrice.toFixed(2)}</span>
        <span>L: ${minPrice.toFixed(2)}</span>
        <span className={isAfterHours ? 'text-orange-500' : 'text-green-500'}>
          {isAfterHours ? '🌙 AH' : '📈 Live'}
        </span>
      </div>
    </div>
  );
}
