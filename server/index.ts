import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import cron from 'node-cron';
import marketsRouter from './routes/markets';
import { syncStockMarkets } from './services/stockSync';
import { checkAndSettleMarkets, updateActiveMarketPrices } from './services/marketSettlement';
import { initializeBlockchain, syncAllMarketPools } from './services/blockchainSync';
import { getAllMarkets, updateMarketPools, initializeMarketsFromDb } from './services/marketService';
import { initializeDatabase, cleanupOldSettledMarkets } from './services/database';

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
 * API BUDGET CALCULATION (Twelve Data: 800 calls/day)
 * ================================================
 * 
 * Reserved calls:
 * - Market open settlement: 1 batch call
 * - Market close settlement: 1 batch call  
 * - New market creation: 6 individual calls (once per session)
 * - Chart data on demand: ~50 calls/day estimated
 * 
 * Remaining for price updates: 800 - 2 - 6 - 50 = ~742 calls
 * 
 * With batch quotes (1 call for all 6 symbols):
 * - 742 updates available
 * - Every 2 minutes = 720 calls/day (30 per hour × 24 hours)
 * 
 * SCHEDULE: Update prices every 2 minutes using batch endpoint
 */

// Track API usage for the day
let apiCallsToday = 0;
let lastResetDate = new Date().toDateString();

function trackApiCall(count: number = 1) {
  const today = new Date().toDateString();
  if (today !== lastResetDate) {
    console.log(`📊 API Usage Reset: ${apiCallsToday} calls yesterday`);
    apiCallsToday = 0;
    lastResetDate = today;
  }
  apiCallsToday += count;
  if (apiCallsToday % 50 === 0) {
    console.log(`📊 API Usage: ${apiCallsToday}/800 calls today`);
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
    // In production, also allow the Railway domain
    if (origin.endsWith('.railway.app')) {
      return callback(null, true);
    }
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

// Health check with API usage stats
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    apiCallsToday,
    apiCallsRemaining: 800 - apiCallsToday
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

// Update stock prices every 2 minutes using batch endpoint (1 API call for all 6 stocks)
// This uses ~720 calls/day, leaving buffer for settlement and chart calls
cron.schedule('*/2 * * * *', async () => {
  try {
    await updateActiveMarketPrices();
    trackApiCall(1); // Batch call counts as 1
  } catch (error) {
    console.error('Error updating market prices:', error);
  }
});

// Get settlement prices and create new markets at market close (4:00 PM ET)
// On Friday, this creates weekend markets that resolve Monday 9:30 AM
cron.schedule('0 16 * * 1-5', async () => {
  const day = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'long' });
  console.log(`📊 Market close (${day}) - fetching settlement prices and creating new markets...`);
  try {
    await updateActiveMarketPrices();
    trackApiCall(1);
    await checkAndSettleMarkets();
    // Create new markets (overnight on Mon-Thu, weekend on Friday)
    await syncStockMarkets();
    trackApiCall(1); // Batch call for new market creation
  } catch (error) {
    console.error('Error at market close:', error);
  }
}, {
  timezone: 'America/New_York'
});

// Get settlement prices and create new markets at market open (9:30 AM ET)
// On Monday, this settles weekend markets and creates new trading session markets
cron.schedule('30 9 * * 1-5', async () => {
  const day = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'long' });
  console.log(`📊 Market open (${day}) - fetching settlement prices and creating new markets...`);
  try {
    await updateActiveMarketPrices();
    trackApiCall(1);
    await checkAndSettleMarkets();
    // Create new markets for the trading session
    await syncStockMarkets();
    trackApiCall(1); // Batch call for new market creation
  } catch (error) {
    console.error('Error at market open:', error);
  }
}, {
  timezone: 'America/New_York'
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
  console.log(`💰 Betting on stock prices: UP or DOWN`);
  console.log(`\n📈 API BUDGET (Twelve Data: 800/day)`);
  console.log(`   • Price updates: Every 2 min (batch) = ~720 calls`);
  console.log(`   • Settlement: 2 batch calls (open + close)`);
  console.log(`   • New markets: 2 batch calls (open + close)`);
  console.log(`   • Charts: ~50 calls reserved (cached 5min)`);
  console.log(`   • Buffer: ~26 calls\n`);
  console.log(`✅ Manual market creation: POST /api/markets/create`);
  console.log(`🔗 Each market creates its own on-chain liquidity pool`);
  console.log(`📊 Showing top 6 stocks only\n`);
  
  // Load existing markets from database
  console.log('📂 Loading markets from database...');
  await initializeMarketsFromDb();
  
  // Create markets for top 6 stocks if they don't exist
  console.log('🌱 Creating markets for top 6 stocks (if needed)...');
  syncStockMarkets().then(() => {
    trackApiCall(1); // Batch call for initial market creation
  }).catch(error => {
    console.error('Error during initial stock sync:', error);
  });
});

// Catch-all: serve frontend for client-side routing (must be after API routes)
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});
