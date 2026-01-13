/**
 * Service to activate scheduled markets when their startTime arrives
 * Runs every minute to check for markets ready to activate
 */

import { MarketStatus, Market } from '../types/market';
import { getAllMarkets, addMarketToMemory } from './marketService';
import { updateMarketStatus, getSupabase } from './database';
import { createOnChainMarket, createDualCoinOnChainMarket } from './blockchainSync';
import { getTokenByAddress } from './dexScreenerApi';

/**
 * Check for scheduled markets that should activate now and activate them
 * Checks both in-memory markets and database for scheduled markets
 */
export async function activateScheduledMarkets(): Promise<number> {
  const now = new Date();
  const supabase = getSupabase();
  
  // Check database for scheduled markets ready to activate
  if (supabase) {
    try {
      const { data: dbScheduledMarkets, error } = await supabase
        .from('markets')
        .select('*')
        .eq('status', 'SCHEDULED')
        .lte('start_time', now.toISOString());
      
      if (!error && dbScheduledMarkets && dbScheduledMarkets.length > 0) {
        console.log(`🚀 Found ${dbScheduledMarkets.length} scheduled markets in DB ready to activate`);
        
        let activated = 0;
        for (const dbMarket of dbScheduledMarkets) {
          try {
            await activateMarketFromDb(dbMarket, supabase);
            activated++;
          } catch (err: any) {
            console.error(`❌ Failed to activate market ${dbMarket.id}:`, err.message);
          }
        }
        return activated;
      }
    } catch (err) {
      console.error('Error checking scheduled markets in DB:', err);
    }
  }
  
  // Fallback to in-memory markets
  const markets = getAllMarkets();
  const scheduledMarkets = markets.filter(m => 
    m.status === MarketStatus.SCHEDULED && 
    m.startTime && 
    now >= m.startTime
  );

  if (scheduledMarkets.length === 0) {
    return 0;
  }

  console.log(`🚀 Found ${scheduledMarkets.length} scheduled markets ready to activate`);

  let activated = 0;
  for (const market of scheduledMarkets) {
    try {
      console.log(`⏰ Activating market: ${market.stockSymbol}`);

      // Recalculate lock and settle times at activation (12 hours from now)
      const activationTime = new Date();
      const newLockTime = new Date(activationTime.getTime() + 12 * 60 * 60 * 1000); // 12 hours from now
      const newSettleTime = new Date(activationTime.getTime() + 12 * 60 * 60 * 1000 + 5 * 60 * 1000); // 12 hours + 5 min
      
      market.lockTime = newLockTime;
      market.settleTime = newSettleTime;

      console.log(`   Lock time: ${newLockTime.toLocaleString()}`);
      console.log(`   Settle time: ${newSettleTime.toLocaleString()}`);

      // Fetch current prices for dual-coin markets
      if (market.isDualCoin && market.coinAAddress && market.coinBAddress) {
        const [tokenA, tokenB] = await Promise.all([
          getTokenByAddress(market.coinAAddress),
          getTokenByAddress(market.coinBAddress)
        ]);

        if (tokenA && tokenB) {
          // Store RAW USD prices (no encoding for exact display)
          market.coinAOpeningPrice = tokenA.price;
          market.coinBOpeningPrice = tokenB.price;
          market.openingPrice = tokenA.price; // Use coin A as reference

          // Encode prices for blockchain
          const coinAPriceEncoded = tokenA.price < 0.01 
            ? Math.floor(tokenA.price * 100_000_000) 
            : Math.floor(tokenA.price * 100);

          // Store encoded price for blockchain creation
          (market as any).encodedOpeningPrice = coinAPriceEncoded;

          console.log(`   ${market.coinASymbol}: $${tokenA.price < 0.01 ? tokenA.price.toFixed(8) : tokenA.price.toFixed(4)}`);
          console.log(`   ${market.coinBSymbol}: $${tokenB.price < 0.01 ? tokenB.price.toFixed(8) : tokenB.price.toFixed(4)}`);
        }
      }

      // Create market on blockchain
      try {
        let blockchainMarketId: number | null = null;
        
        if (market.isDualCoin && market.coinASymbol && market.coinBSymbol) {
          // Use dual-coin contract for head-to-head battles
          blockchainMarketId = await createDualCoinOnChainMarket(
            market.coinASymbol,
            market.coinBSymbol,
            newLockTime,
            newSettleTime
          );
        } else {
          // Use standard contract for single-coin markets
          const numOutcomes = 42;
          const referencePrice = (market as any).encodedOpeningPrice || market.openingPrice;
          blockchainMarketId = await createOnChainMarket(
            market.stockSymbol,
            referencePrice,
            newLockTime,
            newSettleTime,
            false, // isAfterHours
            numOutcomes
          );
        }
        
        if (blockchainMarketId !== null) {
          market.blockchainMarketId = blockchainMarketId;
          console.log(`   ⛓️  Created on-chain market #${blockchainMarketId}`);
        }
      } catch (error: any) {
        console.error(`   ❌ Failed to create on-chain market:`, error.message);
        // Continue with activation even if blockchain creation fails
      }

      // Update status to ACTIVE
      market.status = MarketStatus.ACTIVE;
      market.openTimestamp = now;
      
      // Persist to database
      await updateMarketStatus(market.id, MarketStatus.ACTIVE);

      console.log(`✅ Market activated: ${market.stockSymbol}`);
      activated++;
    } catch (error: any) {
      console.error(`❌ Failed to activate market ${market.id}:`, error.message);
    }
  }

  return activated;
}

/**
 * Activate a market directly from database record
 */
async function activateMarketFromDb(dbMarket: any, supabase: any) {
  console.log(`⏰ Activating market from DB: ${dbMarket.stock_symbol}`);
  
  const now = new Date();
  
  // Recalculate lock and settle times at activation (12 hours from now)
  const activationTime = new Date();
  const newLockTime = new Date(activationTime.getTime() + 12 * 60 * 60 * 1000);
  const newSettleTime = new Date(activationTime.getTime() + 12 * 60 * 60 * 1000 + 5 * 60 * 1000);
  
  console.log(`   Lock time: ${newLockTime.toLocaleString()}`);
  console.log(`   Settle time: ${newSettleTime.toLocaleString()}`);
  
  // Fetch current prices for dual-coin markets
  let coinAOpeningPrice = dbMarket.coin_a_opening_price;
  let coinBOpeningPrice = dbMarket.coin_b_opening_price;
  
  if (dbMarket.is_dual_coin && dbMarket.coin_a_address && dbMarket.coin_b_address) {
    const [tokenA, tokenB] = await Promise.all([
      getTokenByAddress(dbMarket.coin_a_address),
      getTokenByAddress(dbMarket.coin_b_address)
    ]);
    
    if (tokenA && tokenB) {
      coinAOpeningPrice = tokenA.price;
      coinBOpeningPrice = tokenB.price;
      console.log(`   ${dbMarket.coin_a_symbol}: $${tokenA.price < 0.01 ? tokenA.price.toFixed(8) : tokenA.price.toFixed(4)}`);
      console.log(`   ${dbMarket.coin_b_symbol}: $${tokenB.price < 0.01 ? tokenB.price.toFixed(8) : tokenB.price.toFixed(4)}`);
    }
  }
  
  // Create market on blockchain
  let blockchainMarketId: number | null = null;
  
  try {
    if (dbMarket.is_dual_coin && dbMarket.coin_a_symbol && dbMarket.coin_b_symbol) {
      blockchainMarketId = await createDualCoinOnChainMarket(
        dbMarket.coin_a_symbol,
        dbMarket.coin_b_symbol,
        newLockTime,
        newSettleTime
      );
    } else {
      const referencePrice = dbMarket.reference_price || 0;
      blockchainMarketId = await createOnChainMarket(
        dbMarket.stock_symbol,
        referencePrice,
        newLockTime,
        newSettleTime,
        false,
        42
      );
    }
    
    if (blockchainMarketId !== null) {
      console.log(`   ⛓️  Created on-chain market #${blockchainMarketId}`);
    }
  } catch (err: any) {
    console.error(`   ❌ Failed to create on-chain market:`, err.message);
  }
  
  // Update database - save to both blockchain_market_id and contract_market_id for compatibility
  const { error } = await supabase
    .from('markets')
    .update({
      status: 'ACTIVE',
      lock_time: newLockTime.toISOString(),
      settle_time: newSettleTime.toISOString(),
      coin_a_opening_price: coinAOpeningPrice,
      coin_b_opening_price: coinBOpeningPrice,
      blockchain_market_id: blockchainMarketId,  // Primary column used by main DB code
      contract_market_id: blockchainMarketId,    // Legacy column, keep in sync
      updated_at: now.toISOString(),
    })
    .eq('id', dbMarket.id);
  
  if (error) {
    throw new Error(`DB update failed: ${error.message}`);
  }
  
  // Add the activated market to in-memory storage so it can be tracked for settlement
  const activatedMarket: Market = {
    id: dbMarket.id,
    stockSymbol: dbMarket.stock_symbol || dbMarket.title,
    stockName: dbMarket.title || dbMarket.stock_symbol,
    description: dbMarket.description || '',
    status: MarketStatus.ACTIVE,
    createdAt: new Date(dbMarket.created_at),
    lockTime: newLockTime,
    settleTime: newSettleTime,
    startTime: dbMarket.start_time ? new Date(dbMarket.start_time) : undefined,
    openingPrice: coinAOpeningPrice || dbMarket.reference_price || 0,
    currentPrice: coinAOpeningPrice || dbMarket.reference_price || 0,
    openTimestamp: now,
    isAfterHours: false,
    upPool: 0,
    downPool: 0,
    totalPool: 0,
    upBettors: 0,
    downBettors: 0,
    totalBets: 0,
    isDualCoin: dbMarket.is_dual_coin || false,
    coinASymbol: dbMarket.coin_a_symbol,
    coinAName: dbMarket.coin_a_name,
    coinAAddress: dbMarket.coin_a_address,
    coinAOpeningPrice: coinAOpeningPrice,
    coinAImageUrl: dbMarket.coin_a_image_url,
    coinBSymbol: dbMarket.coin_b_symbol,
    coinBName: dbMarket.coin_b_name,
    coinBAddress: dbMarket.coin_b_address,
    coinBOpeningPrice: coinBOpeningPrice,
    coinBImageUrl: dbMarket.coin_b_image_url,
    blockchainMarketId: blockchainMarketId || undefined,
  };
  
  addMarketToMemory(activatedMarket);
  
  console.log(`✅ Market activated: ${dbMarket.stock_symbol}`);
  if (blockchainMarketId !== null) {
    console.log(`   📍 On-chain market ID: ${blockchainMarketId}`);
  }
}

/**
 * Get all scheduled markets (for display purposes)
 * Queries database directly to include markets created by auto-cycle
 */
export async function getScheduledMarkets(): Promise<Market[]> {
  const supabase = getSupabase();
  
  // First get from in-memory (for markets created via API)
  const inMemoryMarkets = getAllMarkets().filter(m => m.status === MarketStatus.SCHEDULED);
  
  // Also query database for markets created by auto-cycle (may not be in memory yet)
  if (supabase) {
    try {
      const { data: dbMarkets, error } = await supabase
        .from('markets')
        .select('*')
        .eq('status', 'SCHEDULED')
        .order('start_time', { ascending: true });
      
      if (!error && dbMarkets) {
        // Merge database results with in-memory, avoiding duplicates
        const inMemoryIds = new Set(inMemoryMarkets.map(m => m.id));
        
        for (const dbMarket of dbMarkets) {
          if (!inMemoryIds.has(dbMarket.id)) {
            // Convert DB format to Market format
            const market: Market = {
              id: dbMarket.id,
              stockSymbol: dbMarket.stock_symbol || dbMarket.title || '',
              stockName: dbMarket.title,
              description: dbMarket.description || '',
              status: MarketStatus.SCHEDULED,
              openingPrice: dbMarket.reference_price || 0,
              currentPrice: dbMarket.current_price || dbMarket.reference_price || 0,
              lockTime: new Date(dbMarket.lock_time),
              settleTime: new Date(dbMarket.settle_time),
              startTime: dbMarket.start_time ? new Date(dbMarket.start_time) : undefined,
              createdAt: new Date(dbMarket.created_at),
              openTimestamp: new Date(dbMarket.created_at),
              isDualCoin: dbMarket.is_dual_coin || false,
              isAfterHours: false,
              coinAAddress: dbMarket.coin_a_address,
              coinASymbol: dbMarket.coin_a_symbol,
              coinAName: dbMarket.coin_a_name,
              coinAOpeningPrice: dbMarket.coin_a_opening_price,
              coinAImageUrl: dbMarket.coin_a_image_url,
              coinBAddress: dbMarket.coin_b_address,
              coinBSymbol: dbMarket.coin_b_symbol,
              coinBName: dbMarket.coin_b_name,
              coinBOpeningPrice: dbMarket.coin_b_opening_price,
              coinBImageUrl: dbMarket.coin_b_image_url,
              blockchainMarketId: dbMarket.contract_market_id,
              upPool: 0,
              downPool: 0,
              totalPool: 0,
              upBettors: 0,
              downBettors: 0,
              totalBets: 0,
            };
            inMemoryMarkets.push(market);
          }
        }
      }
    } catch (err) {
      console.error('Error fetching scheduled markets from DB:', err);
    }
  }
  
  return inMemoryMarkets.sort((a, b) => {
    if (!a.startTime || !b.startTime) return 0;
    return a.startTime.getTime() - b.startTime.getTime();
  });
}
