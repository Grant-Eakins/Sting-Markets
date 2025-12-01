import { getMarketsReadyToSettle, settleMarket, lockExpiredMarkets, getActiveMarkets, updateMarketPrice } from './marketService';
import { getStockQuote, getBatchQuotes } from './stockApi';

/**
 * Updates current stock prices for all active markets using batch API
 * Uses 1 API call for all symbols instead of 1 per symbol
 */
export async function updateActiveMarketPrices(): Promise<void> {
  const activeMarkets = getActiveMarkets();
  
  if (activeMarkets.length === 0) {
    return;
  }
  
  console.log(`📊 Updating prices for ${activeMarkets.length} active markets (batch)...`);
  
  try {
    // Get all unique symbols
    const symbols = [...new Set(activeMarkets.map(m => m.stockSymbol))];
    
    // Fetch all quotes in ONE API call
    const quotes = await getBatchQuotes(symbols);
    
    // Update each market with its quote
    for (const market of activeMarkets) {
      const quote = quotes[market.stockSymbol];
      if (quote) {
        const currentPriceInCents = Math.round(quote.price * 100);
        updateMarketPrice(market.id, currentPriceInCents);
      }
    }
    
    console.log(`✅ Updated ${activeMarkets.length} markets with 1 API call`);
  } catch (error: any) {
    console.error(`Error updating market prices:`, error.message);
  }
}

/**
 * Checks and settles markets that are ready
 * Called periodically by cron job
 */
export async function checkAndSettleMarkets(): Promise<void> {
  console.log('⏰ Checking markets for settlement...');
  
  try {
    // First lock any markets that passed their lock time
    const locked = lockExpiredMarkets();
    if (locked > 0) {
      console.log(`🔒 Locked ${locked} markets`);
    }
    
    // Get markets ready to settle
    const marketsToSettle = getMarketsReadyToSettle();
    
    if (marketsToSettle.length === 0) {
      console.log('ℹ️  No markets ready for settlement');
      return;
    }
    
    console.log(`📊 Found ${marketsToSettle.length} markets ready to settle`);
    
    // Settle each market
    for (const market of marketsToSettle) {
      await settleMarketWithData(market.id, market.stockSymbol);
    }
    
    console.log('✅ Market settlement check completed\n');
  } catch (error: any) {
    console.error('❌ Error during market settlement:', error.message);
  }
}

/**
 * Settles a market by fetching latest stock price
 */
async function settleMarketWithData(marketId: string, stockSymbol: string): Promise<void> {
  try {
    console.log(`\n🏁 Settling market: ${stockSymbol}`);
    
    // Fetch current stock price
    const quote = await getStockQuote(stockSymbol);
    const closingPrice = Math.round(quote.price * 100); // Convert to cents
    
    if (!closingPrice) {
      console.error(`❌ Could not fetch price for "${stockSymbol}"`);
      return;
    }
    
    console.log(`📈 Closing price: $${(closingPrice / 100).toFixed(2)}`);
    
    // Settle the market
    const result = await settleMarket(marketId, closingPrice);
    
    console.log(`✅ Market settled successfully!`);
    console.log(`   Winner: ${result.winningPosition}`);
    console.log(`   Price change: ${result.priceChange >= 0 ? '+' : ''}$${(result.priceChange / 100).toFixed(2)} (${result.priceChangePercent.toFixed(2)}%)`);
    console.log(`   Total payout: ${result.totalPayout.toFixed(4)} ETH`);
    
  } catch (error: any) {
    console.error(`❌ Error settling market ${marketId}:`, error.message);
  }
}

/**
 * Manually settle a specific market (for admin use)
 */
export async function manuallySettleMarket(marketId: string): Promise<void> {
  const market = require('./marketService').getMarket(marketId);
  if (!market) {
    throw new Error('Market not found');
  }
  
  await settleMarketWithData(marketId, market.stockSymbol);
}
