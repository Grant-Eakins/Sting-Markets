import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Loader2 } from 'lucide-react';
import axios from 'axios';

interface StockChartProps {
  stockSymbol: string;
  currentPrice: number; // in cents
  openingPrice: number; // in cents
  isAfterHours: boolean;
}

export function StockChart({ stockSymbol, currentPrice, openingPrice, isAfterHours }: StockChartProps) {
  const [priceHistory, setPriceHistory] = useState<Array<{ time: string; price: number; volume?: number }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hoveredPoint, setHoveredPoint] = useState<{ x: number; y: number; price: number; time: string } | null>(null);
  
  // Convert cents to dollars for display
  const currentPriceUSD = currentPrice / 100;
  const openingPriceUSD = openingPrice / 100;
  
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
        const response = await axios.get(`http://localhost:3001/api/markets/chart/${stockSymbol}`, {
          params: { interval: '5min' }
        });
        
        if (response.data.success && response.data.data && response.data.data.length > 0) {
          // Format the data - API returns newest first, we want oldest first for charting
          const formattedData = response.data.data
            .slice(0, 50) // Last 50 data points for more detail
            .reverse()
            .map((point: any) => ({
              time: point.time,
              price: point.price,
              volume: point.volume,
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

    // Generate mock data as fallback
    const generateMockData = () => {
      const data = [];
      const now = new Date();
      const basePrice = openingPriceUSD;
      
      for (let i = 50; i >= 0; i--) {
        const time = new Date(now.getTime() - i * 5 * 60 * 1000);
        const randomWalk = (Math.random() - 0.5) * (basePrice * 0.015);
        const trend = (currentPriceUSD - basePrice) * ((50 - i) / 50);
        const price = basePrice + randomWalk + trend;
        
        data.push({
          time: time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
          price: Math.max(0, price),
          volume: Math.floor(Math.random() * 1000000),
        });
      }
      return data;
    };

    fetchChartData();
    
    // Refresh chart data every 60 seconds
    const interval = setInterval(fetchChartData, 60000);
    return () => clearInterval(interval);
  }, [stockSymbol, currentPriceUSD, openingPriceUSD]);

  // Calculate chart dimensions - responsive
  const width = 320;
  const height = 160;
  const padding = { top: 15, right: 10, bottom: 25, left: 45 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const prices = priceHistory.map(d => d.price);
  const minPrice = prices.length > 0 ? Math.min(...prices) * 0.999 : openingPriceUSD * 0.98;
  const maxPrice = prices.length > 0 ? Math.max(...prices) * 1.001 : openingPriceUSD * 1.02;
  const priceRange = maxPrice - minPrice || 1;

  // Calculate nice tick values for Y axis
  const getYTicks = () => {
    const tickCount = 4;
    const step = priceRange / (tickCount - 1);
    return Array.from({ length: tickCount }, (_, i) => minPrice + step * i);
  };

  // Create SVG path for line chart
  const createPath = () => {
    if (priceHistory.length === 0) return '';
    
    const xStep = chartWidth / (priceHistory.length - 1);
    
    return priceHistory
      .map((point, i) => {
        const x = padding.left + i * xStep;
        const y = padding.top + chartHeight - ((point.price - minPrice) / priceRange) * chartHeight;
        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
      })
      .join(' ');
  };

  // Create area fill path
  const createAreaPath = () => {
    if (priceHistory.length === 0) return '';
    
    const linePath = createPath();
    const xStep = chartWidth / (priceHistory.length - 1);
    const lastX = padding.left + (priceHistory.length - 1) * xStep;
    
    return `${linePath} L ${lastX} ${padding.top + chartHeight} L ${padding.left} ${padding.top + chartHeight} Z`;
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
    <Card className="p-3 sm:p-4 bg-card/50 backdrop-blur">
      {/* Header with price info - stacks on mobile */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 sm:gap-0 mb-2 sm:mb-3">
        <div className="flex items-center justify-between sm:block">
          <div className="text-xs sm:text-sm text-muted-foreground">{stockSymbol}</div>
          <div className="text-lg sm:text-2xl font-bold">
            ${hoveredPoint ? hoveredPoint.price.toFixed(2) : lastPrice.toFixed(2)}
          </div>
          {hoveredPoint && (
            <div className="text-xs text-muted-foreground">{hoveredPoint.time}</div>
          )}
        </div>
        <div className={`flex items-center gap-1 text-xs sm:text-sm font-medium ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
          {isPositive ? <TrendingUp className="w-3 h-3 sm:w-4 sm:h-4" /> : <TrendingDown className="w-3 h-3 sm:w-4 sm:h-4" />}
          <span>{isPositive ? '+' : ''}{priceChange.toFixed(2)} ({isPositive ? '+' : ''}{priceChangePercent.toFixed(2)}%)</span>
        </div>
      </div>

      <div className="relative mb-2">
        {isLoading ? (
          <div className="flex items-center justify-center h-[140px] sm:h-[160px]">
            <Loader2 className="w-5 h-5 sm:w-6 sm:h-6 animate-spin text-muted-foreground" />
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
                    ${tick.toFixed(2)}
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

      {/* Bottom stats - wrap on mobile */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[10px] sm:text-xs text-muted-foreground">
        <span>Open: ${firstPrice.toFixed(2)}</span>
        <span>High: ${maxPrice.toFixed(2)}</span>
        <span>Low: ${minPrice.toFixed(2)}</span>
        <span className={isAfterHours ? 'text-orange-500' : 'text-green-500'}>
          {isAfterHours ? '🌙 AH' : '📈 Live'}
        </span>
      </div>
    </Card>
  );
}
