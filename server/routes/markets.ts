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
import { getIntradayData } from '../services/stockApi';
import { syncStockMarkets } from '../services/stockSync';
import { Position, MarketStatus } from '../types/market';

const router = express.Router();

// Chart data cache to reduce API calls (cache for 5 minutes)
const chartCache: Map<string, { data: any; timestamp: number }> = new Map();
const CHART_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * GET /api/markets/chart/:symbol
 * Get intraday chart data for a stock symbol
 * Cached for 5 minutes to reduce API calls
 */
router.get('/chart/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { interval = '5min' } = req.query;
    const cacheKey = `${symbol}-${interval}`;
    
    // Check cache first
    const cached = chartCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < CHART_CACHE_TTL) {
      return res.json({
        success: true,
        symbol,
        interval,
        data: cached.data,
        cached: true,
      });
    }
    
    const data = await getIntradayData(symbol, interval as any);
    
    // Store in cache
    chartCache.set(cacheKey, { data, timestamp: Date.now() });
    
    res.json({
      success: true,
      symbol,
      interval,
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
 */
router.post('/create', async (req, res) => {
  try {
    const { stockSymbol, stockName, description, openingPrice, isAfterHours, lockHours, settleHours } = req.body;
    
    if (!stockSymbol || openingPrice === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: stockSymbol, openingPrice',
      });
    }
    
    // Create backend market
    const market = createMarket({
      stockSymbol,
      stockName,
      description: description || `Will ${stockSymbol} go UP or DOWN from $${(openingPrice / 100).toFixed(2)}?`,
      openingPrice,
      isAfterHours: isAfterHours || false,
      lockHours,
      settleHours,
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
 * Create new markets for symbols that don't have active/locked markets
 * Useful for manually triggering market creation after settlement
 */
router.post('/admin/sync', async (req, res) => {
  try {
    // Get count of markets before sync
    const beforeMarkets = getAllMarkets().filter(m => m.status === 'ACTIVE' || m.status === 'LOCKED');
    
    // Sync/create new markets (will skip symbols with existing active/locked markets)
    await syncStockMarkets();
    
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
    await syncStockMarkets();
    
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

export default router;
