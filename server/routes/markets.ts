import express from 'express';
import {
  getActiveMarkets,
  getAllMarkets,
  getMarket,
  createMarket,
  placeBet,
  calculateOdds,
  getUserBetsForMarket,
  getAllUserBets,
  claimWinnings,
  settleMarket,
  updateMarketPools,
  clearAllMarkets,
} from '../services/marketService';
import { createOnChainMarket, syncAllMarketPools, getMarketProbabilities } from '../services/blockchainSync';
import { getCryptoHistory } from '../services/cryptoApi';
import { syncCryptoMarkets, getNext12HourSettlement, disableSymbolAutoCreation, enableSymbolAutoCreation, isSymbolDisabled, getDisabledSymbols } from '../services/cryptoSync';
import { Position, MarketStatus } from '../types/market';
import { testDiscordWebhook } from '../services/discordBot';
import { getCryptoQuote } from '../services/cryptoApi';
import { getTokenByAddress, searchTokens, getTokenHistory } from '../services/dexScreenerApi';

const router = express.Router();

// Chart data cache to reduce API calls (cache for 2 minutes)
const chartCache: Map<string, { data: any; timestamp: number }> = new Map();
const CHART_CACHE_TTL = 2 * 60 * 1000; // 2 minutes

// ETH price cache (2 minutes)
let ethPriceCache: { price: number; timestamp: number } | null = null;
const ETH_PRICE_CACHE_TTL = 2 * 60 * 1000; // 2 minutes

/**
 * GET /api/markets/eth-price
 * Get current ETH price in USD (for USD conversion display)
 */
router.get('/eth-price', async (req, res) => {
  try {
    // Check cache first
    if (ethPriceCache && (Date.now() - ethPriceCache.timestamp) < ETH_PRICE_CACHE_TTL) {
      return res.json({ success: true, price: ethPriceCache.price, cached: true });
    }
    
    const quote = await getCryptoQuote('ETH');
    ethPriceCache = { price: quote.price, timestamp: Date.now() };
    
    res.json({ success: true, price: quote.price, cached: false });
  } catch (error: any) {
    // Return cached price if available, otherwise fallback
    const fallbackPrice = ethPriceCache?.price || 2500;
    res.json({ success: true, price: fallbackPrice, cached: true, fallback: true });
  }
});

/**
 * GET /api/markets/test-discord
 * Test the Discord webhook integration
 */
router.get('/test-discord', async (req, res) => {
  try {
    const success = await testDiscordWebhook();
    res.json({ success, message: success ? 'Test tweet sent to Discord!' : 'Failed - check DISCORD_WEBHOOK_URL' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/markets/chart/:symbol
 * Get historical price data for a crypto symbol
 * Cached for 5 minutes to reduce API calls
 */
router.get('/chart/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { days = '1' } = req.query;
    const cacheKey = `${symbol}-${days}d`;
    
    // Check cache first
    const cached = chartCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < CHART_CACHE_TTL) {
      return res.json({
        success: true,
        symbol,
        days,
        data: cached.data,
        cached: true,
      });
    }
    
    const data = await getCryptoHistory(symbol, parseInt(days as string, 10));
    
    // Store in cache
    chartCache.set(cacheKey, { data, timestamp: Date.now() });
    
    res.json({
      success: true,
      symbol,
      days,
      data,
      cached: false,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/markets/chart-by-contract/:address
 * Get historical price data for a meme coin by contract address
 * Uses DexScreener for price data
 */
router.get('/chart-by-contract/:address', async (req, res) => {
  try {
    const { address } = req.params;
    const { timeframe = '15m' } = req.query;
    
    if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid contract address format',
      });
    }
    
    // Validate timeframe
    const validTimeframes = ['5m', '15m', '1h', '4h', '1d'];
    const tf = validTimeframes.includes(timeframe as string) 
      ? (timeframe as '5m' | '15m' | '1h' | '4h' | '1d') 
      : '15m';
    
    // Check cache
    const cacheKey = `contract-${address}-${tf}`;
    const cached = chartCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < CHART_CACHE_TTL) {
      return res.json({
        success: true,
        address,
        timeframe: tf,
        data: cached.data,
        cached: true,
      });
    }
    
    const data = await getTokenHistory(address, tf);
    
    // Store in cache
    if (data.length > 0) {
      chartCache.set(cacheKey, { data, timestamp: Date.now() });
    }
    
    res.json({
      success: true,
      address,
      timeframe: tf,
      data,
      cached: false,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/markets/create
 * Manually create a new market with on-chain liquidity pool
 * Accepts lockMinutes/settleMinutes for test markets
 */
router.post('/create', async (req, res) => {
  try {
    const { stockSymbol, stockName, description, openingPrice, isAfterHours, lockMinutes, settleMinutes } = req.body;
    
    if (!stockSymbol || openingPrice === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: stockSymbol, openingPrice',
      });
    }
    
    // Calculate lock/settle times from minutes
    const now = new Date();
    const lockTime = new Date(now.getTime() + (lockMinutes || 1) * 60 * 1000);
    const settleTime = new Date(now.getTime() + (settleMinutes || 2) * 60 * 1000);
    
    // Create backend market with direct lock/settle times
    const market = createMarket({
      stockSymbol,
      stockName,
      description: description || `Will ${stockSymbol} go UP or DOWN from $${(openingPrice / 100).toFixed(2)}?`,
      openingPrice,
      isAfterHours: isAfterHours || false,
      lockTime,
      settleTime,
      category: 'Manual',
    });
    
    // Create on-chain market with liquidity pool
    try {
      const blockchainMarketId = await createOnChainMarket(
        stockSymbol,
        openingPrice,
        market.lockTime,
        market.settleTime,
        market.isAfterHours
      );
      
      if (blockchainMarketId !== null) {
        market.blockchainMarketId = blockchainMarketId;
      }
      
      res.json({
        success: true,
        market,
        blockchainMarketId,
        message: `Market created with on-chain pool ID ${blockchainMarketId}`,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: `Failed to create on-chain market: ${error.message}`,
      });
    }
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/markets/token/:address
 * Look up token info by contract address (for Base meme coins)
 */
router.get('/token/:address', async (req, res) => {
  try {
    const { address } = req.params;
    
    if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid contract address format',
      });
    }
    
    const tokenInfo = await getTokenByAddress(address);
    
    if (!tokenInfo) {
      return res.status(404).json({
        success: false,
        error: 'Token not found on DexScreener',
      });
    }
    
    res.json({
      success: true,
      token: tokenInfo,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/markets/search-token
 * Search for tokens by name or symbol on Base chain
 */
router.get('/search-token', async (req, res) => {
  try {
    const { q } = req.query;
    
    if (!q || typeof q !== 'string' || q.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Query must be at least 2 characters',
      });
    }
    
    const tokens = await searchTokens(q);
    
    res.json({
      success: true,
      tokens,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/markets/create-by-contract
 * Create a market for a Base meme coin by contract address
 * Automatically fetches token info from DexScreener
 */
router.post('/create-by-contract', async (req, res) => {
  try {
    const { contractAddress } = req.body;
    
    if (!contractAddress || !/^0x[a-fA-F0-9]{40}$/.test(contractAddress)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid contract address format',
      });
    }
    
    // Use same timing as XRP/crypto markets (12-hour sessions at 00:00/12:00 UTC)
    const { lockTime, settleTime, sessionLabel } = getNext12HourSettlement();
    
    // Fetch token info from DexScreener
    const tokenInfo = await getTokenByAddress(contractAddress);
    
    if (!tokenInfo) {
      return res.status(404).json({
        success: false,
        error: 'Token not found on DexScreener. Make sure it has liquidity on a Base DEX.',
      });
    }
    
    // Check if there's already an active market for this token
    const existingMarkets = getAllMarkets();
    const existingActive = existingMarkets.find(
      m => m.stockSymbol === tokenInfo.symbol && 
           (m.status === MarketStatus.ACTIVE || m.status === MarketStatus.LOCKED)
    );
    
    if (existingActive) {
      return res.status(400).json({
        success: false,
        error: `Active market already exists for ${tokenInfo.symbol}`,
      });
    }
    
    // Convert price to cents (handle very small meme coin prices)
    // For meme coins with tiny prices, we store in "micro-cents" (USD * 100,000,000)
    // The frontend will need to detect this based on price magnitude
    const priceUsd = tokenInfo.price;
    let openingPriceInCents: number;
    let priceDisplay: string;
    
    // Always store as cents (USD * 100) - for tiny prices this gives us precision to $0.01
    // For meme coins, the actual price display will use the raw value
    openingPriceInCents = Math.round(priceUsd * 100);
    
    // If price is too small for cents (< $0.01), store raw USD * 100000000 and mark it
    // Actually, let's just store raw price in a way that works with frontend
    // The frontend divides by 100, so if we want $0.000898 to display correctly,
    // we need to store 0.0898 (so 0.0898 / 100 = 0.000898... wait that's wrong)
    // 
    // Current system: store cents, frontend divides by 100
    // For $0.000898: cents = 0.0898 cents, rounds to 0
    // 
    // New approach: Store raw USD price * 100 (as "centi-dollars")
    // For display, we'll use a special format function that handles tiny prices
    
    if (priceUsd < 0.01) {
      // For tiny prices under 1 cent, store in "nano-dollars" units
      // Store as integer: USD * 100,000,000 (8 decimal precision)
      // Frontend needs to know to divide by 100,000,000 instead of 100
      // We'll use negative sign as a flag (hacky but works without schema change)
      // Actually, let's just store raw cents and handle tiny display in frontend
      openingPriceInCents = Math.round(priceUsd * 100_000_000);
      priceDisplay = `$${priceUsd.toFixed(8)}`;
      console.log(`   ⚠️ Tiny price detected - storing as micro-units: ${openingPriceInCents}`);
    } else {
      openingPriceInCents = Math.round(priceUsd * 100);
      priceDisplay = `$${(openingPriceInCents / 100).toFixed(2)}`;
    }
    
    console.log(`\n🪙 Creating market for Base meme coin: ${tokenInfo.symbol}`);
    console.log(`   Name: ${tokenInfo.name}`);
    console.log(`   Contract: ${contractAddress}`);
    console.log(`   Price: ${priceDisplay}`);
    console.log(`   Liquidity: $${tokenInfo.liquidity.toLocaleString()}`);
    console.log(`   Session: ${sessionLabel}`);
    console.log(`   Locks at: ${lockTime.toISOString()}`);
    if (tokenInfo.imageUrl) console.log(`   Image: ${tokenInfo.imageUrl}`);
    
    // Create the market
    const market = createMarket({
      stockSymbol: tokenInfo.symbol,
      stockName: tokenInfo.name,
      description: `Predict ${tokenInfo.symbol} price movement. Contract: ${contractAddress.slice(0, 10)}...`,
      openingPrice: openingPriceInCents,
      isAfterHours: false,
      lockTime,
      settleTime,
      category: 'meme',
      contractAddress, // Store the contract address for future price lookups
      imageUrl: tokenInfo.imageUrl, // Token logo from DexScreener
    });
    
    // Create on-chain market
    try {
      const blockchainMarketId = await createOnChainMarket(
        tokenInfo.symbol,
        openingPriceInCents,
        market.lockTime,
        market.settleTime,
        false
      );
      
      if (blockchainMarketId !== null) {
        market.blockchainMarketId = blockchainMarketId;
      }
      
      res.json({
        success: true,
        market,
        tokenInfo,
        blockchainMarketId,
        message: `Market created for ${tokenInfo.symbol} with on-chain pool ID ${blockchainMarketId}`,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: `Failed to create on-chain market: ${error.message}`,
      });
    }
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/markets
 * Get all active markets (with fresh blockchain pool data)
 */
router.get('/', async (req, res) => {
  try {
    const { status } = req.query;
    
    const markets = status === 'all' 
      ? getAllMarkets()
      : getActiveMarkets();
    
    // Fetch LMSR probabilities from blockchain for each market
    const marketsWithProbabilities = await Promise.all(
      markets.map(async (market) => {
        if (market.blockchainMarketId !== undefined && market.blockchainMarketId !== null) {
          console.log(`📊 Fetching probabilities for market ${market.stockSymbol} (ID: ${market.blockchainMarketId})`);
          const probabilities = await getMarketProbabilities(market.blockchainMarketId);
          console.log(`   Probabilities:`, probabilities);
          return {
            ...market,
            probabilities: probabilities || undefined,
          };
        }
        return market;
      })
    );
    
    const updatedMarkets = marketsWithProbabilities;
    
    res.json({
      success: true,
      markets: updatedMarkets,
      count: updatedMarkets.length,
    });
  } catch (error: any) {
    console.error('❌ Error in GET /api/markets:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/markets/:id/settle
 * Manually settle a market with closing stock price
 */
router.post('/:id/settle', async (req, res) => {
  try {
    const { closingPrice } = req.body;
    
    if (closingPrice === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: closingPrice',
      });
    }
    
    const market = getMarket(req.params.id);
    
    if (!market) {
      return res.status(404).json({
        success: false,
        error: 'Market not found',
      });
    }
    
    if (market.status === 'SETTLED') {
      return res.status(400).json({
        success: false,
        error: 'Market already settled',
      });
    }
    
    // Use the settleMarket function which handles blockchain settlement
    const result = await settleMarket(req.params.id, closingPrice);
    
    res.json({
      success: true,
      market: getMarket(req.params.id),
      message: `Market settled. Winner: ${result.winningPosition}`,
      settlementResult: result,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/markets/:id/blockchain-id
 * Update the blockchainMarketId for a market (used by sync script)
 */
router.post('/:id/blockchain-id', async (req, res) => {
  try {
    const { blockchainMarketId } = req.body;
    const market = getMarket(req.params.id);
    
    if (!market) {
      return res.status(404).json({
        success: false,
        error: 'Market not found',
      });
    }
    
    // Update in memory
    market.blockchainMarketId = blockchainMarketId;
    
    // Update in database
    const { updateBlockchainMarketId } = await import('../services/database.js');
    await updateBlockchainMarketId(req.params.id, blockchainMarketId);
    
    console.log(`✅ Updated ${market.stockSymbol} blockchainMarketId to ${blockchainMarketId}`);
    
    res.json({
      success: true,
      market,
    });
  } catch (error: any) {
    console.error('Error updating blockchain ID:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/markets/:id
 * Get a specific market with odds
 */
router.get('/:id', (req, res) => {
  try {
    const market = getMarket(req.params.id);
    
    if (!market) {
      return res.status(404).json({
        success: false,
        error: 'Market not found',
      });
    }
    
    const odds = calculateOdds(market);
    
    res.json({
      success: true,
      market,
      odds,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/markets/:id/bet
 * Place a bet on a market
 */
router.post('/:id/bet', (req, res) => {
  try {
    const { position, amount, userAddress } = req.body;
    
    if (!position || !amount || !userAddress) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: position, amount, userAddress',
      });
    }
    
    if (!Object.values(Position).includes(position)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid position. Must be UP or DOWN',
      });
    }
    
    if (amount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Amount must be greater than 0',
      });
    }
    
    const bet = placeBet({
      marketId: req.params.id,
      position,
      amount: parseFloat(amount),
      userAddress,
    });
    
    const market = getMarket(req.params.id);
    const odds = calculateOdds(market!);
    
    res.json({
      success: true,
      bet,
      market,
      odds,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/markets/:id/bets/:userAddress
 * Get user's bets for a specific market
 */
router.get('/:id/bets/:userAddress', (req, res) => {
  try {
    const bets = getUserBetsForMarket(req.params.id, req.params.userAddress);
    
    res.json({
      success: true,
      bets,
      count: bets.length,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/markets/user/:userAddress/bets
 * Get all bets for a user across all markets
 */
router.get('/user/:userAddress/bets', (req, res) => {
  try {
    const bets = getAllUserBets(req.params.userAddress);
    
    // Calculate stats
    const totalStaked = bets.reduce((sum, bet) => sum + bet.amount, 0);
    const settledBets = bets.filter(b => b.settled);
    const wonBets = settledBets.filter(b => b.won);
    const totalWon = wonBets.reduce((sum, bet) => sum + (bet.payout || 0), 0);
    const claimable = wonBets.filter(b => !b.claimed).reduce((sum, bet) => sum + (bet.payout || 0), 0);
    
    res.json({
      success: true,
      bets,
      stats: {
        totalBets: bets.length,
        totalStaked,
        settledBets: settledBets.length,
        wonBets: wonBets.length,
        totalWon,
        claimable,
        winRate: settledBets.length > 0 ? (wonBets.length / settledBets.length) * 100 : 0,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/bets/:betId/claim
 * Claim winnings for a bet
 */
router.post('/bets/:betId/claim', (req, res) => {
  try {
    const { userAddress } = req.body;
    
    if (!userAddress) {
      return res.status(400).json({
        success: false,
        error: 'Missing userAddress',
      });
    }
    
    const payout = claimWinnings(req.params.betId, userAddress);
    
    res.json({
      success: true,
      payout,
      message: `Claimed ${payout} ETH`,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/markets/admin/sync
 * Create new markets for cryptos that don't have active/locked markets
 * Useful for manually triggering market creation after settlement
 */
router.post('/admin/sync', async (req, res) => {
  try {
    // Get count of markets before sync
    const beforeMarkets = getAllMarkets().filter(m => m.status === 'ACTIVE' || m.status === 'LOCKED');
    
    // Sync/create new markets (will skip cryptos with existing active/locked markets)
    await syncCryptoMarkets();
    
    // Get the newly created markets
    const afterMarkets = getAllMarkets().filter(m => m.status === 'ACTIVE' || m.status === 'LOCKED');
    const newCount = afterMarkets.length - beforeMarkets.length;
    
    res.json({
      success: true,
      message: `Created ${newCount} new market(s)`,
      activeMarkets: afterMarkets.length,
      markets: afterMarkets.map(m => ({
        id: m.id,
        symbol: m.stockSymbol,
        status: m.status,
        openingPrice: `$${(m.openingPrice / 100).toFixed(2)}`,
        lockTime: m.lockTime,
      })),
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/markets/admin/reset
 * Clear all markets and create fresh ones with current prices
 * This is useful when markets have stale data
 */
router.post('/admin/reset', async (req, res) => {
  try {
    // Clear all existing markets (from memory AND database)
    const clearedCount = await clearAllMarkets();
    
    // Clear chart cache to force fresh chart data
    chartCache.clear();
    console.log('🗑️ Cleared chart cache');
    
    // Create fresh markets with current prices
    await syncCryptoMarkets();
    
    // Get the newly created markets
    const newMarkets = getAllMarkets();
    
    res.json({
      success: true,
      message: `Cleared ${clearedCount} old markets, created ${newMarkets.length} fresh markets`,
      markets: newMarkets.map(m => ({
        symbol: m.stockSymbol,
        openingPrice: `$${(m.openingPrice / 100).toFixed(2)}`,
        currentPrice: m.currentPrice ? `$${(m.currentPrice / 100).toFixed(2)}` : 'N/A',
      })),
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/markets/admin/test-market
 * Create a 1-minute test market for testing settlement flow
 * Locks in 55 seconds, settles in 60 seconds
 * Creates BOTH off-chain and on-chain market
 */
router.post('/admin/test-market', async (req, res) => {
  try {
    // Get current XRP price
    const quote = await getCryptoQuote('XRP');
    const openingPriceInCents = Math.round(quote.price * 100);
    
    // Set lock time to 55 seconds from now, settle 60 seconds from now
    const now = new Date();
    const lockTime = new Date(now.getTime() + 55 * 1000);
    const settleTime = new Date(now.getTime() + 60 * 1000);
    
    // Create the off-chain market
    const market = createMarket({
      stockSymbol: 'XRP-TEST',
      stockName: 'XRP (1-MIN TEST)',
      description: 'Test market - 1 minute settlement',
      openingPrice: openingPriceInCents,
      isAfterHours: false,
      lockTime,
      settleTime,
    });
    
    // Create on-chain market
    let blockchainMarketId: number | null = null;
    try {
      blockchainMarketId = await createOnChainMarket(
        'XRP-TEST',
        openingPriceInCents,
        lockTime,
        settleTime,
        false // not after hours
      );
      
      if (blockchainMarketId !== null) {
        market.blockchainMarketId = blockchainMarketId;
        console.log(`   ✅ On-chain market created: ID ${blockchainMarketId}`);
      }
    } catch (chainError: any) {
      console.error(`   ⚠️ On-chain creation failed: ${chainError.message}`);
    }
    
    console.log(`🧪 Created 1-minute test market for XRP`);
    console.log(`   Opening price: $${(openingPriceInCents / 100).toFixed(4)}`);
    console.log(`   Locks at: ${lockTime.toISOString()}`);
    console.log(`   Settles at: ${settleTime.toISOString()}`);
    
    res.json({
      success: true,
      message: 'Created 1-minute test market',
      market: {
        id: market.id,
        symbol: market.stockSymbol,
        name: market.stockName,
        openingPrice: `$${(openingPriceInCents / 100).toFixed(4)}`,
        lockTime: lockTime.toISOString(),
        settleTime: settleTime.toISOString(),
        secondsUntilLock: 55,
        secondsUntilSettle: 60,
        blockchainMarketId,
      },
    });
  } catch (error: any) {
    console.error('Error creating test market:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/markets/symbol/:symbol/pause
 * Pause auto-creation for a symbol
 */
router.post('/symbol/:symbol/pause', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  await disableSymbolAutoCreation(symbol);
  res.json({
    success: true,
    message: `Paused auto-creation for ${symbol}`,
    pausedSymbols: getDisabledSymbols(),
  });
});

/**
 * POST /api/markets/symbol/:symbol/resume
 * Resume auto-creation for a symbol
 */
router.post('/symbol/:symbol/resume', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  await enableSymbolAutoCreation(symbol);
  res.json({
    success: true,
    message: `Resumed auto-creation for ${symbol}`,
    pausedSymbols: getDisabledSymbols(),
  });
});

/**
 * GET /api/markets/paused-symbols
 * Get list of all paused symbols
 */
router.get('/paused-symbols', (req, res) => {
  res.json({
    success: true,
    pausedSymbols: getDisabledSymbols(),
  });
});

export default router;
