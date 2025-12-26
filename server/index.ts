import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import cron from 'node-cron';
import marketsRouter from './routes/markets';
import { syncCryptoMarkets, initializePausedSymbols } from './services/cryptoSync';
import { checkAndSettleMarkets, updateActiveMarketPrices } from './services/marketSettlement';
import { initializeBlockchain, syncAllMarketPools, syncSettlementStatusFromChain } from './services/blockchainSync';
import { getAllMarkets, updateMarketPools, initializeMarketsFromDb } from './services/marketService';
import { initializeDatabase, cleanupOldSettledMarkets, cleanupDuplicateActiveMarkets } from './services/database';
import { activateScheduledMarkets } from './services/scheduledMarketActivation';

// ES Module dirname workaround
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from root .env file
// When running from root with 'npm run server', the cwd is the project root
dotenv.config();

// Initialize database connection for persistent storage
initializeDatabase();

// Initialize paused symbols from database
initializePausedSymbols();

// Initialize blockchain connection for on-chain market creation
initializeBlockchain();

const app = express();
const PORT = process.env.PORT || 3001;

// Redirect Railway URL to custom domain in production
// Only redirect browser requests, not API calls
app.use((req, res, next) => {
  const host = req.get('host') || '';
  // Only redirect if:
  // 1. Host is the Railway domain (not custom domain)
  // 2. Not an API request
  // 3. Not a health check or internal request
  if (host === 'sting-markets-production.up.railway.app' && 
      !req.path.startsWith('/api/') &&
      !req.path.startsWith('/.well-known/')) {
    return res.redirect(301, `https://www.stingmarkets.com${req.originalUrl}`);
  }
  next();
});

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
  'https://farcaster.xyz',
  'https://warpcast.com',
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
        origin.includes('sting-markets') ||
        origin.includes('farcaster') ||
        origin.includes('warpcast')) {
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
const wellKnownPath = path.join(distPath, '.well-known', 'farcaster.json');
console.log('📁 Serving static files from:', distPath);
console.log('📁 .well-known path:', wellKnownPath);
console.log('📁 .well-known exists:', fs.existsSync(wellKnownPath));

// Serve .well-known as static directory with dotfiles enabled (MUST be first)
app.use('/.well-known', express.static(path.join(distPath, '.well-known'), {
  dotfiles: 'allow',
  setHeaders: (res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=3600');
  }
}));

// Also serve at /well-known (without dot) as fallback
app.get('/well-known/farcaster.json', (req, res) => {
  const filePath = path.join(distPath, '.well-known', 'farcaster.json');
  console.log('📱 Serving farcaster.json (no-dot path) from:', filePath);
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.sendFile(filePath);
});

// Serve images with proper headers for Farcaster embed
app.get('/icon.png', (req, res) => {
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.sendFile(path.join(distPath, 'icon.png'));
});

app.get('/image.png', (req, res) => {
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.sendFile(path.join(distPath, 'image.png'));
});

app.get('/splash.png', (req, res) => {
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.sendFile(path.join(distPath, 'splash.png'));
});

// Static file serving (after explicit routes)
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

// Debug endpoint to check file paths
app.get('/debug/paths', (req, res) => {
  const paths = {
    __dirname,
    cwd: process.cwd(),
    distPath,
    wellKnownExists: fs.existsSync(path.join(distPath, '.well-known', 'farcaster.json')),
    publicWellKnownExists: fs.existsSync(path.join(__dirname, '..', 'public', '.well-known', 'farcaster.json')),
    distExists: fs.existsSync(distPath),
    distContents: fs.existsSync(distPath) ? fs.readdirSync(distPath) : [],
    wellKnownDir: fs.existsSync(path.join(distPath, '.well-known')) ? fs.readdirSync(path.join(distPath, '.well-known')) : 'not found',
  };
  res.json(paths);
});

// Farcaster webhook endpoint
app.post('/api/webhook', (req, res) => {
  console.log('📱 Farcaster webhook received:', JSON.stringify(req.body, null, 2));
  
  // Handle different Farcaster webhook events
  const { event, data } = req.body || {};
  
  switch (event) {
    case 'frame_added':
      console.log(`✅ Frame added by FID: ${data?.fid}`);
      break;
    case 'frame_removed':
      console.log(`❌ Frame removed by FID: ${data?.fid}`);
      break;
    case 'notifications_enabled':
      console.log(`🔔 Notifications enabled by FID: ${data?.fid}`);
      break;
    case 'notifications_disabled':
      console.log(`🔕 Notifications disabled by FID: ${data?.fid}`);
      break;
    default:
      console.log(`📨 Unknown webhook event: ${event}`);
  }
  
  // Always respond with 200 OK to acknowledge receipt
  res.status(200).json({ success: true });
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

// Check for scheduled markets to activate every minute
cron.schedule('* * * * *', async () => {
  try {
    const activated = await activateScheduledMarkets();
    if (activated > 0) {
      console.log(`🚀 Activated ${activated} scheduled market(s)`);
    }
  } catch (error) {
    console.error('Error activating scheduled markets:', error);
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
  
  // Sync settlement status from blockchain (catches manually settled markets)
  console.log('🔄 Syncing settlement status from blockchain...');
  try {
    const allMarkets = getAllMarkets();
    const marketsWithBlockchainId = allMarkets.map(m => ({
      id: m.id,
      blockchainMarketId: m.blockchainMarketId,
      status: Number(m.status)  // Convert enum to number
    }));
    await syncSettlementStatusFromChain(marketsWithBlockchainId);
    
    // Reload markets after sync to get updated statuses
    await initializeMarketsFromDb();
  } catch (error) {
    console.error('⚠️ Error syncing settlement status:', error);
  }
  
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
