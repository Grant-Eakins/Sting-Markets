/**
 * Stock Price API Service
 * Using Twelve Data (800 calls/day free tier with real-time data)
 * Get free API key at https://twelvedata.com/
 */

import axios from 'axios';

const TWELVE_DATA_API_KEY = process.env.TWELVE_DATA_API_KEY || 'demo';
const TWELVE_DATA_BASE_URL = 'https://api.twelvedata.com';

export interface StockQuote {
  symbol: string;
  price: number;        // Current price in dollars
  open: number;         // Opening price
  high: number;         // Day high
  low: number;          // Day low
  previousClose: number;
  change: number;       // Dollar change
  changePercent: number;
  volume: number;
  timestamp: Date;
}

export interface StockInfo {
  symbol: string;
  name: string;
  exchange: string;
}

/**
 * Top 6 stocks for prediction markets (most popular)
 */
export const POPULAR_STOCKS = [
  { symbol: 'AAPL', name: 'Apple Inc.' },
  { symbol: 'TSLA', name: 'Tesla Inc.' },
  { symbol: 'NVDA', name: 'NVIDIA Corporation' },
  { symbol: 'MSFT', name: 'Microsoft Corporation' },
  { symbol: 'GOOGL', name: 'Alphabet Inc.' },
  { symbol: 'META', name: 'Meta Platforms Inc.' },
];

/**
 * Mock data for development/testing - Updated with current market prices (Nov 2025)
 */
const MOCK_QUOTES: Record<string, StockQuote> = {
  AAPL: {
    symbol: 'AAPL',
    price: 278.85,
    open: 277.50,
    high: 280.00,
    low: 276.80,
    previousClose: 277.55,
    change: 1.30,
    changePercent: 0.47,
    volume: 52340000,
    timestamp: new Date(),
  },
  TSLA: {
    symbol: 'TSLA',
    price: 430.17,
    open: 426.50,
    high: 432.00,
    low: 425.00,
    previousClose: 426.58,
    change: 3.59,
    changePercent: 0.84,
    volume: 98750000,
    timestamp: new Date(),
  },
  NVDA: {
    symbol: 'NVDA',
    price: 177.00,
    open: 180.00,
    high: 181.50,
    low: 175.50,
    previousClose: 180.26,
    change: -3.26,
    changePercent: -1.81,
    volume: 45230000,
    timestamp: new Date(),
  },
  MSFT: {
    symbol: 'MSFT',
    price: 492.01,
    open: 485.50,
    high: 493.50,
    low: 484.00,
    previousClose: 485.50,
    change: 6.51,
    changePercent: 1.34,
    volume: 18500000,
    timestamp: new Date(),
  },
  GOOGL: {
    symbol: 'GOOGL',
    price: 320.17,
    open: 319.90,
    high: 321.50,
    low: 318.50,
    previousClose: 319.95,
    change: 0.22,
    changePercent: 0.07,
    volume: 22100000,
    timestamp: new Date(),
  },
  META: {
    symbol: 'META',
    price: 648.02,
    open: 633.50,
    high: 650.00,
    low: 632.00,
    previousClose: 633.61,
    change: 14.41,
    changePercent: 2.27,
    volume: 12800000,
    timestamp: new Date(),
  },
};

/**
 * Fetches current stock quote using Twelve Data
 * @param symbol Stock ticker symbol (e.g., "AAPL")
 * @returns Current stock price and details
 */
export async function getStockQuote(symbol: string): Promise<StockQuote> {
  try {
    console.log(`📈 Fetching quote for ${symbol}...`);

    // Use mock data in development or if API key is 'demo'
    if (TWELVE_DATA_API_KEY === 'demo' && MOCK_QUOTES[symbol]) {
      console.log('🔄 Using mock quote data for development');
      return MOCK_QUOTES[symbol];
    }

    // Twelve Data quote endpoint
    const response = await axios.get(`${TWELVE_DATA_BASE_URL}/quote`, {
      params: {
        symbol,
        apikey: TWELVE_DATA_API_KEY,
      },
    });

    const data = response.data;
    
    if (data.status === 'error' || !data.close) {
      console.warn(`⚠️  No data for ${symbol}: ${data.message || 'Unknown error'}, using mock data`);
      return MOCK_QUOTES[symbol] || generateMockQuote(symbol);
    }

    const price = parseFloat(data.close);
    
    // Update price cache for chart fallbacks
    latestPriceCache[symbol] = price;

    return {
      symbol,
      price,
      open: parseFloat(data.open),
      high: parseFloat(data.high),
      low: parseFloat(data.low),
      previousClose: parseFloat(data.previous_close),
      change: parseFloat(data.change),
      changePercent: parseFloat(data.percent_change),
      volume: parseInt(data.volume) || 0,
      timestamp: new Date(data.datetime),
    };
  } catch (error: any) {
    console.error(`❌ Error fetching quote for ${symbol}:`, error.message);
    return MOCK_QUOTES[symbol] || generateMockQuote(symbol);
  }
}

/**
 * Cache of latest known prices for each symbol (used for chart fallbacks)
 */
const latestPriceCache: Record<string, number> = {};

/**
 * Update the price cache when we get a real quote
 */
export function updatePriceCache(symbol: string, price: number) {
  latestPriceCache[symbol] = price;
}

/**
 * Fetches intraday price data (for charts)
 * @param symbol Stock ticker symbol
 * @param interval Time interval (1min, 5min, 15min, 30min, 1h)
 * @returns Array of price points
 */
export async function getIntradayData(
  symbol: string,
  interval: '1min' | '5min' | '15min' | '30min' | '1h' = '5min'
): Promise<Array<{ time: string; price: number; volume: number }>> {
  try {
    if (TWELVE_DATA_API_KEY === 'demo') {
      console.log(`🔄 Using mock intraday data for ${symbol}`);
      // Get the current quote to use real price in mock data
      const quote = MOCK_QUOTES[symbol] || generateMockQuote(symbol);
      return generateMockIntradayData(quote.price);
    }

    const response = await axios.get(`${TWELVE_DATA_BASE_URL}/time_series`, {
      params: {
        symbol,
        interval,
        outputsize: 78, // Full trading day at 5min intervals
        apikey: TWELVE_DATA_API_KEY,
      },
    });

    const data = response.data;
    
    if (data.status === 'error' || !data.values) {
      console.warn(`⚠️  No intraday data for ${symbol}: ${data.message || 'Unknown error'}`);
      // Use cached price or fetch fresh quote
      const cachedPrice = latestPriceCache[symbol];
      if (cachedPrice) {
        console.log(`📊 Using cached price for ${symbol} chart: $${cachedPrice.toFixed(2)}`);
        return generateMockIntradayData(cachedPrice);
      }
      // Try to get current quote for realistic mock data
      const quote = await getStockQuote(symbol);
      latestPriceCache[symbol] = quote.price;
      return generateMockIntradayData(quote.price);
    }

    return data.values.map((point: any) => ({
      time: point.datetime,
      price: parseFloat(point.close),
      volume: parseInt(point.volume) || 0,
    }));
  } catch (error: any) {
    console.error(`❌ Error fetching intraday data for ${symbol}:`, error.message);
    // Use cached price as fallback
    const cachedPrice = latestPriceCache[symbol];
    if (cachedPrice) {
      console.log(`📊 Using cached price for ${symbol} chart fallback: $${cachedPrice.toFixed(2)}`);
      return generateMockIntradayData(cachedPrice);
    }
    return generateMockIntradayData(175); // Last resort fallback
  }
}

/**
 * Gets multiple stock quotes at once using Twelve Data batch endpoint
 * More efficient - uses 1 API call for multiple symbols
 */
export async function getBatchQuotes(symbols: string[]): Promise<Record<string, StockQuote>> {
  const quotes: Record<string, StockQuote> = {};
  
  if (TWELVE_DATA_API_KEY === 'demo') {
    console.log('🔄 Using mock batch quotes for development');
    for (const symbol of symbols) {
      quotes[symbol] = MOCK_QUOTES[symbol] || generateMockQuote(symbol);
    }
    return quotes;
  }

  try {
    // Twelve Data supports comma-separated symbols in one call
    const response = await axios.get(`${TWELVE_DATA_BASE_URL}/quote`, {
      params: {
        symbol: symbols.join(','),
        apikey: TWELVE_DATA_API_KEY,
      },
    });

    const data = response.data;
    
    // If single symbol, response is object; if multiple, it's keyed by symbol
    if (symbols.length === 1) {
      const symbol = symbols[0];
      if (data.close) {
        const price = parseFloat(data.close);
        quotes[symbol] = {
          symbol,
          price,
          open: parseFloat(data.open),
          high: parseFloat(data.high),
          low: parseFloat(data.low),
          previousClose: parseFloat(data.previous_close),
          change: parseFloat(data.change),
          changePercent: parseFloat(data.percent_change),
          volume: parseInt(data.volume) || 0,
          timestamp: new Date(data.datetime),
        };
        // Update price cache for chart fallbacks
        latestPriceCache[symbol] = price;
      }
    } else {
      for (const symbol of symbols) {
        const quote = data[symbol];
        if (quote && quote.close) {
          const price = parseFloat(quote.close);
          quotes[symbol] = {
            symbol,
            price,
            open: parseFloat(quote.open),
            high: parseFloat(quote.high),
            low: parseFloat(quote.low),
            previousClose: parseFloat(quote.previous_close),
            change: parseFloat(quote.change),
            changePercent: parseFloat(quote.percent_change),
            volume: parseInt(quote.volume) || 0,
            timestamp: new Date(quote.datetime),
          };
          // Update price cache for chart fallbacks
          latestPriceCache[symbol] = price;
        } else {
          quotes[symbol] = MOCK_QUOTES[symbol] || generateMockQuote(symbol);
        }
      }
    }
  } catch (error: any) {
    console.error(`❌ Error fetching batch quotes:`, error.message);
    for (const symbol of symbols) {
      quotes[symbol] = MOCK_QUOTES[symbol] || generateMockQuote(symbol);
    }
  }
  
  return quotes;
}

/**
 * US Stock Market Holidays for 2025-2026
 */
const US_MARKET_HOLIDAYS = [
  '2025-01-01', '2025-01-20', '2025-02-17', '2025-04-18', '2025-05-26',
  '2025-06-19', '2025-07-04', '2025-09-01', '2025-11-27', '2025-11-28', '2025-12-25',
  '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25',
  '2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25',
];

/**
 * Checks if market is during trading hours (9:30 AM - 4:00 PM ET, Mon-Fri, non-holiday)
 */
export function isTradingHours(): boolean {
  const now = new Date();
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  
  const day = et.getDay();
  const hour = et.getHours();
  const minute = et.getMinutes();
  
  // Weekend
  if (day === 0 || day === 6) return false;
  
  // Holiday check
  const dateStr = et.toISOString().split('T')[0];
  if (US_MARKET_HOLIDAYS.includes(dateStr)) return false;
  
  // Before 9:30 AM
  if (hour < 9 || (hour === 9 && minute < 30)) return false;
  
  // After 4:00 PM
  if (hour >= 16) return false;
  
  return true;
}

/**
 * Determines market type based on current time
 */
export function getMarketType(): 'trading' | 'afterHours' | 'preMarket' {
  const now = new Date();
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  
  const hour = et.getHours();
  const minute = et.getMinutes();
  
  if (isTradingHours()) {
    return 'trading';
  }
  
  // Pre-market: 4:00 AM - 9:30 AM
  if (hour >= 4 && (hour < 9 || (hour === 9 && minute < 30))) {
    return 'preMarket';
  }
  
  // After-hours: 4:00 PM - 8:00 PM
  return 'afterHours';
}

/**
 * Generate mock quote for testing
 */
function generateMockQuote(symbol: string): StockQuote {
  const basePrice = 100 + Math.random() * 400;
  const change = (Math.random() - 0.5) * 10;
  
  return {
    symbol,
    price: basePrice,
    open: basePrice - (Math.random() * 5),
    high: basePrice + (Math.random() * 5),
    low: basePrice - (Math.random() * 5),
    previousClose: basePrice - change,
    change,
    changePercent: (change / basePrice) * 100,
    volume: Math.floor(Math.random() * 100000000),
    timestamp: new Date(),
  };
}

/**
 * Generate mock intraday data with realistic price around basePrice
 */
function generateMockIntradayData(basePrice: number = 175) {
  const data = [];
  let price = basePrice;
  const volatility = basePrice * 0.01; // 1% volatility
  
  for (let i = 0; i < 78; i++) { // Full trading day at 5min intervals
    price += (Math.random() - 0.5) * volatility;
    const hour = 9 + Math.floor(i / 12);
    const minute = (i % 12) * 5;
    
    data.push({
      time: `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`,
      price: Math.max(price, basePrice * 0.9), // Don't go below 90% of base
      volume: Math.floor(Math.random() * 1000000),
    });
  }
  
  return data;
}

/**
 * Sleep helper
 */
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
