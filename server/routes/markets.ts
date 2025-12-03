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
import { syncCryptoMarkets } from '../services/cryptoSync';
import { Position, MarketStatus } from '../types/market';
import { testDiscordWebhook } from '../services/discordBot';
import { getCryptoQuote } from '../services/cryptoApi';

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

export default router;
