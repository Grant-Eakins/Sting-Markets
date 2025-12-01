import { useState, useEffect } from 'react';

// Cache ETH price for 5 minutes to avoid excessive API calls
let cachedPrice: number | null = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

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
        // Use CoinGecko free API (no key needed)
        const response = await fetch(
          'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd'
        );
        const data = await response.json();
        const price = data.ethereum.usd;
        
        cachedPrice = price;
        cacheTimestamp = Date.now();
        setEthPrice(price);
      } catch (error) {
        console.error('Failed to fetch ETH price:', error);
        // Fallback to approximate price if API fails
        setEthPrice(cachedPrice || 2500);
      } finally {
        setLoading(false);
      }
    };

    fetchPrice();
    
    // Refresh price every 5 minutes
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
