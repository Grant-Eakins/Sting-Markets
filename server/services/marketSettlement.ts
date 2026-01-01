import { getMarketsReadyToSettle, settleMarket, lockExpiredMarkets, getActiveMarkets, updateMarketPrice, getAllMarkets } from './marketService';
import { getCryptoQuote, getBatchQuotes } from './cryptoApi';
import { sendPriceUpdateTweets, sendClosingPriceTweets, sendOpeningPriceTweets } from './discordBot';
import { syncCryptoMarkets } from './cryptoSync';
import { syncSettlementStatusFromChain, settleOnChainMarket } from './blockchainSync';
import { getTokenByAddress } from './dexScreenerApi';
import { saveMarket } from './database';
import { MarketStatus, Position } from '../types/market';
import type { Market } from '../types/market';

// Track last Discord update time to send every 3 hours
let lastDiscordUpdateTime: number = 0;
const THREE_HOURS_MS = 3 * 60 * 60 * 1000; // 3 hours in milliseconds

/**
 * Updates current stock prices for all active markets using batch API
 * Uses 1 API call for all symbols instead of 1 per symbol
 * Sends Discord tweets every 3 hours
 */
export async function updateActiveMarketPrices(): Promise<void> {
  const activeMarkets = getActiveMarkets();
  
  if (activeMarkets.length === 0) {
    return;
  }
  
  console.log(`📊 Updating prices for ${activeMarkets.length} active markets (batch)...`);
  
  try {
    // Separate dual-coin markets from single-coin markets
    const dualCoinMarkets = activeMarkets.filter(m => m.isDualCoin);
    const singleCoinMarkets = activeMarkets.filter(m => !m.isDualCoin);
    
    // Update dual-coin markets
    for (const market of dualCoinMarkets) {
      if (!market.coinAAddress || !market.coinBAddress) continue;
      
      try {
        const [tokenA, tokenB] = await Promise.all([
          getTokenByAddress(market.coinAAddress),
          getTokenByAddress(market.coinBAddress)
        ]);
        
        if (tokenA && tokenB) {
          market.coinACurrentPrice = tokenA.price < 0.01 ? Math.round(tokenA.price * 100_000_000) : Math.round(tokenA.price * 100);
          market.coinBCurrentPrice = tokenB.price < 0.01 ? Math.round(tokenB.price * 100_000_000) : Math.round(tokenB.price * 100);
          await saveMarket(market);
        }
      } catch (error: any) {
        console.error(`❌ Error updating dual-coin market ${market.id}:`, error.message);
      }
    }
    
    // Update single-coin markets in batch
    if (singleCoinMarkets.length > 0) {
      const symbols = [...new Set(singleCoinMarkets.map(m => m.stockSymbol))];
      const quotes = await getBatchQuotes(symbols);
      
      const updatedMarkets = [];
      for (const market of singleCoinMarkets) {
        const quote = quotes[market.stockSymbol];
        if (quote) {
          const currentPriceInCents = Math.round(quote.price * 100);
          updateMarketPrice(market.id, currentPriceInCents);
          
          const priceChange = currentPriceInCents - market.openingPrice;
          const priceChangePercent = (priceChange / market.openingPrice) * 100;
          updatedMarkets.push({
            stockSymbol: market.stockSymbol,
            stockName: market.stockName,
            currentPrice: currentPriceInCents,
            openingPrice: market.openingPrice,
            priceChangePercent,
          });
        }
      }
      
      const now = Date.now();
      if (updatedMarkets.length > 0 && (now - lastDiscordUpdateTime) >= THREE_HOURS_MS) {
        console.log('📢 Sending 3-hour price update tweets to Discord...');
        await sendPriceUpdateTweets(updatedMarkets);
        lastDiscordUpdateTime = now;
      }
      
      console.log(`✅ Updated ${singleCoinMarkets.length} single-coin markets with batch API`);
    }
    
    if (dualCoinMarkets.length > 0) {
      console.log(`✅ Updated ${dualCoinMarkets.length} dual-coin markets`);
    }
  } catch (error: any) {
    console.error(`Error updating market prices:`, error.message);
  }
}

/**
 * Send opening price tweets when new markets are created
 */
export async function sendOpeningTweets(markets: Array<{ stockSymbol: string; stockName?: string; openingPrice: number }>) {
  const marketData = markets.map(m => ({
    stockSymbol: m.stockSymbol,
    stockName: m.stockName,
    currentPrice: m.openingPrice,
    openingPrice: m.openingPrice,
    priceChangePercent: 0,
  }));
  
  await sendOpeningPriceTweets(marketData);
  lastDiscordUpdateTime = Date.now(); // Reset timer after opening tweets
}

/**
 * Checks and settles markets that are ready
 * Called periodically by cron job
 */
export async function checkAndSettleMarkets(): Promise<void> {
  console.log('⏰ Checking markets for settlement...');
  
  try {
    // First, sync settlement status from blockchain (catches manually settled markets)
    const allMarkets = getAllMarkets();
    const marketsWithBlockchainId = allMarkets.map(m => ({
      id: m.id,
      blockchainMarketId: m.blockchainMarketId,
      status: Number(m.status)  // Convert enum to number
    }));
    const synced = await syncSettlementStatusFromChain(marketsWithBlockchainId);
    
    // First lock any markets that passed their lock time
    const locked = lockExpiredMarkets();
    if (locked > 0) {
      console.log(`🔒 Locked ${locked} markets`);
    }
    
    // Get markets ready to settle
    const marketsToSettle = getMarketsReadyToSettle();
    
    if (marketsToSettle.length === 0) {
      // Even if no markets to settle, we may have synced some from blockchain
      // So try to create new markets for any newly-settled symbols
      if (synced > 0) {
        console.log('🔄 Creating new markets for synced settled symbols...');
        try {
          await syncCryptoMarkets();
        } catch (syncError: any) {
          console.error('⚠️ Error creating new markets:', syncError.message);
        }
      }
      console.log('ℹ️  No markets ready for settlement');
      return;
    }
    
    console.log(`📊 Found ${marketsToSettle.length} markets ready to settle`);
    
    // Collect settled market data for Discord
    const settledMarkets = [];
    
    // Settle each market
    for (const market of marketsToSettle) {
      let result;
      if (market.isDualCoin) {
        result = await settleDualCoinMarket(market);
      } else {
        result = await settleMarketWithData(market.id, market.stockSymbol, market.openingPrice);
      }
      if (result) {
        settledMarkets.push(result);
      }
    }
    
    // Send closing price tweets to Discord
    if (settledMarkets.length > 0) {
      console.log('📢 Sending closing price tweets to Discord...');
      await sendClosingPriceTweets(settledMarkets);
      
      // Automatically create new markets for settled symbols
      console.log('🔄 Creating new markets for settled symbols...');
      try {
        await syncCryptoMarkets();
      } catch (syncError: any) {
        console.error('⚠️ Error creating new markets:', syncError.message);
      }
    }
    
    console.log('✅ Market settlement check completed\n');
  } catch (error: any) {
    console.error('❌ Error during market settlement:', error.message);
  }
}

/**
 * Settle a dual-coin head-to-head market by comparing percentage changes
 */
async function settleDualCoinMarket(market: Market): Promise<any> {
  if (!market.isDualCoin || !market.coinAAddress || !market.coinBAddress) {
    throw new Error('Not a dual-coin market');
  }
  
  console.log(`\n⚔️ Settling dual-coin market: ${market.coinASymbol} vs ${market.coinBSymbol}`);
  
  try {
    const [tokenA, tokenB] = await Promise.all([
      getTokenByAddress(market.coinAAddress),
      getTokenByAddress(market.coinBAddress)
    ]);
    
    if (!tokenA || !tokenB) {
      console.error('❌ Could not fetch token prices');
      return null;
    }
    
    const coinAClosing = tokenA.price < 0.01 ? Math.round(tokenA.price * 100_000_000) : Math.round(tokenA.price * 100);
    const coinBClosing = tokenB.price < 0.01 ? Math.round(tokenB.price * 100_000_000) : Math.round(tokenB.price * 100);
    
    const coinAChange = ((coinAClosing - market.coinAOpeningPrice!) / market.coinAOpeningPrice!) * 100;
    const coinBChange = ((coinBClosing - market.coinBOpeningPrice!) / market.coinBOpeningPrice!) * 100;
    
    console.log(`   ${market.coinASymbol}: ${coinAChange > 0 ? '+' : ''}${coinAChange.toFixed(2)}%`);
    console.log(`   ${market.coinBSymbol}: ${coinBChange > 0 ? '+' : ''}${coinBChange.toFixed(2)}%`);
    
    const winningPosition = coinAChange > coinBChange ? Position.UP : Position.DOWN;
    const winner = winningPosition === Position.UP ? market.coinASymbol : market.coinBSymbol;
    console.log(`   Winner: ${winner}`);
    
    market.coinAClosingPrice = coinAClosing;
    market.coinBClosingPrice = coinBClosing;
    market.coinAChangePercent = coinAChange;
    market.coinBChangePercent = coinBChange;
    market.winningPosition = winningPosition;
    market.status = MarketStatus.SETTLED;
    
    if (market.blockchainMarketId !== undefined) {
      try {
        // Check if this is actually a 2-bucket dual-coin market on-chain
        // If numOutcomes !== 2, this market was created incorrectly
        // For now, log a warning and skip on-chain settlement
        console.log(`   ⚠️  Dual-coin market has non-standard setup on blockchain`);
        console.log(`   Skipping on-chain settlement (manual intervention required)`);
        
        // TODO: For proper 2-bucket dual-coin markets, use simplified settlement:
        // const referencePrice = 10000;
        // const finalPriceSimple = winningPosition === Position.UP ? 10001 : 9999;
        // await settleOnChainMarket(market.blockchainMarketId, finalPriceSimple);
      } catch (error) {
        console.error('❌ Failed to settle on-chain:', error);
      }
    }
    
    await saveMarket(market);
    
    return {
      stockSymbol: `${market.coinASymbol} vs ${market.coinBSymbol}`,
      currentPrice: coinAClosing,
      openingPrice: market.coinAOpeningPrice!,
      priceChangePercent: coinAChange,
      winner,
    };
  } catch (error: any) {
    console.error(`❌ Error settling dual-coin market:`, error.message);
    return null;
  }
}

/**
 * Settles a market by fetching latest crypto price
 * Returns market data for Discord tweet
 */
async function settleMarketWithData(marketId: string, symbol: string, openingPrice: number): Promise<{ stockSymbol: string; currentPrice: number; openingPrice: number; priceChangePercent: number } | null> {
  try {
    console.log(`\n🏁 Settling market: ${symbol}`);
    
    // Fetch current crypto price
    const quote = await getCryptoQuote(symbol);
    const closingPrice = Math.round(quote.price * 100); // Convert to cents
    
    if (!closingPrice) {
      console.error(`❌ Could not fetch price for "${symbol}"`);
      return null;
    }
    
    console.log(`📈 Closing price: $${(closingPrice / 100).toFixed(2)}`);
    
    // Settle the market
    const result = await settleMarket(marketId, closingPrice);
    
    console.log(`✅ Market settled successfully!`);
    console.log(`   Winner: ${result.winningPosition}`);
    console.log(`   Price change: ${result.priceChange >= 0 ? '+' : ''}$${(result.priceChange / 100).toFixed(2)} (${result.priceChangePercent.toFixed(2)}%)`);
    console.log(`   Total payout: ${result.totalPayout.toFixed(4)} ETH`);
    
    return {
      stockSymbol: symbol,
      currentPrice: closingPrice,
      openingPrice,
      priceChangePercent: result.priceChangePercent,
    };
    
  } catch (error: any) {
    console.error(`❌ Error settling market ${marketId}:`, error.message);
    return null;
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
  
  await settleMarketWithData(marketId, market.stockSymbol, market.openingPrice);
}
