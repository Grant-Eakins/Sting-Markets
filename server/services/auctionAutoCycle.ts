/**
 * Auction Auto-Cycle Service
 * Automatically manages auction lifecycle synced to dual coin battles
 */

import { getSupabase } from './database';
import { getAuctionConfig, startAuction, stopAuction, finalizeAuction, getTopTwoWinners } from './listingAuction';
import { getTokenByAddress } from './dexScreenerApi';
import { createDualCoinOnChainMarket } from './blockchainSync';

const getDb = () => {
  const db = getSupabase();
  if (!db) throw new Error('Database not initialized');
  return db;
};

let isMonitoring = false;
let monitoringInterval: NodeJS.Timeout | null = null;

/**
 * Enable auto-cycle mode
 */
export async function enableAutoCycle(): Promise<boolean> {
  const supabase = getDb();
  
  const { error } = await supabase
    .from('auction_config')
    .update({ 
      auto_cycle_enabled: true,
      updated_at: new Date().toISOString() 
    })
    .eq('id', 1);

  if (error) {
    console.error('❌ Failed to enable auto-cycle:', error);
    return false;
  }

  console.log('✅ Auction auto-cycle enabled');
  startMonitoring();
  
  // Immediately sync auction to current market
  await syncAuctionToCurrentMarket();
  
  return true;
}

/**
 * Sync auction end time to match the current active dual coin market
 */
async function syncAuctionToCurrentMarket(): Promise<void> {
  const supabase = getDb();
  
  // Find the most recent active dual coin market
  const { data: activeMarket, error: marketError } = await supabase
    .from('markets')
    .select('*')
    .eq('is_dual_coin', true)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (marketError || !activeMarket) {
    console.log('⚠️ No active dual coin market to sync with');
    return;
  }

  const marketEndTime = new Date(activeMarket.resolution_time);
  const now = new Date();
  
  // Set auction end time to match market end time (minus 5 minutes buffer)
  const auctionEndTime = new Date(marketEndTime.getTime() - 5 * 60 * 1000);
  
  if (auctionEndTime <= now) {
    console.log('⚠️ Market is ending too soon, cannot sync auction');
    return;
  }

  console.log(`🔄 Syncing auction to market ${activeMarket.id}`);
  console.log(`   Market ends: ${marketEndTime.toISOString()}`);
  console.log(`   Auction will end: ${auctionEndTime.toISOString()}`);

  const { error: updateError } = await supabase
    .from('auction_config')
    .update({
      is_active: true,
      current_auction_start: now.toISOString(),
      current_auction_end: auctionEndTime.toISOString(),
      linked_market_id: activeMarket.id,
      updated_at: new Date().toISOString()
    })
    .eq('id', 1);

  if (updateError) {
    console.error('❌ Failed to sync auction:', updateError);
    return;
  }

  console.log('✅ Auction synced to current market');
}

/**
 * Disable auto-cycle mode
 */
export async function disableAutoCycle(): Promise<boolean> {
  const supabase = getDb();
  
  const { error } = await supabase
    .from('auction_config')
    .update({ 
      auto_cycle_enabled: false,
      linked_market_id: null,
      updated_at: new Date().toISOString() 
    })
    .eq('id', 1);

  if (error) {
    console.error('❌ Failed to disable auto-cycle:', error);
    return false;
  }

  console.log('✅ Auction auto-cycle disabled');
  stopMonitoring();
  return true;
}

/**
 * Start monitoring dual coin markets for auto-cycle
 */
function startMonitoring() {
  if (isMonitoring) return;
  
  console.log('🔄 Starting auction auto-cycle monitoring...');
  isMonitoring = true;
  
  // Check every 30 seconds
  monitoringInterval = setInterval(async () => {
    try {
      await checkAndCycleAuctions();
    } catch (error) {
      console.error('❌ Error in auto-cycle check:', error);
    }
  }, 30000);
  
  // Run immediately
  checkAndCycleAuctions();
}

/**
 * Stop monitoring
 */
function stopMonitoring() {
  if (monitoringInterval) {
    clearInterval(monitoringInterval);
    monitoringInterval = null;
  }
  isMonitoring = false;
  console.log('⏸️ Stopped auction auto-cycle monitoring');
}

/**
 * Check if we need to cycle auctions based on dual coin market lifecycle
 */
async function checkAndCycleAuctions() {
  const supabase = getDb();
  const config = await getAuctionConfig();
  
  if (!config || !config.auto_cycle_enabled) {
    return;
  }

  // Find the most recent active dual coin market
  const { data: activeMarket, error: marketError } = await supabase
    .from('markets')
    .select('*')
    .eq('is_dual_coin', true)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (marketError && marketError.code !== 'PGRST116') {
    console.error('Error fetching active market:', marketError);
    return;
  }

  // CASE 1: No active market - finalize current auction if it exists and create new market
  if (!activeMarket) {
    if (config.isActive && config.linked_market_id) {
      console.log('🏁 Active market ended, finalizing auction and creating next market...');
      await finalizeAndCreateNextMarket();
    }
    return;
  }

  // CASE 2: Active market exists but auction not linked to it - sync auction to market
  if (config.linked_market_id !== activeMarket.id) {
    console.log('🔄 Auction not synced to current market, syncing now...');
    await syncAuctionToCurrentMarket();
    return;
  }

  // CASE 3: Market is about to end - stop auction if still active
  if (config.linked_market_id === activeMarket.id && config.isActive) {
    const marketEndTime = new Date(activeMarket.resolution_time);
    const now = new Date();
    const minutesRemaining = (marketEndTime.getTime() - now.getTime()) / (1000 * 60);
    
    // Stop auction 5 minutes before market ends
    if (minutesRemaining <= 5) {
      console.log('⏰ Market ending soon, stopping auction...');
      await stopAuction();
    }
  }
}

/**
 * Finalize current auction and create next dual coin market with winners
 */
async function finalizeAndCreateNextMarket() {
  try {
    // Finalize auction
    const result = await finalizeAuction();
    
    if (!result.success || !result.winners || result.winners.length < 2) {
      console.log('⚠️ Not enough winners to create market');
      return;
    }

    const [winner1, winner2] = result.winners;

    // Fetch token info for both winners
    const token1 = await getTokenByAddress(winner1.coinContractAddress);
    const token2 = await getTokenByAddress(winner2.coinContractAddress);

    if (!token1 || !token2) {
      console.error('❌ Failed to fetch token info for winners');
      return;
    }

    const supabase = getDb();

    // Calculate times: lock 30min before end, settle at end
    const now = new Date();
    const resolutionTime = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours from now
    const lockTime = new Date(resolutionTime.getTime() - 30 * 60 * 1000); // 30 min before resolution

    // Scale prices for storage (handle small decimals)
    const scalePrice = (price: number) => {
      if (price < 0.01) return Math.round(price * 100_000_000);
      return Math.round(price * 100);
    };

    // Create on-chain market FIRST
    console.log(`⛓️ Creating on-chain dual coin market: ${token1.symbol} vs ${token2.symbol}`);
    const blockchainMarketId = await createDualCoinOnChainMarket(
      token1.symbol,
      token2.symbol,
      lockTime,
      resolutionTime
    );

    if (blockchainMarketId === null) {
      console.error('❌ Failed to create on-chain market');
      // Continue with database-only market as fallback
    } else {
      console.log(`✅ On-chain market created with ID: ${blockchainMarketId}`);
    }

    // Create database market
    const marketData = {
      title: `${token1.symbol} vs ${token2.symbol}`,
      description: `Which coin will have the higher price increase? Market runs for 24 hours.`,
      is_dual_coin: true,
      status: 'active',
      total_cost: 0,
      outcomes: 2,
      num_outcomes: 2,
      resolution_time: resolutionTime.toISOString(),
      lock_time: lockTime.toISOString(),
      coin_a_address: winner1.coinContractAddress,
      coin_a_symbol: token1.symbol,
      coin_a_name: token1.name,
      coin_a_opening_price: scalePrice(token1.price),
      coin_a_image_url: token1.imageUrl,
      coin_b_address: winner2.coinContractAddress,
      coin_b_symbol: token2.symbol,
      coin_b_name: token2.name,
      coin_b_opening_price: scalePrice(token2.price),
      coin_b_image_url: token2.imageUrl,
      contract_market_id: blockchainMarketId ?? -1,
    };

    const { data: newMarket, error } = await supabase
      .from('markets')
      .insert(marketData)
      .select()
      .single();

    if (error) {
      console.error('❌ Failed to create market in database:', error);
      return;
    }

    console.log(`✅ Created new market: ${newMarket.title} (DB ID: ${newMarket.id}, Chain ID: ${blockchainMarketId})`);

    // Link new market to auction config
    await supabase
      .from('auction_config')
      .update({ linked_market_id: newMarket.id })
      .eq('id', 1);

    // Start new auction for this market (24 hours)
    await startAuction(24);

  } catch (error) {
    console.error('❌ Error in finalizeAndCreateNextMarket:', error);
  }
}

/**
 * Initialize auto-cycle monitoring if enabled
 * Should be called after database is connected
 */
export async function initializeAutoCycle() {
  try {
    const config = await getAuctionConfig();
    if (config?.auto_cycle_enabled) {
      console.log('🔄 Auto-cycle is enabled, starting monitoring...');
      startMonitoring();
    }
  } catch (error) {
    console.error('⚠️ Failed to initialize auto-cycle (will retry later):', error);
  }
}
