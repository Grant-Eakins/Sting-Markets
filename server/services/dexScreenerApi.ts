/**
 * DexScreener API Service
 * For looking up Base meme coins by contract address
 * Free API, no key required
 */

import axios from 'axios';

const DEXSCREENER_BASE_URL = 'https://api.dexscreener.com/latest';

console.log(`📡 DexScreener API: For Base meme coin lookups`);

export interface TokenInfo {
  address: string;
  symbol: string;
  name: string;
  price: number;          // Current price in USD
  priceChange24h: number; // Percent change in 24h
  volume24h: number;
  liquidity: number;
  marketCap?: number;
  chainId: string;
  dexId: string;
  pairAddress: string;
  baseToken: {
    address: string;
    symbol: string;
    name: string;
  };
  quoteToken: {
    address: string;
    symbol: string;
    name: string;
  };
}

// Cache for token lookups
const tokenCache: Map<string, { data: TokenInfo; timestamp: number }> = new Map();
const CACHE_DURATION_MS = 60 * 1000; // 60 seconds cache

/**
 * Get token info by contract address
 * Supports Base chain meme coins
 */
export async function getTokenByAddress(contractAddress: string): Promise<TokenInfo | null> {
  const normalizedAddress = contractAddress.toLowerCase();
  
  // Check cache first
  const cached = tokenCache.get(normalizedAddress);
  if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION_MS) {
    console.log(`📦 Using cached token info for ${normalizedAddress.slice(0, 10)}...`);
    return cached.data;
  }

  try {
    // DexScreener API endpoint for token pairs
    const url = `${DEXSCREENER_BASE_URL}/dex/tokens/${contractAddress}`;
    
    console.log(`📡 Fetching token info from DexScreener for ${contractAddress.slice(0, 10)}...`);
    
    const response = await axios.get(url, { timeout: 10000 });
    const data = response.data;

    if (!data.pairs || data.pairs.length === 0) {
      console.log(`❌ No pairs found for contract ${contractAddress}`);
      return null;
    }

    // Filter for Base chain pairs (chainId: 'base')
    const basePairs = data.pairs.filter((pair: any) => pair.chainId === 'base');
    
    if (basePairs.length === 0) {
      // If no Base pairs, try all pairs but warn
      console.log(`⚠️ No Base chain pairs found, checking other chains...`);
      
      // Use the highest liquidity pair
      const bestPair = data.pairs.sort((a: any, b: any) => 
        (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0)
      )[0];
      
      if (bestPair) {
        return extractTokenInfo(bestPair, contractAddress);
      }
      return null;
    }

    // Sort by liquidity and get the best Base pair
    const bestPair = basePairs.sort((a: any, b: any) => 
      (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0)
    )[0];

    const tokenInfo = extractTokenInfo(bestPair, contractAddress);
    
    // Cache the result
    if (tokenInfo) {
      tokenCache.set(normalizedAddress, { data: tokenInfo, timestamp: Date.now() });
    }
    
    return tokenInfo;

  } catch (error: any) {
    console.error('❌ DexScreener API error:', error.message);
    
    // Return cached data if available (even if stale)
    const cached = tokenCache.get(normalizedAddress);
    if (cached) {
      console.log('⚠️ Using stale cached token info');
      return cached.data;
    }
    
    throw error;
  }
}

/**
 * Extract standardized token info from DexScreener pair data
 */
function extractTokenInfo(pair: any, requestedAddress: string): TokenInfo {
  const normalizedAddress = requestedAddress.toLowerCase();
  
  // Determine which token is the one we're looking for
  const isBaseToken = pair.baseToken.address.toLowerCase() === normalizedAddress;
  const token = isBaseToken ? pair.baseToken : pair.quoteToken;
  
  const priceUsd = parseFloat(pair.priceUsd) || 0;
  const priceChange24h = pair.priceChange?.h24 || 0;
  const volume24h = pair.volume?.h24 || 0;
  const liquidity = pair.liquidity?.usd || 0;
  const fdv = pair.fdv || undefined; // Fully diluted valuation as market cap proxy

  console.log(`   Token: ${token.symbol} (${token.name})`);
  console.log(`   Price: $${priceUsd.toLocaleString(undefined, { minimumFractionDigits: 6, maximumFractionDigits: 6 })}`);
  console.log(`   24h Change: ${priceChange24h >= 0 ? '+' : ''}${priceChange24h}%`);
  console.log(`   Liquidity: $${liquidity.toLocaleString()}`);
  console.log(`   Chain: ${pair.chainId}`);

  return {
    address: token.address,
    symbol: token.symbol,
    name: token.name,
    price: priceUsd,
    priceChange24h,
    volume24h,
    liquidity,
    marketCap: fdv,
    chainId: pair.chainId,
    dexId: pair.dexId,
    pairAddress: pair.pairAddress,
    baseToken: {
      address: pair.baseToken.address,
      symbol: pair.baseToken.symbol,
      name: pair.baseToken.name,
    },
    quoteToken: {
      address: pair.quoteToken.address,
      symbol: pair.quoteToken.symbol,
      name: pair.quoteToken.name,
    },
  };
}

/**
 * Search for tokens by name or symbol on Base chain
 */
export async function searchTokens(query: string): Promise<TokenInfo[]> {
  try {
    const url = `${DEXSCREENER_BASE_URL}/dex/search/?q=${encodeURIComponent(query)}`;
    
    console.log(`🔍 Searching DexScreener for: ${query}`);
    
    const response = await axios.get(url, { timeout: 10000 });
    const data = response.data;

    if (!data.pairs || data.pairs.length === 0) {
      return [];
    }

    // Filter for Base chain and extract unique tokens
    const basePairs = data.pairs.filter((pair: any) => pair.chainId === 'base');
    const seenAddresses = new Set<string>();
    const tokens: TokenInfo[] = [];

    for (const pair of basePairs) {
      const address = pair.baseToken.address.toLowerCase();
      if (!seenAddresses.has(address)) {
        seenAddresses.add(address);
        tokens.push(extractTokenInfo(pair, pair.baseToken.address));
      }
    }

    return tokens.slice(0, 10); // Return top 10 results

  } catch (error: any) {
    console.error('❌ DexScreener search error:', error.message);
    return [];
  }
}

/**
 * Refresh price for a cached token
 */
export async function refreshTokenPrice(contractAddress: string): Promise<number | null> {
  // Force cache invalidation
  tokenCache.delete(contractAddress.toLowerCase());
  
  const tokenInfo = await getTokenByAddress(contractAddress);
  return tokenInfo?.price ?? null;
}

/**
 * Get historical price data for a token by contract address
 * Uses DexScreener's pair chart data
 */
export async function getTokenHistory(
  contractAddress: string, 
  timeframe: '5m' | '15m' | '1h' | '4h' | '1d' = '15m'
): Promise<{ timestamp: Date; price: number }[]> {
  const normalizedAddress = contractAddress.toLowerCase();
  
  try {
    // First, get the token info to find the best pair
    const tokenInfo = await getTokenByAddress(contractAddress);
    
    if (!tokenInfo) {
      console.log(`❌ Token not found for chart: ${contractAddress}`);
      return [];
    }
    
    // DexScreener chart endpoint uses pair address
    const pairAddress = tokenInfo.pairAddress;
    const chainId = tokenInfo.chainId;
    
    // DexScreener provides OHLCV data via their chart endpoint
    // Note: This uses their public chart data endpoint
    const url = `https://io.dexscreener.com/dex/chart/amm/v3/${chainId}/${pairAddress}?q=${timeframe}`;
    
    console.log(`📊 Fetching chart data for ${tokenInfo.symbol} (${timeframe})...`);
    
    const response = await axios.get(url, { 
      timeout: 10000,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; StingMarkets/1.0)',
      }
    });
    
    const data = response.data;
    
    // DexScreener returns bars with [timestamp, open, high, low, close, volume]
    if (!data.bars || !Array.isArray(data.bars)) {
      console.log(`⚠️ No chart bars returned for ${tokenInfo.symbol}`);
      return [];
    }
    
    // Convert to our format (use close price)
    const history = data.bars.map((bar: any) => ({
      timestamp: new Date(bar[0] * 1000), // Convert unix timestamp to Date
      price: parseFloat(bar[4]) || 0,     // Close price
    }));
    
    console.log(`   Got ${history.length} price points for ${tokenInfo.symbol}`);
    
    return history;
    
  } catch (error: any) {
    console.error(`❌ Error fetching chart for ${contractAddress}:`, error.message);
    
    // Fallback: Generate approximate history from 24h data
    try {
      const tokenInfo = await getTokenByAddress(contractAddress);
      if (tokenInfo) {
        return generateApproximateHistory(tokenInfo.price, tokenInfo.priceChange24h);
      }
    } catch {
      // Ignore fallback errors
    }
    
    return [];
  }
}

/**
 * Generate approximate historical data when chart API fails
 * Uses current price and 24h change to create realistic-looking data
 */
function generateApproximateHistory(
  currentPrice: number, 
  priceChange24h: number
): { timestamp: Date; price: number }[] {
  const points = 48; // 30-minute intervals for 24 hours
  const history: { timestamp: Date; price: number }[] = [];
  const now = Date.now();
  
  // Calculate starting price 24h ago
  const startPrice = currentPrice / (1 + priceChange24h / 100);
  const priceRange = currentPrice - startPrice;
  
  for (let i = 0; i < points; i++) {
    const progress = i / (points - 1);
    const timestamp = new Date(now - (24 * 60 * 60 * 1000) * (1 - progress));
    
    // Add some realistic noise
    const noise = (Math.random() - 0.5) * Math.abs(priceRange) * 0.1;
    const trendPrice = startPrice + priceRange * progress;
    const price = Math.max(0, trendPrice + noise);
    
    history.push({ timestamp, price });
  }
  
  // Ensure last point is exactly current price
  if (history.length > 0) {
    history[history.length - 1].price = currentPrice;
  }
  
  return history;
}
