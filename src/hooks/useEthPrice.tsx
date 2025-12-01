import { useState, useEffect } from 'react';

// Cache ETH price for 2 minutes to avoid excessive API calls
let cachedPrice: number | null = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION = 2 * 60 * 1000; // 2 minutes

export function useEthPrice() {
  const [ethPrice, setEthPrice] = useState<number | null>(cachedPrice);
  const [loading, setLoading] = useState(!cachedPrice);

  useEffect(() => {
    const fetchPrice = async () => {
      // Use cache if still valid
      if (cachedPrice && Date.now() - cacheTimestamp < CACHE_DURATION) {
        setEthPrice(cachedPrice);
        setLoading(false);
        return;
      }

      try {
        // Use our backend API to avoid CORS issues
        const baseUrl = import.meta.env.PROD ? '' : 'http://localhost:3001';
        const response = await fetch(`${baseUrl}/api/markets/eth-price`);
        const data = await response.json();
        
        if (data.success && data.price) {
          cachedPrice = data.price;
          cacheTimestamp = Date.now();
          setEthPrice(data.price);
        } else {
          throw new Error('Invalid response');
        }
      } catch (error) {
        console.error('Failed to fetch ETH price:', error);
        // Fallback to approximate price if API fails
        setEthPrice(cachedPrice || 2500);
      } finally {
        setLoading(false);
      }
    };

    fetchPrice();
    
    // Refresh price every minute
    const interval = setInterval(fetchPrice, CACHE_DURATION);
    return () => clearInterval(interval);
  }, []);

  return { ethPrice, loading };
}

/**
 * Format ETH amount to USD string
 */
export function formatEthToUsd(ethAmount: number, ethPrice: number | null): string {
  if (!ethPrice) return '';
  const usdValue = ethAmount * ethPrice;
  
  if (usdValue < 0.01) return '<$0.01';
  if (usdValue < 1) return `$${usdValue.toFixed(2)}`;
  if (usdValue < 1000) return `$${usdValue.toFixed(2)}`;
  return `$${usdValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

/**
 * Component to display ETH with USD equivalent
 */
export function EthWithUsd({ 
  eth, 
  ethPrice,
  className = '',
  showEth = true 
}: { 
  eth: number; 
  ethPrice: number | null;
  className?: string;
  showEth?: boolean;
}) {
  const usd = formatEthToUsd(eth, ethPrice);
  
  if (showEth) {
    return (
      <span className={className}>
        {eth.toFixed(4)} ETH {usd && <span className="text-muted-foreground">({usd})</span>}
      </span>
    );
  }
  
  return <span className={className}>{usd || `${eth.toFixed(4)} ETH`}</span>;
}
