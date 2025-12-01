import { createMarket, getAllMarkets } from './marketService';
import { createOnChainMarket } from './blockchainSync';
import { getStockQuote, POPULAR_STOCKS, isTradingHours, getMarketType } from './stockApi';

/**
 * DEPRECATED: This file is replaced by stockSync.ts
 * Main sync function that:
 * 1. Determines if trading hours or after-hours
 * 2. Creates prediction markets for popular stocks
 * 3. Avoids duplicates by checking existing markets
 */
export async function syncTrends(): Promise<void> {
  console.log('⚠️  WARNING: syncTrends() is deprecated. Use syncStockMarkets() from stockSync.ts instead');
  console.log('🔄 Starting stock market sync process...');
  
  try {
    const marketType = getMarketType();
    const isTrading = isTradingHours();
    console.log(`📊 Market Status: ${marketType.toUpperCase()}`);

    // Get existing markets to avoid duplicates
    const existingMarkets = getAllMarkets();
    const existingSymbols = new Set(existingMarkets.map(m => m.stockSymbol?.toLowerCase() || ''));

    // Step 4: Process stocks (limit to 4 new markets per sync)
    const MAX_NEW_MARKETS = 4;
    let created = 0;
    
    const availableStocks = POPULAR_STOCKS.filter(
      stock => !existingSymbols.has(stock.symbol.toLowerCase())
    );

    if (availableStocks.length > 0) {
      for (const stock of availableStocks.slice(0, MAX_NEW_MARKETS)) {
        try {
          await processStock(stock, isTrading);
          created++;
          
          // Add 3 second delay between creating markets
          if (created < MAX_NEW_MARKETS) {
            await new Promise(resolve => setTimeout(resolve, 3000));
          }
        } catch (error: any) {
          console.error(`❌ Error processing ${stock.symbol}:`, error.message);
        }
      }
    }

    console.log(`✅ Stock sync completed: ${created} new markets created\n`);
  } catch (error: any) {
    console.error('❌ Error during trend sync:', error.message);
    console.log('ℹ️  Sync will retry on next scheduled run\n');
  }
}

/**
 * Processes a single stock:
 * - Gets current stock price
 * - Creates a new prediction market
 */
async function processStock(
  stockInfo: { symbol: string; name: string },
  isTrading: boolean
): Promise<void> {
  const { symbol, name } = stockInfo;
  console.log(`\n📈 Processing ${symbol} (${name})...`);

  try {
    const quote = await getStockQuote(symbol);
    const openingPrice = Math.round(quote.price * 100); // Convert to cents
    
    console.log(`💰 Current Price: $${(quote.price).toFixed(2)}`);

    // Determine timeframes based on trading status
    const lockHours = isTrading ? 2 : 8;
    const settleHours = isTrading ? 3 : 16;
    const description = `Will ${symbol} go UP or DOWN from $${(quote.price).toFixed(2)}?`;

    console.log(`⏱️  Lock in ${lockHours}h, settle in ${settleHours}h`);
    
    // First create backend market
    const market = createMarket({
      stockSymbol: symbol,
      stockName: name,
      description,
      openingPrice,
      isAfterHours: !isTrading,
      lockHours,
      settleHours,
      category: isTrading ? 'Trading Hours' : 'After Hours',
    });
    
    // Then create on-chain market and link them
    try {
      const blockchainMarketId = await createOnChainMarket(
        symbol,
        openingPrice,
        market.lockTime,
        market.settleTime,
        !isTrading
      );
      
      if (blockchainMarketId !== null) {
        market.blockchainMarketId = blockchainMarketId;
        console.log(`⛓️  Linked to on-chain market ID: ${blockchainMarketId}`);
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
  } catch (error: any) {
    console.error(`❌ Error processing stock "${symbol}":`, error.message);
    throw error;
  }
}


