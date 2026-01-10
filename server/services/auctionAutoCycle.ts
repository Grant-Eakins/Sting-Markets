/**
 * Auction Auto-Cycle Service
 * Automatically manages auction lifecycle synced to dual coin battles
 * 
 * FLOW (24-hour cycle):
 * 1. Create dual coin market as "scheduled" (12 hours preview)
 * 2. Auction starts (runs full 24 hours alongside market)
 * 3. After 12 hours, market goes "active" (12 hours battle)
 * 4. Market ends (24 hours total) -> Stop auction, finalize with winners, refund losers
 * 5. Create new scheduled market from winning bids
 * 6. Clear old auction data and start new auction
 * 7. Repeat
 */

import { getSupabase } from './database';
import { getTokenByAddress } from './dexScreenerApi';
import { 
  createDualCoinOnChainMarket, 
  getOnChainAuctionConfig,
  getOnChainTopTwoWinners,
  startOnChainAuction,
  stopOnChainAuction,
  finalizeOnChainAuction,
  clearOnChainAuctionBids
} from './blockchainSync';

const getDb = () => {
  const db = getSupabase();
  if (!db) throw new Error('Database not initialized');
  return db;
};

/**
 * Get the next 24-hour session timing for dual coin markets
 * Market lifecycle: 12 hours scheduled (preview) + 12 hours active (battle) = 24 hours total
 * Auction runs the full 24 hours alongside the market
 */
function getNext24HourCycleTiming() {
  const now = new Date();
  
  // Align to 12-hour UTC boundaries (00:00 or 12:00)
  const currentHour = now.getUTCHours();
  const currentSessionStart = currentHour < 12 ? 0 : 12;
  const nextSessionStart = currentSessionStart === 0 ? 12 : 0;
  
  // Calculate when the next session starts (market becomes active)
  const sessionStartDate = new Date(now);
  sessionStartDate.setUTCMinutes(0, 0, 0);
  
  if (nextSessionStart === 0) {
    // Next session is midnight tomorrow
    sessionStartDate.setUTCDate(sessionStartDate.getUTCDate() + 1);
    sessionStartDate.setUTCHours(0);
  } else {
    // Next session is noon today or tomorrow
    if (currentHour >= 12) {
      sessionStartDate.setUTCDate(sessionStartDate.getUTCDate() + 1);
    }
    sessionStartDate.setUTCHours(12);
  }
  
  // startTime = when market goes from scheduled to active (first 12-hour boundary)
  const startTime = new Date(sessionStartDate);
  
  // lockTime = when betting stops (12 hours after startTime = 24 hours total cycle)
  const lockTime = new Date(startTime.getTime() + 12 * 60 * 60 * 1000);
  
  // settleTime = when winner is determined (a few seconds after lock)
  const settleTime = new Date(lockTime.getTime() + 3000);
  
  // Total auction duration in hours (from now until market settles)
  const auctionDurationHours = Math.max(1, Math.floor((lockTime.getTime() - Date.now()) / (1000 * 60 * 60)));
  
  const sessionLabel = `${startTime.toDateString()} ${startTime.getUTCHours()}:00 UTC`;
  
  return { startTime, lockTime, settleTime, auctionDurationHours, sessionLabel };
}

let isMonitoring = false;
let monitoringInterval: NodeJS.Timeout | null = null;
let lastBootstrapAttempt = 0;
let isBootstrapping = false; // Prevent re-entrant calls
let isChecking = false; // Prevent concurrent cycle checks
const BOOTSTRAP_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes between bootstrap retries

/**
 * Get coins from the fallback queue to use when auction has no bids
 * Returns 2 coins if available, marks them as used
 */
async function getCoinsFromFallbackQueue(count: number = 2): Promise<{
  contractAddress: string;
  symbol: string;
  name: string;
  imageUrl: string | null;
  id: number;
}[]> {
  const supabase = getDb();
  
  const { data: coins, error } = await supabase
    .from('fallback_coin_queue')
    .select('*')
    .eq('is_available', true)
    .order('added_at', { ascending: true })
    .limit(count);

  if (error || !coins || coins.length < count) {
    console.log(`⚠️ Not enough coins in fallback queue (need ${count}, have ${coins?.length || 0})`);
    return [];
  }

  // Mark coins as used
  const coinIds = coins.map(c => c.id);
  await supabase
    .from('fallback_coin_queue')
    .update({ is_available: false, used_at: new Date().toISOString() })
    .in('id', coinIds);

  console.log(`📦 Using ${coins.length} coins from fallback queue: ${coins.map(c => c.symbol).join(', ')}`);
  
  return coins.map(c => ({
    contractAddress: c.contract_address,
    symbol: c.symbol,
    name: c.name,
    imageUrl: c.image_url,
    id: c.id,
  }));
}

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
  
  return true;
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
 * Get auto-cycle config from database
 */
async function getAutoCycleConfig(): Promise<{ enabled: boolean; linkedMarketId: number | null } | null> {
  const supabase = getDb();
  const { data, error } = await supabase
    .from('auction_config')
    .select('auto_cycle_enabled, linked_market_id')
    .eq('id', 1)
    .single();

  if (error) {
    console.error('Error fetching auto-cycle config:', error);
    return null;
  }

  return {
    enabled: data.auto_cycle_enabled || false,
    linkedMarketId: data.linked_market_id
  };
}

/**
 * Check if we need to cycle auctions based on dual coin market lifecycle
 */
async function checkAndCycleAuctions() {
  // Prevent concurrent checks
  if (isChecking) return;
  isChecking = true;
  
  try {
    const autoCycleConfig = await getAutoCycleConfig();
    
    if (!autoCycleConfig || !autoCycleConfig.enabled) {
      return;
    }

    const supabase = getDb();
    
    // Get on-chain auction state
    const auctionConfig = await getOnChainAuctionConfig();
    if (!auctionConfig) {
      console.log('⚠️ Could not read on-chain auction config');
      return;
    }

    // Find the most recent dual coin market (either scheduled or active)
    const { data: currentMarket, error: marketError } = await supabase
      .from('markets')
      .select('*')
      .eq('is_dual_coin', true)
      .in('status', ['scheduled', 'active'])
      .order('created_at', { ascending: false })
      .limit(1)
    .single();

  if (marketError && marketError.code !== 'PGRST116') {
    console.error('Error fetching current market:', marketError);
    return;
  }

  const now = new Date();

  // CASE 1: No current market and no active auction - need to bootstrap
  if (!currentMarket && !auctionConfig.isActive) {
    // Check cooldown to prevent log spam
    const timeSinceLastAttempt = Date.now() - lastBootstrapAttempt;
    if (timeSinceLastAttempt < BOOTSTRAP_COOLDOWN_MS && lastBootstrapAttempt > 0) {
      // Silent - don't log during cooldown
      return;
    }
    console.log('🚀 No current market or auction - bootstrapping auto-cycle...');
    await bootstrapAutoCycle();
    return;
  }

  // CASE 2: No current market but auction exists - finalize and create market
  if (!currentMarket && auctionConfig.isActive) {
    // Check if auction has ended
    if (now > auctionConfig.auctionEnd) {
      console.log('🏁 Auction ended, no current market - finalizing and creating new market...');
      await finalizeAuctionAndCreateMarket();
    }
    return;
  }

  // CASE 3: Current market exists (scheduled or active)
  if (currentMarket) {
    const marketEndTime = new Date(currentMarket.resolution_time);
    const minutesRemaining = (marketEndTime.getTime() - now.getTime()) / (1000 * 60);
    const isScheduled = currentMarket.status === 'scheduled';

    console.log(`📊 Market: ${currentMarket.title} (${isScheduled ? 'SCHEDULED' : 'ACTIVE'}, ${Math.round(minutesRemaining)} min remaining)`);

    // Update linked market in DB if not set
    if (autoCycleConfig.linkedMarketId !== currentMarket.id) {
      await supabase
        .from('auction_config')
        .update({ linked_market_id: currentMarket.id })
        .eq('id', 1);
    }

    // If auction not running, start it to run alongside the market (full 24h cycle)
    if (!auctionConfig.isActive) {
      // Calculate hours until market ends
      const hoursUntilEnd = Math.max(1, Math.floor((minutesRemaining - 5) / 60));
      console.log(`🎪 Starting auction to run alongside market (${hoursUntilEnd} hours until market ends)`);
      await startOnChainAuction(hoursUntilEnd);
      return;
    }

    // Market is about to end - stop auction and prepare to finalize
    if (minutesRemaining <= 2) {
      console.log('⏰ Market ending soon, stopping auction...');
      const stopped = await stopOnChainAuction();
      if (stopped) {
        // Wait a moment then finalize
        setTimeout(async () => {
          await finalizeAuctionAndCreateMarket();
        }, 5000);
      }
      return;
    }
  }
  } finally {
    isChecking = false;
  }
}

/**
 * Bootstrap the auto-cycle with an initial market and auction
 * Can bootstrap from: 1) existing scheduled market, or 2) fallback coin queue
 */
async function bootstrapAutoCycle() {
  // Prevent re-entrant calls
  if (isBootstrapping) {
    return;
  }
  isBootstrapping = true;
  lastBootstrapAttempt = Date.now();
  
  console.log('🚀 Bootstrapping auto-cycle...');
  
  try {
    const supabase = getDb();
  
  // First, check if there's a scheduled market we can use
  const { data: scheduledMarket } = await supabase
    .from('markets')
    .select('*')
    .eq('is_dual_coin', true)
    .eq('status', 'scheduled')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (scheduledMarket) {
    console.log(`📅 Found scheduled market: ${scheduledMarket.title}`);
    
    // Link it to auction config
    await supabase
      .from('auction_config')
      .update({ linked_market_id: scheduledMarket.id })
      .eq('id', 1);
    
    // Calculate hours until market ends
    const endTime = new Date(scheduledMarket.resolution_time || scheduledMarket.lock_time);
    const hoursUntilEnd = Math.max(1, Math.floor((endTime.getTime() - Date.now()) / (1000 * 60 * 60)));
    
    // Start auction for remaining time until market ends
    console.log(`🎪 Starting auction (${hoursUntilEnd} hours until market ends)`);
    await startOnChainAuction(hoursUntilEnd);
    console.log('✅ Bootstrap complete - linked scheduled market and started auction');
    return;
  }
  
  // No scheduled market - try to bootstrap from fallback queue
  console.log('📦 No scheduled market, checking fallback queue...');
  
  const fallbackCoins = await getCoinsFromFallbackQueue(2);
  
  if (fallbackCoins.length < 2) {
    console.log('⚠️ Need at least 2 coins in fallback queue to bootstrap. Add coins and try again.');
    return;
  }
  
  // Fetch current prices for fallback coins
  const token1 = await getTokenByAddress(fallbackCoins[0].contractAddress);
  const token2 = await getTokenByAddress(fallbackCoins[1].contractAddress);
  
  if (!token1 || !token2) {
    console.error('❌ Failed to fetch prices for fallback coins');
    return;
  }
  
  const coin1 = {
    address: fallbackCoins[0].contractAddress,
    symbol: fallbackCoins[0].symbol,
    name: fallbackCoins[0].name,
    price: token1.price,
    imageUrl: fallbackCoins[0].imageUrl,
  };
  const coin2 = {
    address: fallbackCoins[1].contractAddress,
    symbol: fallbackCoins[1].symbol,
    name: fallbackCoins[1].name,
    price: token2.price,
    imageUrl: fallbackCoins[1].imageUrl,
  };
  
  console.log(`📦 Bootstrapping with fallback coins: ${coin1.symbol} vs ${coin2.symbol}`);
  
  // Get timing for 24-hour cycle
  const { startTime, lockTime, settleTime, auctionDurationHours, sessionLabel } = getNext24HourCycleTiming();
  console.log(`📅 Creating SCHEDULED market for ${sessionLabel}`);
  console.log(`   Start (goes active): ${startTime.toLocaleString()}`);
  console.log(`   Lock (betting stops): ${lockTime.toLocaleString()}`);
  
  // Create on-chain market
  console.log(`⛓️ Creating on-chain dual coin market: ${coin1.symbol} vs ${coin2.symbol}`);
  const blockchainMarketId = await createDualCoinOnChainMarket(
    coin1.symbol,
    coin2.symbol,
    lockTime,
    settleTime
  );
  
  if (blockchainMarketId === null) {
    console.error('❌ Failed to create on-chain market');
    return;
  }
  console.log(`✅ On-chain market created with ID: ${blockchainMarketId}`);
  
  // Create database market
  const marketId = `market-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  const marketData = {
    id: marketId,
    title: `${coin1.symbol} vs ${coin2.symbol}`,
    stock_symbol: `${coin1.symbol}-${coin2.symbol}`,
    description: `Which coin will have the higher price increase? Preview until ${startTime.toLocaleString()}, battle until ${settleTime.toLocaleString()}.`,
    is_dual_coin: true,
    status: 'scheduled',
    start_time: startTime.toISOString(),
    total_cost: 0,
    settle_time: settleTime.toISOString(),
    lock_time: lockTime.toISOString(),
    coin_a_address: coin1.address,
    coin_a_symbol: coin1.symbol,
    coin_a_name: coin1.name,
    coin_a_opening_price: coin1.price,
    coin_a_image_url: coin1.imageUrl,
    coin_b_address: coin2.address,
    coin_b_symbol: coin2.symbol,
    coin_b_name: coin2.name,
    coin_b_opening_price: coin2.price,
    coin_b_image_url: coin2.imageUrl,
    contract_market_id: blockchainMarketId,
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
  
  console.log(`✅ Created new market: ${newMarket.title} (DB ID: ${newMarket.id})`);
  
  // Link to auction config
  await supabase
    .from('auction_config')
    .update({ linked_market_id: newMarket.id })
    .eq('id', 1);
  
  // Clear any old bids and start fresh auction
  console.log('🧹 Clearing old auction bids...');
  await clearOnChainAuctionBids();
  
  // Start auction for 24-hour cycle
  console.log(`🎪 Starting ${auctionDurationHours}-hour auction`);
  await startOnChainAuction(auctionDurationHours);
  
  console.log('✅ Bootstrap complete! Market created from fallback queue and auction started.');
  } finally {
    isBootstrapping = false;
  }
}

/**
 * Finalize current auction, create new market from winners, and start new auction
 * Falls back to queue if not enough auction bids
 */
async function finalizeAuctionAndCreateMarket() {
  try {
    console.log('🏁 Finalizing auction and creating new market...');
    
    // Get top two winners from on-chain leaderboard
    const winners = await getOnChainTopTwoWinners();
    
    let coin1: { address: string; symbol: string; name: string; price: number; imageUrl: string | null };
    let coin2: { address: string; symbol: string; name: string; price: number; imageUrl: string | null };
    let hadAuctionWinners = false;
    let winnerBidIds: bigint[] = [];
    
    // Check if we have 2 different coins from auction
    if (winners.length >= 2 && 
        winners[0].coinAddress.toLowerCase() !== winners[1].coinAddress.toLowerCase()) {
      
      hadAuctionWinners = true;
      winnerBidIds = [winners[0].bidId, winners[1].bidId];
      
      console.log(`🏆 Auction winners: ${winners[0].coinAddress.slice(0, 10)}... vs ${winners[1].coinAddress.slice(0, 10)}...`);
      
      // Fetch token info for winners
      const token1 = await getTokenByAddress(winners[0].coinAddress);
      const token2 = await getTokenByAddress(winners[1].coinAddress);
      
      if (!token1 || !token2) {
        console.error('❌ Failed to fetch token info for auction winners');
        // Fall through to fallback queue
      } else {
        coin1 = { 
          address: winners[0].coinAddress, 
          symbol: token1.symbol, 
          name: token1.name, 
          price: token1.price,
          imageUrl: token1.imageUrl || null 
        };
        coin2 = { 
          address: winners[1].coinAddress, 
          symbol: token2.symbol, 
          name: token2.name, 
          price: token2.price,
          imageUrl: token2.imageUrl || null 
        };
      }
    }
    
    // If we don't have valid coins from auction, try fallback queue
    if (!coin1! || !coin2!) {
      console.log('📦 Not enough valid auction bids, checking fallback queue...');
      
      const fallbackCoins = await getCoinsFromFallbackQueue(2);
      
      if (fallbackCoins.length < 2) {
        console.log('⚠️ No fallback coins available - cannot create market');
        // Clear bids and start a new auction anyway
        await clearOnChainAuctionBids();
        const { auctionDurationHours } = getNext24HourCycleTiming();
        await startOnChainAuction(auctionDurationHours);
        return;
      }
      
      // Fetch current prices for fallback coins
      const token1 = await getTokenByAddress(fallbackCoins[0].contractAddress);
      const token2 = await getTokenByAddress(fallbackCoins[1].contractAddress);
      
      if (!token1 || !token2) {
        console.error('❌ Failed to fetch prices for fallback coins');
        await clearOnChainAuctionBids();
        const { auctionDurationHours } = getNext24HourCycleTiming();
        await startOnChainAuction(auctionDurationHours);
        return;
      }
      
      coin1 = { 
        address: fallbackCoins[0].contractAddress, 
        symbol: fallbackCoins[0].symbol, 
        name: fallbackCoins[0].name, 
        price: token1.price,
        imageUrl: fallbackCoins[0].imageUrl 
      };
      coin2 = { 
        address: fallbackCoins[1].contractAddress, 
        symbol: fallbackCoins[1].symbol, 
        name: fallbackCoins[1].name, 
        price: token2.price,
        imageUrl: fallbackCoins[1].imageUrl 
      };
      
      console.log(`📦 Using fallback coins: ${coin1.symbol} vs ${coin2.symbol}`);
    }

    // Finalize auction on-chain if we had winners (this refunds losers)
    if (hadAuctionWinners && winnerBidIds.length === 2) {
      const finalized = await finalizeOnChainAuction(winnerBidIds);
      if (!finalized) {
        console.error('❌ Failed to finalize auction on-chain');
        return;
      }
    }

    const supabase = getDb();

    // Use the next 24-hour session timing
    const { startTime, lockTime, settleTime, auctionDurationHours, sessionLabel } = getNext24HourCycleTiming();
    console.log(`📅 Creating SCHEDULED market for ${sessionLabel}`);
    console.log(`   Coins: ${coin1.symbol} vs ${coin2.symbol}`);
    console.log(`   Start (goes active): ${startTime.toLocaleString()}`);
    console.log(`   Lock (betting stops): ${lockTime.toLocaleString()}`);
    console.log(`   Settle: ${settleTime.toLocaleString()}`);
    console.log(`   Total cycle: 24 hours (12h preview + 12h battle)`);

    // Create on-chain market FIRST
    console.log(`⛓️ Creating on-chain dual coin market: ${coin1.symbol} vs ${coin2.symbol}`);
    const blockchainMarketId = await createDualCoinOnChainMarket(
      coin1.symbol,
      coin2.symbol,
      lockTime,
      settleTime
    );

    if (blockchainMarketId === null) {
      console.error('❌ Failed to create on-chain market');
      return;
    }
    console.log(`✅ On-chain market created with ID: ${blockchainMarketId}`);

    // Create database market as SCHEDULED (will auto-activate at startTime)
    const marketId = `market-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    const marketData = {
      id: marketId,
      title: `${coin1.symbol} vs ${coin2.symbol}`,
      stock_symbol: `${coin1.symbol}-${coin2.symbol}`,
      description: `Which coin will have the higher price increase? Preview until ${startTime.toLocaleString()}, battle until ${settleTime.toLocaleString()}.`,
      is_dual_coin: true,
      status: 'scheduled',  // Start as scheduled, auto-activates at startTime
      start_time: startTime.toISOString(),  // When market goes active
      total_cost: 0,
      settle_time: settleTime.toISOString(),
      lock_time: lockTime.toISOString(),
      coin_a_address: coin1.address,
      coin_a_symbol: coin1.symbol,
      coin_a_name: coin1.name,
      coin_a_opening_price: coin1.price,
      coin_a_image_url: coin1.imageUrl,
      coin_b_address: coin2.address,
      coin_b_symbol: coin2.symbol,
      coin_b_name: coin2.name,
      coin_b_opening_price: coin2.price,
      coin_b_image_url: coin2.imageUrl,
      contract_market_id: blockchainMarketId,
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

    // Clear old auction bids on-chain
    console.log('🧹 Clearing old auction bids...');
    await clearOnChainAuctionBids();

    // Start new auction for full 24-hour cycle
    console.log(`🎪 Starting new 24-hour auction (${auctionDurationHours} hours until market ends)`);
    await startOnChainAuction(auctionDurationHours);

    console.log('✅ Auto-cycle complete! New scheduled market and 24-hour auction are live.');

  } catch (error) {
    console.error('❌ Error in finalizeAuctionAndCreateMarket:', error);
  }
}

/**
 * Initialize auto-cycle monitoring if enabled
 * Should be called after database is connected
 */
export async function initializeAutoCycle() {
  try {
    const config = await getAutoCycleConfig();
    if (config?.enabled) {
      console.log('🔄 Auto-cycle is enabled, starting monitoring...');
      startMonitoring();
    }
  } catch (error) {
    console.error('⚠️ Failed to initialize auto-cycle (will retry later):', error);
  }
}
