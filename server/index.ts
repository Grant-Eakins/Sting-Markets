import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import cron from 'node-cron';
import marketsRouter from './routes/markets';
import { syncCryptoMarkets } from './services/cryptoSync';
import { checkAndSettleMarkets, updateActiveMarketPrices } from './services/marketSettlement';
import { initializeBlockchain, syncAllMarketPools } from './services/blockchainSync';
import { getAllMarkets, updateMarketPools, initializeMarketsFromDb } from './services/marketService';
import { initializeDatabase, cleanupOldSettledMarkets, cleanupDuplicateActiveMarkets } from './services/database';

// ES Module dirname workaround
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from root .env file
// When running from root with 'npm run server', the cwd is the project root
dotenv.config();

// Initialize database connection for persistent storage
initializeDatabase();

// Initialize blockchain connection for on-chain market creation
initializeBlockchain();

const app = express();
const PORT = process.env.PORT || 3001;

/**
 * CRYPTO MARKET SCHEDULE
 * ======================
 * 
 * Markets run 24/7 with 12-hour cycles:
 * - Session 1: 00:00 UTC - 12:00 UTC
 * - Session 2: 12:00 UTC - 00:00 UTC
 * 
 * Price updates: Every 2 minutes (CoinGecko is free, no rate limits)
 * Settlement: At 00:00 UTC and 12:00 UTC
 */

// Track price updates for logging
let priceUpdatesCount = 0;
let lastResetDate = new Date().toDateString();

function trackPriceUpdate() {
  const today = new Date().toDateString();
  if (today !== lastResetDate) {
    console.log(`📊 Yesterday's price updates: ${priceUpdatesCount}`);
    priceUpdatesCount = 0;
    lastResetDate = today;
  }
  priceUpdatesCount++;
  if (priceUpdatesCount % 100 === 0) {
    console.log(`📊 Price updates today: ${priceUpdatesCount}`);
  }
}

// Middleware
const allowedOrigins = [
  'http://localhost:8080', 
  'http://localhost:8081', 
  'http://localhost:8082', 
  'http://localhost:8083', 
  'http://localhost:5173',
  process.env.FRONTEND_URL, // For production
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    // In production, also allow Railway domains and common deployment platforms
    if (origin.endsWith('.railway.app') || 
        origin.endsWith('.vercel.app') || 
        origin.endsWith('.netlify.app') ||
        origin.includes('stingmarkets') ||
        origin.includes('sting-markets')) {
      return callback(null, true);
    }
    // Log rejected origins for debugging
    console.log(`⚠️ CORS rejected origin: ${origin}`);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));
app.use(express.json());

// Serve static frontend files in production
const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));

// Routes
app.use('/api/markets', marketsRouter);

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    priceUpdatesToday: priceUpdatesCount,
    mode: 'crypto-24/7'
  });
});

// Schedule market settlement check every 15 minutes
cron.schedule('*/15 * * * *', async () => {
  console.log('Running scheduled market settlement check...');
  try {
    await checkAndSettleMarkets();
  } catch (error) {
    console.error('Error during market settlement:', error);
  }
});

// Update crypto prices every 2 minutes (CoinGecko free tier has rate limits)
cron.schedule('*/2 * * * *', async () => {
  try {
    await updateActiveMarketPrices();
    trackPriceUpdate();
  } catch (error) {
    console.error('Error updating market prices:', error);
  }
});

// Helper function to delay execution
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Settlement and new market creation at 00:00 UTC
cron.schedule('0 0 * * *', async () => {
  console.log(`📊 00:00 UTC - Settling markets and creating new session...`);
  try {
    await updateActiveMarketPrices();
    // Wait 5 seconds for settlement time (settleTime = lockTime + 3s)
    console.log('⏳ Waiting 5 seconds for settlement window...');
    await delay(5000);
    await checkAndSettleMarkets();
    await syncCryptoMarkets();
  } catch (error) {
    console.error('Error at 00:00 UTC settlement:', error);
  }
});

// Settlement and new market creation at 12:00 UTC
cron.schedule('0 12 * * *', async () => {
  console.log(`📊 12:00 UTC - Settling markets and creating new session...`);
  try {
    await updateActiveMarketPrices();
    // Wait 5 seconds for settlement time (settleTime = lockTime + 3s)
    console.log('⏳ Waiting 5 seconds for settlement window...');
    await delay(5000);
    await checkAndSettleMarkets();
    await syncCryptoMarkets();
  } catch (error) {
    console.error('Error at 12:00 UTC settlement:', error);
  }
});

// Clean up old settled markets once per day at midnight ET
// Keeps settled markets for 7 days for user history, then deletes them
cron.schedule('0 0 * * *', async () => {
  console.log('🧹 Running daily cleanup of old settled markets...');
  try {
    await cleanupOldSettledMarkets(7); // Keep for 7 days
  } catch (error) {
    console.error('Error during market cleanup:', error);
  }
}, {
  timezone: 'America/New_York'
});

// Disabled: Multi-outcome markets don't use the old binary pool sync
// The frontend gets probabilities directly from the contract when needed

app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Markets endpoint: http://localhost:${PORT}/api/markets`);
  console.log(`💰 Betting on crypto prices: Pick your bucket!`);
  console.log(`\n🪙 CRYPTO MARKETS (24/7)`);
  console.log(`   • Price updates: Every 2 min (CoinGecko - free)`);
  console.log(`   • Settlement: 00:00 UTC and 12:00 UTC (12-hour cycles)`);
  console.log(`   • Cryptos: BTC, ETH, SOL, XRP, DOGE, LINK`);
  console.log(`✅ Manual market creation: POST /api/markets/create`);
  console.log(`🔗 Each market creates its own on-chain liquidity pool`);
  console.log(`📊 Top 6 cryptos with bonding curve pricing\n`);
  
  // Load existing markets from database
  console.log('📂 Loading markets from database...');
  await initializeMarketsFromDb();
  
  // Clean up any duplicate active markets (can happen if sync runs twice)
  console.log('🧹 Cleaning up duplicate markets...');
  await cleanupDuplicateActiveMarkets();
  
  // Force settle any stale markets and create new ones
  console.log('🌱 Creating crypto markets (if needed)...');
  try {
    // First, settle any markets that should have been settled
    await checkAndSettleMarkets();
    
    // Then create new markets
    await syncCryptoMarkets();
  } catch (error) {
    console.error('Error during initial crypto sync:', error);
  }
});

// Catch-all: serve frontend for client-side routing (must be after API routes)
// Express 5 uses {*path} syntax instead of just *
app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});
