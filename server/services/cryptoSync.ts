import { createMarket, getAllMarkets } from './marketService';
import { createOnChainMarket } from './blockchainSync';
import { getBatchQuotes, POPULAR_CRYPTOS, CryptoQuote } from './cryptoApi';
import { MarketStatus } from '../types/market';
import { updateBlockchainMarketId } from './database';
import { sendOpeningTweets } from './marketSettlement';

/**
 * Get current UTC time info
 */
function getUTCTimeInfo(): { hour: number; minute: number } {
  const now = new Date();
  return {
    hour: now.getUTCHours(),
    minute: now.getUTCMinutes(),
  };
}

/**
 * Get the next 12-hour settlement time
 * Markets settle at 00:00 UTC and 12:00 UTC
 */
function getNext12HourSettlement(): { lockTime: Date; settleTime: Date; sessionLabel: string } {
  const now = new Date();
  const { hour } = getUTCTimeInfo();
  
  // Determine next settlement time (00:00 or 12:00 UTC)
  let settleTime: Date;
  let sessionLabel: string;
  
  if (hour < 12) {
    // Before noon UTC - settle at 12:00 UTC today
    settleTime = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      12, 0, 0, 0
    ));
    sessionLabel = 'AM Session (00:00-12:00 UTC)';
  } else {
    // After noon UTC - settle at 00:00 UTC tomorrow
    const tomorrow = new Date(now);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    settleTime = new Date(Date.UTC(
      tomorrow.getUTCFullYear(),
      tomorrow.getUTCMonth(),
      tomorrow.getUTCDate(),
      0, 0, 0, 0
    ));
    sessionLabel = 'PM Session (12:00-00:00 UTC)';
  }
  
  // Lock time is 30 minutes before settlement
  const lockTime = new Date(settleTime.getTime() - 30 * 60 * 1000);
  
  return { lockTime, settleTime, sessionLabel };
}

/**
 * Process a single crypto with its quote data
 */
async function processCryptoWithQuote(
  cryptoInfo: { symbol: string; name: string },
  quote: CryptoQuote,
  lockTime: Date,
  settleTime: Date,
  sessionLabel: string
): Promise<void> {
  try {
    const openingPriceInCents = Math.round(quote.price * 100);
    
    console.log(`\n📊 Creating market for ${cryptoInfo.symbol}...`);
    console.log(`   Price: $${quote.price.toLocaleString()}`);
    console.log(`   Session: ${sessionLabel}`);
    console.log(`   Settles: ${settleTime.toISOString()}`);

    // Calculate hours until lock/settle
    const now = new Date();
    const lockHours = Math.max(0.5, (lockTime.getTime() - now.getTime()) / (1000 * 60 * 60));
    const settleHours = Math.max(1, (settleTime.getTime() - now.getTime()) / (1000 * 60 * 60));

    // Create the market in our system
    const market = createMarket({
      stockSymbol: cryptoInfo.symbol,
      stockName: cryptoInfo.name,
      description: `Predict ${cryptoInfo.symbol} price at ${settleTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC`,
      openingPrice: openingPriceInCents,
      lockHours,
      settleHours,
      isAfterHours: false,
      category: 'crypto',
    });

    // Override lock/settle times with exact UTC times
    market.lockTime = lockTime;
    market.settleTime = settleTime;

    // Try to create on-chain market
    try {
      console.log(`   Creating on-chain market...`);
      const blockchainMarketId = await createOnChainMarket(
        cryptoInfo.symbol,
        openingPriceInCents,
        lockTime,
        settleTime
      );

      if (blockchainMarketId !== null) {
        market.blockchainMarketId = blockchainMarketId;
        await updateBlockchainMarketId(market.id, blockchainMarketId);
        console.log(`   ✅ On-chain market created: ID ${blockchainMarketId}`);
      }
    } catch (chainError: any) {
      console.error(`   ⚠️ On-chain creation failed: ${chainError.message}`);
      console.log(`   📝 Market exists off-chain only`);
    }

    console.log(`   ✅ Market created: ${market.id}`);

  } catch (error: any) {
    console.error(`❌ Error processing ${cryptoInfo.symbol}:`, error.message);
    throw error;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Main sync function that:
 * 1. Creates prediction markets for top 6 cryptos
 * 2. Markets run on 12-hour cycles (00:00 UTC and 12:00 UTC settlements)
 * 3. Runs 24/7 - crypto never sleeps!
 */
export async function syncCryptoMarkets(): Promise<void> {
  console.log('🔄 Starting crypto market sync process...');
  
  try {
    const { lockTime, settleTime, sessionLabel } = getNext12HourSettlement();
    
    console.log(`📊 Session: ${sessionLabel}`);
    console.log(`⏰ Locks at: ${lockTime.toISOString()}`);
    console.log(`⏰ Settles at: ${settleTime.toISOString()}`);

    // Get existing markets - only skip symbols that have an ACTIVE or LOCKED market
    const existingMarkets = getAllMarkets();
    const activeSymbols = new Set(
      existingMarkets
        .filter(m => m.status === MarketStatus.ACTIVE || m.status === MarketStatus.LOCKED)
        .map(m => m.stockSymbol.toUpperCase())
    );

    // Only create markets for symbols without an active/locked market
    const cryptosToProcess = POPULAR_CRYPTOS.filter(
      crypto => !activeSymbols.has(crypto.symbol.toUpperCase())
    );
    
    if (cryptosToProcess.length === 0) {
      console.log('ℹ️  All crypto markets already exist, skipping creation\n');
      return;
    }
    
    console.log(`🎯 Creating markets for ${cryptosToProcess.length} cryptos...`);

    // Fetch all quotes in ONE API call
    const symbols = cryptosToProcess.map(c => c.symbol);
    console.log(`📡 Fetching quotes for: ${symbols.join(', ')}`);
    const quotes = await getBatchQuotes(symbols);

    let created = 0;
    const createdMarkets: Array<{ stockSymbol: string; stockName: string; openingPrice: number }> = [];
    
    for (const cryptoInfo of cryptosToProcess) {
      try {
        const quote = quotes[cryptoInfo.symbol];
        if (!quote) {
          console.error(`❌ No quote data for ${cryptoInfo.symbol}, skipping`);
          continue;
        }
        
        await processCryptoWithQuote(cryptoInfo, quote, lockTime, settleTime, sessionLabel);
        created++;
        
        createdMarkets.push({
          stockSymbol: cryptoInfo.symbol,
          stockName: cryptoInfo.name,
          openingPrice: Math.round(quote.price * 100),
        });
        
        // Small delay between on-chain transactions
        if (created < cryptosToProcess.length) {
          await sleep(2000);
        }
      } catch (error: any) {
        console.error(`❌ Error processing ${cryptoInfo.symbol}:`, error.message);
      }
    }

    // Send opening tweets for new markets
    if (createdMarkets.length > 0) {
      console.log('\n📢 Sending opening price tweets to Discord...');
      await sendOpeningTweets(createdMarkets);
    }

    console.log(`\n✅ Crypto market sync complete: ${created}/${cryptosToProcess.length} markets created\n`);

  } catch (error: any) {
    console.error('❌ Error during crypto market sync:', error.message);
    throw error;
  }
}

/**
 * Check if we're near a settlement time (within 5 minutes)
 * Used to trigger settlement checks
 */
export function isNearSettlementTime(): boolean {
  const now = new Date();
  const hour = now.getUTCHours();
  const minute = now.getUTCMinutes();
  
  // Near 00:00 UTC or 12:00 UTC (within 5 minutes)
  if (hour === 0 && minute < 5) return true;
  if (hour === 11 && minute >= 55) return true;
  if (hour === 12 && minute < 5) return true;
  if (hour === 23 && minute >= 55) return true;
  
  return false;
}

/**
 * Get time until next settlement in milliseconds
 */
export function getTimeUntilNextSettlement(): number {
  const { settleTime } = getNext12HourSettlement();
  return settleTime.getTime() - Date.now();
}
