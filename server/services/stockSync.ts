import { createMarket, getAllMarkets } from './marketService';
import { createOnChainMarket } from './blockchainSync';
import { getBatchQuotes, POPULAR_STOCKS } from './stockApi';
import { MarketStatus } from '../types/market';
import { updateBlockchainMarketId } from './database';

/**
 * Get current time info in ET timezone
 */
function getETTimeInfo(): { day: number; hour: number; minute: number } {
  const now = new Date();
  
  // Get day of week in ET
  const dayStr = now.toLocaleDateString('en-US', { 
    timeZone: 'America/New_York',
    weekday: 'short'
  });
  const dayMap: { [key: string]: number } = { 'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6 };
  const day = dayMap[dayStr] ?? 0;
  
  // Get hour and minute in ET
  const hourStr = now.toLocaleString('en-US', { 
    timeZone: 'America/New_York',
    hour: 'numeric',
    hour12: false
  });
  const hour = parseInt(hourStr) || 0;
  
  const minuteStr = now.toLocaleString('en-US', { 
    timeZone: 'America/New_York',
    minute: 'numeric'
  });
  const minute = parseInt(minuteStr) || 0;
  
  return { day, hour, minute };
}

/**
 * Check if it's currently a weekend (Saturday or Sunday) in ET
 */
function isWeekend(): boolean {
  const { day } = getETTimeInfo();
  return day === 0 || day === 6; // Sunday = 0, Saturday = 6
}

/**
 * Check if it's Friday after 4 PM ET (weekend market territory)
 */
function isFridayAfternoon(): boolean {
  const { day, hour } = getETTimeInfo();
  return day === 5 && hour >= 16; // Friday after 4 PM
}

/**
 * Determine if we're in a "trading session" (9:30 AM - 4 PM ET) or "overnight session"
 */
function isInTradingSession(): boolean {
  if (isWeekend() || isFridayAfternoon()) return false;
  
  const { day, hour, minute } = getETTimeInfo();
  
  if (day === 0 || day === 6) return false;
  if (hour < 9 || (hour === 9 && minute < 30)) return false;
  if (hour >= 16) return false;
  
  return true;
}

/**
 * Create a Date object for a specific ET time on a given number of days from now
 */
function createETDate(daysFromNow: number, targetHour: number, targetMinute: number): Date {
  const now = new Date();
  
  // Get today's date in ET
  const etDateStr = now.toLocaleDateString('en-US', { 
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  
  // Parse MM/DD/YYYY
  const parts = etDateStr.split('/');
  const month = parseInt(parts[0]);
  const day = parseInt(parts[1]);
  const year = parseInt(parts[2]);
  
  // Create a date for today in ET at the target time
  // We'll use a simple approach: create the date and adjust for ET offset
  const targetDate = new Date(year, month - 1, day + daysFromNow, targetHour, targetMinute, 0, 0);
  
  // Get the offset between local time and ET
  const localTime = new Date();
  const etTimeStr = localTime.toLocaleString('en-US', { timeZone: 'America/New_York' });
  const etTime = new Date(etTimeStr);
  const offsetMs = localTime.getTime() - etTime.getTime();
  
  // Adjust the target date by the offset to get UTC equivalent
  return new Date(targetDate.getTime() + offsetMs);
}

/**
 * Get the next session end time
 * 
 * Session Types:
 * - TRADING: 9:30 AM - 4 PM ET (Mon-Fri) - resolves at market close
 * - OVERNIGHT: 4 PM - 9:30 AM ET (Mon-Thu nights) - resolves at market open
 * - WEEKEND: Friday 4 PM - Monday 9:30 AM ET - resolves at Monday market open
 */
function getNextSessionEnd(): { lockTime: Date; sessionType: 'TRADING' | 'OVERNIGHT' | 'WEEKEND' } {
  const { day, hour } = getETTimeInfo();
  
  // Weekend session: Friday 4 PM through Sunday, resolves Monday 9:30 AM
  if (isFridayAfternoon() || isWeekend()) {
    let daysUntilMonday: number;
    if (day === 5) daysUntilMonday = 3;      // Friday -> Monday
    else if (day === 6) daysUntilMonday = 2; // Saturday -> Monday
    else daysUntilMonday = 1;                 // Sunday -> Monday
    
    const lockTime = createETDate(daysUntilMonday, 9, 30);
    return { lockTime, sessionType: 'WEEKEND' };
  }
  
  // Weekday logic
  if (isInTradingSession()) {
    const lockTime = createETDate(0, 16, 0);
    return { lockTime, sessionType: 'TRADING' };
  } else {
    const daysToAdd = hour >= 16 ? 1 : 0;
    const lockTime = createETDate(daysToAdd, 9, 30);
    return { lockTime, sessionType: 'OVERNIGHT' };
  }
}
/**
 * Main sync function that:
 * 1. Creates prediction markets for popular stocks using batch API
 * 2. Markets run on fixed schedule:
 *    - TRADING: 9:30 AM - 4 PM ET (Mon-Fri)
 *    - OVERNIGHT: 4 PM - 9:30 AM ET (Mon-Thu nights)
 *    - WEEKEND: Friday 4 PM - Monday 9:30 AM ET
 * 3. Runs 24/7 regardless of actual stock market holidays
 */
export async function syncStockMarkets(): Promise<void> {
  console.log('🔄 Starting stock market sync process...');
  
  try {
    const { lockTime, sessionType } = getNextSessionEnd();
    
    console.log(`📊 Session Type: ${sessionType}`);
    console.log(`⏰ Session ends: ${lockTime.toLocaleString()}`);

    // Get existing markets - only skip symbols that have an ACTIVE or LOCKED market
    // This allows new markets to be created after settlement
    const existingMarkets = getAllMarkets();
    const activeSymbols = new Set(
      existingMarkets
        .filter(m => m.status === MarketStatus.ACTIVE || m.status === MarketStatus.LOCKED)
        .map(m => m.stockSymbol.toUpperCase())
    );

    // Only create markets for symbols without an active/locked market
    const stocksToProcess = POPULAR_STOCKS.filter(
      stock => !activeSymbols.has(stock.symbol.toUpperCase())
    );
    
    if (stocksToProcess.length === 0) {
      console.log('ℹ️  All markets already exist, skipping creation\n');
      return;
    }
    
    console.log(`🎯 Creating markets for ${stocksToProcess.length} new stocks...`);

    // Fetch all quotes in ONE API call using batch endpoint
    const symbols = stocksToProcess.map(s => s.symbol);
    console.log(`📡 Fetching batch quotes for: ${symbols.join(', ')}`);
    const quotes = await getBatchQuotes(symbols);

    let created = 0;
    
    for (const stockInfo of stocksToProcess) {
      try {
        const quote = quotes[stockInfo.symbol];
        if (!quote) {
          console.error(`❌ No quote data for ${stockInfo.symbol}, skipping`);
          continue;
        }
        
        await processStockWithQuote(stockInfo, quote, lockTime, sessionType);
        created++;
        
        // Small delay between on-chain transactions (not API related)
        if (created < stocksToProcess.length) {
          await sleep(2000); // 2 seconds between blockchain txs
        }
      } catch (error: any) {
        console.error(`❌ Error processing ${stockInfo.symbol}:`, error.message);
      }
    }

    console.log(`✅ Stock sync completed: ${created} new markets created (1 API call used)\n`);
  } catch (error: any) {
    console.error('❌ Error during stock sync:', error.message);
    console.log('ℹ️  Sync will retry on next scheduled run\n');
  }
}

/**
 * Processes a single stock with pre-fetched quote data
 */
async function processStockWithQuote(
  stockInfo: { symbol: string; name: string },
  quote: { price: number; change: number; changePercent: number },
  lockTime: Date,
  sessionType: 'TRADING' | 'OVERNIGHT' | 'WEEKEND'
): Promise<void> {
  const { symbol, name } = stockInfo;
  console.log(`\n📈 Processing ${symbol} (${name})...`);

  console.log(`💰 Current Price: $${(quote.price).toFixed(2)}`);
  console.log(`📊 Change: ${quote.change >= 0 ? '+' : ''}${quote.change.toFixed(2)} (${quote.changePercent.toFixed(2)}%)`);

  // Use current price as opening price for the market
  const openingPrice = Math.round(quote.price * 100); // Convert to cents
  
  // Calculate hours until lock time
  const now = new Date();
  const hoursUntilLock = (lockTime.getTime() - now.getTime()) / (1000 * 60 * 60);
  const lockHours = Math.max(0.001, hoursUntilLock);
  const settleHours = lockHours + (3 / 3600); // Settle 3 seconds after lock
  
  // Create description based on session type
  const sessionEnd = lockTime.toLocaleTimeString('en-US', { 
    hour: 'numeric', 
    minute: '2-digit',
    timeZone: 'America/New_York'
  });
  
  let description: string;
  let category: string;
  let isAfterHours: boolean;
  
  switch (sessionType) {
    case 'TRADING':
      description = `Will ${symbol} close UP or DOWN from $${(quote.price).toFixed(2)}? Trading session ends at ${sessionEnd} ET.`;
      category = 'Trading Session';
      isAfterHours = false;
      break;
    case 'OVERNIGHT':
      description = `Will ${symbol} open UP or DOWN from $${(quote.price).toFixed(2)}? Overnight session ends at ${sessionEnd} ET.`;
      category = 'Overnight Session';
      isAfterHours = true;
      break;
    case 'WEEKEND':
      description = `Will ${symbol} open UP or DOWN from $${(quote.price).toFixed(2)} on Monday? Weekend market resolves at ${sessionEnd} ET Monday.`;
      category = 'Weekend Market';
      isAfterHours = true;
      break;
  }

  console.log(`⏱️  Lock in ${lockHours.toFixed(2)}h, settle in ${settleHours.toFixed(2)}h`);
  console.log(`📅 Session Type: ${sessionType}`);

  // Create backend market
  const market = createMarket({
    stockSymbol: symbol,
    stockName: name,
    description,
    openingPrice,
    isAfterHours,
    lockHours,
    settleHours,
    category,
  });
  
  // Create on-chain market
  try {
    const blockchainMarketId = await createOnChainMarket(
      symbol,
      openingPrice,
      market.lockTime,
      market.settleTime,
      isAfterHours
    );
    
    if (blockchainMarketId !== null) {
      market.blockchainMarketId = blockchainMarketId;
      console.log(`⛓️  Linked to on-chain market ID: ${blockchainMarketId}`);
      
      // Save blockchain ID to database
      await updateBlockchainMarketId(market.id, blockchainMarketId);
    }
  } catch (error: any) {
    console.error(`⚠️  Could not create on-chain market: ${error.message}`);
    console.log(`ℹ️  Market will work in demo mode only`);
  }

  console.log(`✅ Market created successfully!`);
  console.log(`   Market ID: ${market.id}`);
  console.log(`   Opening Price: $${(openingPrice / 100).toFixed(2)}`);
  console.log(`   Lock Time: ${market.lockTime.toLocaleString()}`);
  console.log(`   Settle Time: ${market.settleTime.toLocaleString()}`);
}

/**
 * Sleep helper
 */
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
