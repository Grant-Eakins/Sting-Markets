/**
 * Daily Session Service
 * Manages intraday and overnight prediction market sessions
 * 
 * Intraday: Previous close → Today's 4pm close
 * Overnight: Today's 4pm close → Tomorrow's 9:30am open
 */

import { getStockQuote, POPULAR_STOCKS } from './stockApi';
import {
  MultiOutcomeMarket,
  SessionType,
  MarketStatus,
  OutcomeBucket,
  getBucketBoundaries,
  getNumOutcomes,
  DEFAULT_LIQUIDITY_PARAM
} from '../types/multiOutcome';
import {
  initializeQuantities,
  calculateProbabilities,
  calculateExpectedMove,
  calculateImpliedPrice
} from '../utils/lmsrPricing';

// In-memory storage (replace with database in production)
const markets: Map<string, MultiOutcomeMarket> = new Map();
let nextMarketId = 1;

/**
 * Check if current time is during market hours (9:30 AM - 4:00 PM ET)
 */
export function isTradingHours(): boolean {
  const now = new Date();
  const etTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  
  const hour = etTime.getHours();
  const minute = etTime.getMinutes();
  const dayOfWeek = etTime.getDay(); // 0 = Sunday, 6 = Saturday
  
  // Weekend check
  if (dayOfWeek === 0 || dayOfWeek === 6) return false;
  
  // Before market open (9:30 AM)
  if (hour < 9 || (hour === 9 && minute < 30)) return false;
  
  // After market close (4:00 PM)
  if (hour >= 16) return false;
  
  return true;
}

/**
 * Get current session type based on time
 */
export function getCurrentSessionType(): SessionType {
  return isTradingHours() ? SessionType.INTRADAY : SessionType.OVERNIGHT;
}

/**
 * Get session date (YYYY-MM-DD) for market identification
 */
export function getSessionDate(): string {
  const now = new Date();
  const etTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  
  // If it's before 9:30 AM, this is still the previous day's overnight session
  const hour = etTime.getHours();
  const minute = etTime.getMinutes();
  
  if (hour < 9 || (hour === 9 && minute < 30)) {
    // Use previous day
    etTime.setDate(etTime.getDate() - 1);
  }
  
  return etTime.toISOString().split('T')[0];
}

/**
 * Create a new multi-outcome market for a stock
 */
export function createMultiOutcomeMarket(
  stockSymbol: string,
  stockName: string,
  sessionType: SessionType,
  referencePrice: number, // In cents
  lockTime: Date,
  settleTime: Date
): MultiOutcomeMarket {
  const marketId = `${stockSymbol}-${sessionType}-${getSessionDate()}`;
  
  // Initialize outcome buckets with session-specific boundaries
  const boundaries = getBucketBoundaries(sessionType);
  const numOutcomes = getNumOutcomes(sessionType);
  const outcomes: OutcomeBucket[] = boundaries.map(bucket => ({
    index: bucket.index,
    label: bucket.label,
    minPercent: bucket.min ?? -Infinity,
    maxPercent: bucket.max ?? Infinity,
    midpointPercent: bucket.midpoint,
    quantity: 0,
    probability: 1 / numOutcomes, // Start with uniform distribution
    shares: 0
  }));
  
  const market: MultiOutcomeMarket = {
    id: marketId,
    marketId: nextMarketId++,
    stockSymbol,
    stockName,
    sessionType,
    sessionDate: getSessionDate(),
    status: MarketStatus.ACTIVE,
    referencePrice,
    lockTime,
    settleTime,
    createdAt: new Date(),
    outcomes,
    liquidityParam: DEFAULT_LIQUIDITY_PARAM,
    settled: false,
    totalVolume: 0,
    totalBets: 0,
    uniqueBettors: 0,
    expectedMovePercent: 0, // Uniform distribution ≈ 0 expected move
    impliedFinalPrice: referencePrice
  };
  
  markets.set(marketId, market);
  
  console.log(`✅ Created ${sessionType} market for ${stockSymbol}`);
  console.log(`   Market ID: ${marketId}`);
  console.log(`   Reference Price: $${(referencePrice / 100).toFixed(2)}`);
  console.log(`   Lock: ${lockTime.toLocaleString()}`);
  console.log(`   Settle: ${settleTime.toLocaleString()}`);
  
  return market;
}

/**
 * Create daily markets for all popular stocks
 * Called once per session (intraday or overnight)
 */
export async function createDailyMarkets(): Promise<MultiOutcomeMarket[]> {
  const sessionType = getCurrentSessionType();
  const sessionDate = getSessionDate();
  
  console.log(`\n🔄 Creating ${sessionType} markets for ${sessionDate}...`);
  
  const createdMarkets: MultiOutcomeMarket[] = [];
  
  for (const stock of POPULAR_STOCKS) {
    try {
      // Check if market already exists for this session
      const marketId = `${stock.symbol}-${sessionType}-${sessionDate}`;
      if (markets.has(marketId)) {
        console.log(`⏭️  Market already exists for ${stock.symbol} ${sessionType}`);
        continue;
      }
      
      // Get current stock price
      const quote = await getStockQuote(stock.symbol);
      const referencePrice = Math.round(quote.price * 100); // Convert to cents
      
      // Determine timing based on session type
      const now = new Date();
      let lockTime: Date;
      let settleTime: Date;
      
      if (sessionType === SessionType.INTRADAY) {
        // Lock at 3:45 PM, settle at 4:00 PM
        lockTime = new Date(now);
        lockTime.setHours(15, 45, 0, 0);
        
        settleTime = new Date(now);
        settleTime.setHours(16, 0, 0, 0);
        
        // If it's already past 3:45 PM, create for tomorrow
        if (now > lockTime) {
          lockTime.setDate(lockTime.getDate() + 1);
          settleTime.setDate(settleTime.getDate() + 1);
        }
      } else {
        // Overnight: Lock at 9:20 AM, settle at 9:30 AM (next day)
        lockTime = new Date(now);
        lockTime.setDate(lockTime.getDate() + 1);
        lockTime.setHours(9, 20, 0, 0);
        
        settleTime = new Date(now);
        settleTime.setDate(settleTime.getDate() + 1);
        settleTime.setHours(9, 30, 0, 0);
      }
      
      const market = createMultiOutcomeMarket(
        stock.symbol,
        stock.name,
        sessionType,
        referencePrice,
        lockTime,
        settleTime
      );
      
      createdMarkets.push(market);
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 2000));
      
    } catch (error: any) {
      console.error(`❌ Error creating market for ${stock.symbol}:`, error.message);
    }
  }
  
  console.log(`✅ Created ${createdMarkets.length} ${sessionType} markets\n`);
  
  return createdMarkets;
}

/**
 * Update market probabilities after a bet
 */
export function updateMarketState(marketId: string): void {
  const market = markets.get(marketId);
  if (!market) {
    throw new Error(`Market not found: ${marketId}`);
  }
  
  // Get current quantities
  const quantities = market.outcomes.map(o => o.quantity);
  
  // Calculate new probabilities
  const probabilities = calculateProbabilities(quantities, market.liquidityParam);
  
  // Update each outcome
  market.outcomes.forEach((outcome, i) => {
    outcome.probability = probabilities[i];
  });
  
  // Calculate expected move
  market.expectedMovePercent = calculateExpectedMove(probabilities, market.sessionType);
  
  // Calculate implied final price
  market.impliedFinalPrice = calculateImpliedPrice(
    market.referencePrice,
    market.expectedMovePercent
  );
}

/**
 * Get all active markets
 */
export function getActiveMarkets(): MultiOutcomeMarket[] {
  return Array.from(markets.values()).filter(m => m.status === MarketStatus.ACTIVE);
}

/**
 * Get market by ID
 */
export function getMarket(marketId: string): MultiOutcomeMarket | undefined {
  return markets.get(marketId);
}

/**
 * Get all markets for a specific stock
 */
export function getMarketsByStock(stockSymbol: string): MultiOutcomeMarket[] {
  return Array.from(markets.values()).filter(
    m => m.stockSymbol.toUpperCase() === stockSymbol.toUpperCase()
  );
}

/**
 * Get today's market for a stock and session type
 */
export function getTodaysMarket(
  stockSymbol: string,
  sessionType: SessionType
): MultiOutcomeMarket | undefined {
  const sessionDate = getSessionDate();
  const marketId = `${stockSymbol}-${sessionType}-${sessionDate}`;
  return markets.get(marketId);
}

/**
 * Lock markets that have passed their lock time
 */
export function lockExpiredMarkets(): void {
  const now = new Date();
  let lockedCount = 0;
  
  for (const market of markets.values()) {
    if (market.status === MarketStatus.ACTIVE && now >= market.lockTime) {
      market.status = MarketStatus.LOCKED;
      lockedCount++;
      console.log(`🔒 Locked market ${market.id}`);
    }
  }
  
  if (lockedCount > 0) {
    console.log(`✅ Locked ${lockedCount} markets\n`);
  }
}

/**
 * Settle markets that have passed their settle time
 * This would fetch real prices and determine winners
 */
export async function settleExpiredMarkets(): Promise<void> {
  const now = new Date();
  let settledCount = 0;
  
  for (const market of markets.values()) {
    if (market.status === MarketStatus.LOCKED && now >= market.settleTime && !market.settled) {
      try {
        // Fetch final price
        const quote = await getStockQuote(market.stockSymbol);
        const finalPrice = Math.round(quote.price * 100);
        
        // Determine winning bucket using session-specific ranges
        const priceChangePercent = ((finalPrice - market.referencePrice) / market.referencePrice) * 100;
        const winningOutcome = getWinningOutcome(priceChangePercent, market.sessionType);
        
        market.finalPrice = finalPrice;
        market.winningOutcome = winningOutcome;
        market.settled = true;
        market.status = MarketStatus.SETTLED;
        
        settledCount++;
        
        console.log(`✅ Settled market ${market.id}`);
        console.log(`   Final Price: $${(finalPrice / 100).toFixed(2)}`);
        console.log(`   Price Change: ${priceChangePercent >= 0 ? '+' : ''}${priceChangePercent.toFixed(2)}%`);
        console.log(`   Winning Bucket: ${market.outcomes[winningOutcome].label}`);
        
      } catch (error: any) {
        console.error(`❌ Error settling market ${market.id}:`, error.message);
      }
    }
  }
  
  if (settledCount > 0) {
    console.log(`✅ Settled ${settledCount} markets\n`);
  }
}

/**
 * Helper to determine winning outcome index from price change percentage
 */
function getWinningOutcome(priceChangePercent: number, sessionType: SessionType): number {
  if (sessionType === SessionType.INTRADAY) {
    // Trading hours: ±10% range
    if (priceChangePercent >= 10) return 0;
    if (priceChangePercent >= 9) return 1;
    if (priceChangePercent >= 8) return 2;
    if (priceChangePercent >= 7) return 3;
    if (priceChangePercent >= 6) return 4;
    if (priceChangePercent >= 5) return 5;
    if (priceChangePercent >= 4) return 6;
    if (priceChangePercent >= 3) return 7;
    if (priceChangePercent >= 2) return 8;
    if (priceChangePercent >= 1) return 9;
    if (priceChangePercent >= 0) return 10;
    if (priceChangePercent >= -1) return 11;
    if (priceChangePercent >= -2) return 12;
    if (priceChangePercent >= -3) return 13;
    if (priceChangePercent >= -4) return 14;
    if (priceChangePercent >= -5) return 15;
    if (priceChangePercent >= -6) return 16;
    if (priceChangePercent >= -7) return 17;
    if (priceChangePercent >= -8) return 18;
    if (priceChangePercent >= -9) return 19;
    if (priceChangePercent >= -10) return 20;
    return 22;
  } else {
    // After-hours: ±10% range with 0.5% increments (42 buckets)
    if (priceChangePercent >= 10) return 0;
    if (priceChangePercent >= 9.5) return 1;
    if (priceChangePercent >= 9) return 2;
    if (priceChangePercent >= 8.5) return 3;
    if (priceChangePercent >= 8) return 4;
    if (priceChangePercent >= 7.5) return 5;
    if (priceChangePercent >= 7) return 6;
    if (priceChangePercent >= 6.5) return 7;
    if (priceChangePercent >= 6) return 8;
    if (priceChangePercent >= 5.5) return 9;
    if (priceChangePercent >= 5) return 10;
    if (priceChangePercent >= 4.5) return 11;
    if (priceChangePercent >= 4) return 12;
    if (priceChangePercent >= 3.5) return 13;
    if (priceChangePercent >= 3) return 14;
    if (priceChangePercent >= 2.5) return 15;
    if (priceChangePercent >= 2) return 16;
    if (priceChangePercent >= 1.5) return 17;
    if (priceChangePercent >= 1) return 18;
    if (priceChangePercent >= 0.5) return 19;
    if (priceChangePercent >= 0) return 20;
    if (priceChangePercent >= -0.5) return 21;
    if (priceChangePercent >= -1) return 22;
    if (priceChangePercent >= -1.5) return 23;
    if (priceChangePercent >= -2) return 24;
    if (priceChangePercent >= -2.5) return 25;
    if (priceChangePercent >= -3) return 26;
    if (priceChangePercent >= -3.5) return 27;
    if (priceChangePercent >= -4) return 28;
    if (priceChangePercent >= -4.5) return 29;
    if (priceChangePercent >= -5) return 30;
    if (priceChangePercent >= -5.5) return 31;
    if (priceChangePercent >= -6) return 32;
    if (priceChangePercent >= -6.5) return 33;
    if (priceChangePercent >= -7) return 34;
    if (priceChangePercent >= -7.5) return 35;
    if (priceChangePercent >= -8) return 36;
    if (priceChangePercent >= -8.5) return 37;
    if (priceChangePercent >= -9) return 38;
    if (priceChangePercent >= -9.5) return 39;
    if (priceChangePercent >= -10) return 40;
    return 41;
  }
}

/**
 * Clean up old settled markets (e.g., older than 7 days)
 */
export function cleanupOldMarkets(daysToKeep: number = 7): void {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
  
  let deletedCount = 0;
  
  for (const [marketId, market] of markets.entries()) {
    if (market.settled && market.settleTime < cutoffDate) {
      markets.delete(marketId);
      deletedCount++;
    }
  }
  
  if (deletedCount > 0) {
    console.log(`🗑️  Cleaned up ${deletedCount} old markets`);
  }
}
