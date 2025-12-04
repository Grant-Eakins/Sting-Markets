import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface ProbabilityDistributionProps {
  stockSymbol: string;
  referencePrice: number; // In cents
  probabilities: number[]; // Array of 22 probabilities (0-1) for intraday
  expectedMovePercent: number; // e.g., 2.37
  impliedFinalPrice: number; // In cents
}

const BUCKET_LABELS = [
  '+10%+', '+9%', '+8%', '+7%', '+6%', '+5%', '+4%', '+3%', '+2%', '+1%', '0%',
  '-1%', '-2%', '-3%', '-4%', '-5%', '-6%', '-7%', '-8%', '-9%', '-10%', '-10%-'
];

export function ProbabilityDistribution({
  stockSymbol,
  referencePrice,
  probabilities,
  expectedMovePercent,
  impliedFinalPrice
}: ProbabilityDistributionProps) {
  const maxProbability = Math.max(...probabilities);
  const mostLikelyOutcome = probabilities.indexOf(maxProbability);
  
  // Calculate chart dimensions
  const chartWidth = 800;
  const chartHeight = 300;
  const numBuckets = probabilities.length || 22;
  const barWidth = chartWidth / numBuckets;
  const padding = 40;
  
  // Generate SVG path for smooth bell curve
  const curvePath = useMemo(() => {
    const points = probabilities.map((prob, i) => {
      const x = padding + (i * barWidth) + (barWidth / 2);
      const y = chartHeight - padding - ((prob / maxProbability) * (chartHeight - 2 * padding));
      return `${x},${y}`;
    });
    
    return `M ${points.join(' L ')}`;
  }, [probabilities, maxProbability, barWidth]);
  
  // Generate area fill path
  const areaPath = useMemo(() => {
    const bottomY = chartHeight - padding;
    const startX = padding + (barWidth / 2);
    const endX = padding + ((numBuckets - 1) * barWidth) + (barWidth / 2);
    
    const points = probabilities.map((prob, i) => {
      const x = padding + (i * barWidth) + (barWidth / 2);
      const y = chartHeight - padding - ((prob / maxProbability) * (chartHeight - 2 * padding));
      return `${x},${y}`;
    });
    
    return `M ${startX},${bottomY} L ${points.join(' L ')} L ${endX},${bottomY} Z`;
  }, [probabilities, maxProbability, barWidth, numBuckets]);
  
  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Crowd Prediction: {stockSymbol}</span>
          <div className="flex items-center gap-2 text-lg">
            {expectedMovePercent >= 0 ? (
              <TrendingUp className="w-5 h-5 text-green-500" />
            ) : (
              <TrendingDown className="w-5 h-5 text-red-500" />
            )}
            <span className={expectedMovePercent >= 0 ? 'text-green-500' : 'text-red-500'}>
              {expectedMovePercent >= 0 ? '+' : ''}{expectedMovePercent.toFixed(2)}%
            </span>
          </div>
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Key Metrics */}
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <div className="text-sm text-muted-foreground">Reference Price</div>
            <div className="text-2xl font-bold">${(referencePrice / 100).toFixed(2)}</div>
          </div>
          <div className="text-center">
            <div className="text-sm text-muted-foreground">Expected Move</div>
            <div className={`text-2xl font-bold ${expectedMovePercent >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {expectedMovePercent >= 0 ? '+' : ''}{expectedMovePercent.toFixed(2)}%
            </div>
          </div>
          <div className="text-center">
            <div className="text-sm text-muted-foreground">Implied Price</div>
            <div className="text-2xl font-bold">${(impliedFinalPrice / 100).toFixed(2)}</div>
          </div>
        </div>
        
        {/* Probability Distribution Chart */}
        <div className="w-full overflow-x-auto">
          <svg
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            className="w-full h-auto"
            style={{ maxHeight: '400px' }}
          >
            {/* Grid lines */}
            {[0, 0.25, 0.5, 0.75, 1].map((fraction, i) => {
              const y = chartHeight - padding - (fraction * (chartHeight - 2 * padding));
              return (
                <g key={i}>
                  <line
                    x1={padding}
                    y1={y}
                    x2={chartWidth - padding}
                    y2={y}
                    stroke="#e5e7eb"
                    strokeWidth="1"
                    strokeDasharray="4 4"
                  />
                  <text
                    x={padding - 10}
                    y={y + 5}
                    textAnchor="end"
                    fontSize="12"
                    fill="#6b7280"
                  >
                    {(fraction * maxProbability * 100).toFixed(0)}%
                  </text>
                </g>
              );
            })}
            
            {/* Area fill under curve */}
            <path
              d={areaPath}
              fill="url(#gradient)"
              opacity="0.3"
            />
            
            {/* Gradient definition */}
            <defs>
              <linearGradient id="gradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor={expectedMovePercent >= 0 ? '#22c55e' : '#ef4444'} />
                <stop offset="100%" stopColor={expectedMovePercent >= 0 ? '#22c55e' : '#ef4444'} stopOpacity="0.1" />
              </linearGradient>
            </defs>
            
            {/* Curve line */}
            <path
              d={curvePath}
              fill="none"
              stroke={expectedMovePercent >= 0 ? '#22c55e' : '#ef4444'}
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            
            {/* Bars */}
            {probabilities.map((prob, i) => {
              const barHeight = (prob / maxProbability) * (chartHeight - 2 * padding);
              const x = padding + (i * barWidth);
              const y = chartHeight - padding - barHeight;
              const isHighlight = i === mostLikelyOutcome;
              
              return (
                <g key={i}>
                  <rect
                    x={x}
                    y={y}
                    width={barWidth - 2}
                    height={barHeight}
                    fill={isHighlight ? (expectedMovePercent >= 0 ? '#22c55e' : '#ef4444') : '#94a3b8'}
                    opacity={isHighlight ? 0.6 : 0.2}
                    rx="2"
                  />
                  
                  {/* Show probability percentage on hover */}
                  <title>{BUCKET_LABELS[i]}: {(prob * 100).toFixed(1)}%</title>
                </g>
              );
            })}
            
            {/* X-axis labels (every 5th bucket) */}
            {BUCKET_LABELS.map((label, i) => {
              if (i % 5 !== 0 && i !== 0 && i !== 22) return null;
              
              const x = padding + (i * barWidth) + (barWidth / 2);
              const y = chartHeight - padding + 20;
              
              return (
                <text
                  key={i}
                  x={x}
                  y={y}
                  textAnchor="middle"
                  fontSize="11"
                  fill="#6b7280"
                >
                  {label}
                </text>
              );
            })}
            
            {/* Most likely outcome indicator */}
            <g>
              <line
                x1={padding + (mostLikelyOutcome * barWidth) + (barWidth / 2)}
                y1={padding}
                x2={padding + (mostLikelyOutcome * barWidth) + (barWidth / 2)}
                y2={chartHeight - padding}
                stroke={expectedMovePercent >= 0 ? '#22c55e' : '#ef4444'}
                strokeWidth="2"
                strokeDasharray="5 5"
                opacity="0.5"
              />
              <text
                x={padding + (mostLikelyOutcome * barWidth) + (barWidth / 2)}
                y={padding - 10}
                textAnchor="middle"
                fontSize="12"
                fontWeight="bold"
                fill={expectedMovePercent >= 0 ? '#22c55e' : '#ef4444'}
              >
                Most Likely: {BUCKET_LABELS[mostLikelyOutcome]}
              </text>
            </g>
          </svg>
        </div>
        
        {/* Interpretation */}
        <div className="p-4 bg-muted rounded-lg text-sm space-y-2">
          <div className="font-semibold">What does this mean?</div>
          <ul className="space-y-1 text-muted-foreground">
            <li>• <strong>Expected Move:</strong> The crowd predicts {stockSymbol} will move{' '}
              <span className={expectedMovePercent >= 0 ? 'text-green-500' : 'text-red-500'}>
                {expectedMovePercent >= 0 ? '+' : ''}{expectedMovePercent.toFixed(2)}%
              </span>
            </li>
            <li>• <strong>Most Likely:</strong> The highest probability is in the{' '}
              <strong>{BUCKET_LABELS[mostLikelyOutcome]}</strong> bucket
            </li>
            <li>• <strong>Implied Price:</strong> If the crowd is right, {stockSymbol} will trade at{' '}
              <strong>${(impliedFinalPrice / 100).toFixed(2)}</strong>
            </li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
