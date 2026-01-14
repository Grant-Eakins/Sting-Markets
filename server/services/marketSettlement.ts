import { getMarketsReadyToSettle, settleMarket, lockExpiredMarkets, getActiveMarkets, updateMarketPrice, getAllMarkets, addMarketToMemory, getMarket } from './marketService';
import { getCryptoQuote, getBatchQuotes } from './cryptoApi';
import { sendPriceUpdateTweets, sendClosingPriceTweets, sendOpeningPriceTweets } from './discordBot';
import { syncCryptoMarkets } from './cryptoSync';
import { syncSettlementStatusFromChain, settleOnChainMarket, settleDualCoinOnChain } from './blockchainSync';
import { getTokenByAddress } from './dexScreenerApi';
import { saveMarket, getSupabase } from './database';
import { MarketStatus, Position } from '../types/market';
import type { Market } from '../types/market';

// Track last Discord update time to send every 3 hours
let lastDiscordUpdateTime: number = 0;
const THREE_HOURS_MS = 3 * 60 * 60 * 1000; // 3 hours in milliseconds

/**
 * Get dual coin markets from database that may need settlement
 * These might not be in memory if created by auto-cycle
 */
async function getDualCoinMarketsFromDb(): Promise<Market[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  
  try {
    const { data, error } = await supabase
      .from('markets')
      .select('*')
      .eq('is_dual_coin', true)
      .in('status', ['ACTIVE', 'LOCKED'])
      .order('created_at', { ascending: false });
    
    if (error || !data) {
      console.error('Error fetching dual coin markets from DB:', error);
      return [];
    }
    
    // Convert DB records to Market objects
    return data.map((row: any) => ({
      id: row.id,
      stockSymbol: row.stock_symbol || row.title,
      stockName: row.title,
      description: row.description || '',
      status: row.status === 'ACTIVE' ? MarketStatus.ACTIVE : 
              row.status === 'LOCKED' ? MarketStatus.LOCKED :
              row.status === 'SETTLED' ? MarketStatus.SETTLED :
              row.status === 'SCHEDULED' ? MarketStatus.SCHEDULED : MarketStatus.ACTIVE,
      createdAt: new Date(row.created_at),
      lockTime: new Date(row.lock_time),
      settleTime: new Date(row.settle_time),
      startTime: row.start_time ? new Date(row.start_time) : undefined,
      openingPrice: row.reference_price || 0,
      currentPrice: row.current_price || row.reference_price || 0,
      openTimestamp: new Date(row.created_at),
      isAfterHours: false,
      upPool: 0,
      downPool: 0,
      totalPool: row.total_cost || 0,
      upBettors: 0,
      downBettors: 0,
      totalBets: 0,
      isDualCoin: true,
      coinASymbol: row.coin_a_symbol,
      coinAName: row.coin_a_name,
      coinAAddress: row.coin_a_address,
      coinAOpeningPrice: row.coin_a_opening_price,
      coinAImageUrl: row.coin_a_image_url,
      coinBSymbol: row.coin_b_symbol,
      coinBName: row.coin_b_name,
      coinBAddress: row.coin_b_address,
      coinBOpeningPrice: row.coin_b_opening_price,
      coinBImageUrl: row.coin_b_image_url,
      // Use blockchain_market_id to match the main database schema
      blockchainMarketId: row.blockchain_market_id || row.contract_market_id,
    } as Market));
  } catch (err) {
    console.error('Error in getDualCoinMarketsFromDb:', err);
    return [];
  }
}

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
      status: Number(m.status),  // Convert enum to number
      isDualCoin: m.isDualCoin || false
    }));
    const synced = await syncSettlementStatusFromChain(marketsWithBlockchainId);
    
    // First lock any markets that passed their lock time (in-memory markets)
    const locked = lockExpiredMarkets();
    if (locked > 0) {
      console.log(`🔒 Locked ${locked} in-memory markets`);
    }
    
    // Also check database for ACTIVE/LOCKED dual coin markets that need locking/settling
    // These may not be in memory if created by auto-cycle
    const dbDualCoinMarkets = await getDualCoinMarketsFromDb();
    if (dbDualCoinMarkets.length > 0) {
      console.log(`📡 Found ${dbDualCoinMarkets.length} dual coin markets in DB to check`);
      for (const m of dbDualCoinMarkets) {
        console.log(`   - ${m.stockSymbol}: status=${m.status}, lockTime=${m.lockTime.toISOString()}, settleTime=${m.settleTime.toISOString()}, blockchainId=${m.blockchainMarketId}`);
        
        // Add DB markets to memory if not already there (ensures tracking for settlement)
        if (!getMarket(m.id)) {
          addMarketToMemory(m);
        }
      }
    }
    
    // Get markets ready to settle (from in-memory)
    let marketsToSettle = getMarketsReadyToSettle();
    console.log(`📊 In-memory markets ready to settle: ${marketsToSettle.length}`);
    
    // Add any DB dual coin markets that are ready to settle but not in memory
    const inMemoryIds = new Set(marketsToSettle.map(m => m.id));
    const now = new Date();
    console.log(`⏰ Current time: ${now.toISOString()}`);
    
    for (const dbMarket of dbDualCoinMarkets) {
      if (!inMemoryIds.has(dbMarket.id)) {
        const settleTime = new Date(dbMarket.settleTime);
        const lockTime = new Date(dbMarket.lockTime);
        
        console.log(`   Checking ${dbMarket.stockSymbol}: status=${dbMarket.status}, lockTime=${lockTime.toISOString()}, settleTime=${settleTime.toISOString()}`);
        console.log(`   Time comparison: now >= lockTime = ${now >= lockTime}, now >= settleTime = ${now >= settleTime}`);
        
        // Check if market is LOCKED and past settle time
        if (dbMarket.status === MarketStatus.LOCKED && now >= settleTime) {
          console.log(`📡 Found DB dual coin market ready to settle: ${dbMarket.stockSymbol}`);
          marketsToSettle.push(dbMarket);
        }
        // Check if market is ACTIVE and past lock time - lock it first, then check if ready to settle
        else if (dbMarket.status === MarketStatus.ACTIVE && now >= lockTime) {
          console.log(`🔒 Locking DB dual coin market: ${dbMarket.stockSymbol}`);
          dbMarket.status = MarketStatus.LOCKED;
          await saveMarket(dbMarket);
          addMarketToMemory(dbMarket); // Keep memory in sync
          
          // If also past settle time, add to settle list immediately
          if (now >= settleTime) {
            console.log(`📡 Market ${dbMarket.stockSymbol} is also ready to settle (past lock AND settle time)`);
            marketsToSettle.push(dbMarket);
          } else {
            console.log(`⏳ Market ${dbMarket.stockSymbol} is now LOCKED, will settle later`);
          }
        }
        // Check if market is ACTIVE but already past SETTLE time (missed the lock window)
        else if (dbMarket.status === MarketStatus.ACTIVE && now >= settleTime) {
          console.log(`⚡ Market ${dbMarket.stockSymbol} is past settle time but still ACTIVE - fast-tracking to settlement`);
          dbMarket.status = MarketStatus.LOCKED;
          await saveMarket(dbMarket);
          addMarketToMemory(dbMarket); // Keep memory in sync
          marketsToSettle.push(dbMarket);
        }
      }
    }
    
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
export async function settleDualCoinMarket(market: Market): Promise<any> {
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
        console.log(`   📡 Settling on-chain (dual coin contract)...`);
        console.log(`   📍 Blockchain Market ID: ${market.blockchainMarketId}`);
        const coinAWon = winningPosition === Position.UP;
        console.log(`   📍 Coin A Won: ${coinAWon} (winningPosition: ${winningPosition})`);
        const success = await settleDualCoinOnChain(market.blockchainMarketId, coinAWon);
        
        if (success) {
          console.log(`   ✅ Dual-coin market settled on-chain successfully`);
        } else {
          console.log(`   ⚠️  On-chain settlement returned false - check blockchain initialization`);
        }
      } catch (error) {
        console.error('❌ Failed to settle on-chain:', error);
        console.log('   Backend settlement will proceed anyway');
      }
    } else {
      console.log(`   ⚠️  No blockchainMarketId - skipping on-chain settlement`);
    }
    
    console.log(`   💾 Saving market settlement to database...`);
    console.log(`      Market ID: ${market.id}`);
    console.log(`      New status: ${market.status}`);
    console.log(`      Winner: ${winner} (${winningPosition})`);
    
    await saveMarket(market);
    
    console.log(`   ✅ Market ${market.coinASymbol} vs ${market.coinBSymbol} settlement complete!`);
    console.log(`   📊 Users can now claim their payouts from the smart contract`);
    
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
  const market = getMarket(marketId);
  if (!market) {
    throw new Error('Market not found');
  }
  
  await settleMarketWithData(marketId, market.stockSymbol, market.openingPrice);
}
