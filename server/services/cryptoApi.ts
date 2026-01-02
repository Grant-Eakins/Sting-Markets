/**
 * Crypto Price API Service
 * Using CoinGecko (free, unlimited for basic use)
 * No API key required for basic endpoints
 */

import axios from 'axios';

const COINGECKO_BASE_URL = 'https://api.coingecko.com/api/v3';

console.log(`📡 Crypto API: CoinGecko (free, no rate limits for basic use)`);

export interface CryptoQuote {
  symbol: string;
  name: string;
  price: number;        // Current price in USD
  open: number;         // 24h opening price (approximated)
  high24h: number;      // 24h high
  low24h: number;       // 24h low
  change24h: number;    // Dollar change in 24h
  changePercent24h: number; // Percent change in 24h
  volume24h: number;
  marketCap: number;
  timestamp: Date;
}

/**
 * Top cryptos for prediction markets
 * DISABLED - XRP auto-creation removed
 */
export const POPULAR_CRYPTOS: Array<{ symbol: string; name: string; coingeckoId: string }> = [
  // Auto-creation disabled - use create-by-contract for meme coins instead
  // { symbol: 'XRP', name: 'XRP', coingeckoId: 'ripple' },
  // { symbol: 'BTC', name: 'Bitcoin', coingeckoId: 'bitcoin' },
  // { symbol: 'ETH', name: 'Ethereum', coingeckoId: 'ethereum' },
  // { symbol: 'SOL', name: 'Solana', coingeckoId: 'solana' },
  // { symbol: 'DOGE', name: 'Dogecoin', coingeckoId: 'dogecoin' },
  // { symbol: 'LINK', name: 'Chainlink', coingeckoId: 'chainlink' },
];

// Cache for quotes to reduce API calls
let quotesCache: Record<string, CryptoQuote> = {};
let lastFetchTime = 0;
const CACHE_DURATION_MS = 60 * 1000; // 60 seconds cache (CoinGecko has rate limits)

/**
 * Get quote for a single crypto
 */
export async function getCryptoQuote(symbol: string): Promise<CryptoQuote> {
  const quotes = await getBatchQuotes([symbol]);
  const quote = quotes[symbol];
  if (!quote) {
    throw new Error(`No quote data for ${symbol}`);
  }
  return quote;
}

/**
 * Get quotes for multiple cryptos in one API call
 * CoinGecko allows fetching multiple coins at once
 */
export async function getBatchQuotes(symbols: string[]): Promise<Record<string, CryptoQuote>> {
  const now = Date.now();
  
  // Check cache first
  if (now - lastFetchTime < CACHE_DURATION_MS) {
    const cachedResults: Record<string, CryptoQuote> = {};
    let allCached = true;
    
    for (const symbol of symbols) {
      if (quotesCache[symbol]) {
        cachedResults[symbol] = quotesCache[symbol];
      } else {
        allCached = false;
        break;
      }
    }
    
    if (allCached) {
      return cachedResults;
    }
  }

  // Map symbols to CoinGecko IDs
  const coingeckoIds = symbols.map(symbol => {
    const crypto = POPULAR_CRYPTOS.find(c => c.symbol === symbol);
    return crypto?.coingeckoId;
  }).filter(Boolean);

  if (coingeckoIds.length === 0) {
    console.error('❌ No valid crypto symbols provided');
    return {};
  }

  try {
    const url = `${COINGECKO_BASE_URL}/coins/markets`;
    const params = {
      vs_currency: 'usd',
      ids: coingeckoIds.join(','),
      order: 'market_cap_desc',
      per_page: 10,
      page: 1,
      sparkline: false,
      price_change_percentage: '24h',
    };

    console.log(`📡 Fetching crypto prices for: ${symbols.join(', ')}`);
    
    const response = await axios.get(url, { params, timeout: 10000 });
    const data = response.data;

    const results: Record<string, CryptoQuote> = {};

    for (const coin of data) {
      // Find our symbol for this coingecko id
      const cryptoInfo = POPULAR_CRYPTOS.find(c => c.coingeckoId === coin.id);
      if (!cryptoInfo) continue;

      const price = coin.current_price;
      const change24h = coin.price_change_24h || 0;
      const changePercent24h = coin.price_change_percentage_24h || 0;
      
      // Approximate opening price (24h ago)
      const open = price - change24h;

      const quote: CryptoQuote = {
        symbol: cryptoInfo.symbol,
        name: cryptoInfo.name,
        price,
        open,
        high24h: coin.high_24h || price,
        low24h: coin.low_24h || price,
        change24h,
        changePercent24h,
        volume24h: coin.total_volume || 0,
        marketCap: coin.market_cap || 0,
        timestamp: new Date(),
      };

      results[cryptoInfo.symbol] = quote;
      quotesCache[cryptoInfo.symbol] = quote;
      
      console.log(`   ${cryptoInfo.symbol}: $${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${changePercent24h >= 0 ? '+' : ''}${changePercent24h.toFixed(2)}%)`);
    }

    lastFetchTime = now;
    return results;

  } catch (error: any) {
    console.error('❌ CoinGecko API error:', error.message);
    
    // Return cached data if available
    if (Object.keys(quotesCache).length > 0) {
      console.log('⚠️ Using cached crypto prices');
      const cachedResults: Record<string, CryptoQuote> = {};
      for (const symbol of symbols) {
        if (quotesCache[symbol]) {
          cachedResults[symbol] = quotesCache[symbol];
        }
      }
      return cachedResults;
    }
    
    throw error;
  }
}

/**
 * Get historical price data for charts
 */
export async function getCryptoHistory(symbol: string, days: number = 1): Promise<{ timestamp: Date; price: number }[]> {
  const crypto = POPULAR_CRYPTOS.find(c => c.symbol === symbol);
  if (!crypto) {
    throw new Error(`Unknown crypto symbol: ${symbol}`);
  }

  try {
    const url = `${COINGECKO_BASE_URL}/coins/${crypto.coingeckoId}/market_chart`;
    const params = {
      vs_currency: 'usd',
      days: days,
    };

    const response = await axios.get(url, { params, timeout: 10000 });
    const prices = response.data.prices;

    return prices.map((p: [number, number]) => ({
      timestamp: new Date(p[0]),
      price: p[1],
    }));

  } catch (error: any) {
    console.error(`❌ Error fetching ${symbol} history:`, error.message);
    return [];
  }
}

/**
 * Get the CoinGecko ID for a symbol
 */
export function getCoingeckoId(symbol: string): string | undefined {
  const crypto = POPULAR_CRYPTOS.find(c => c.symbol === symbol);
  return crypto?.coingeckoId;
}
