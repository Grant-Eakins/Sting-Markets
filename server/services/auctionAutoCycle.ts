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
import { getTokenByAddress, getTrendingTokens } from './dexScreenerApi';
import { 
  getOnChainAuctionConfig,
  getOnChainTopTwoWinners,
  startOnChainAuction,
  stopOnChainAuction,
  finalizeOnChainAuction,
  clearOnChainAuctionBids
} from './blockchainSync';
import { clearAllBids as clearDatabaseBids } from './listingAuction';

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
  
  // Central Time is UTC-6 (CST) or UTC-5 (CDT)
  // For simplicity, we use fixed UTC times that correspond to Central Time:
  // 6 AM Central = 12:00 UTC (in winter CST)
  // 6 PM Central = 00:00 UTC next day (midnight UTC)
  // 
  // The cycle is:
  // - 6 PM Central (00:00 UTC): Auction ends, battle ends, settle, new scheduled market, new auction starts
  // - 6 AM Central (12:00 UTC): Scheduled market becomes ACTIVE, battle begins
  // - 6 PM Central (00:00 UTC): Battle ends (12 hours), auction ends (12 hours running)
  
  const currentHour = now.getUTCHours();
  
  // Determine the next 6 AM Central (12:00 UTC) for when market becomes active
  const startTime = new Date(now);
  startTime.setUTCMinutes(0, 0, 0);
  startTime.setUTCHours(12); // 6 AM Central = 12:00 UTC
  
  // If we're past noon UTC, the next 6 AM Central is tomorrow
  if (currentHour >= 12) {
    startTime.setUTCDate(startTime.getUTCDate() + 1);
  }
  
  // lockTime = 6 PM Central (00:00 UTC) = 12 hours after 6 AM Central
  // This is when battle ends and betting stops
  const lockTime = new Date(startTime.getTime() + 12 * 60 * 60 * 1000);
  
  // settleTime = a few seconds after lock for settlement
  const settleTime = new Date(lockTime.getTime() + 3000);
  
  // Auction runs from 6 PM Central to 6 PM Central (24 hours total, but we calculate remaining)
  // Since auction should end at 6 PM Central when battle ends, calculate hours until lockTime
  const auctionDurationHours = Math.max(1, Math.floor((lockTime.getTime() - Date.now()) / (1000 * 60 * 60)));
  
  // Format session label with Central Time
  const centralStartHour = 6; // 6 AM Central
  const sessionLabel = `${startTime.toDateString()} ${centralStartHour}:00 AM Central (${startTime.getUTCHours()}:00 UTC)`;
  
  return { startTime, lockTime, settleTime, auctionDurationHours, sessionLabel };
}

let isMonitoring = false;
let monitoringInterval: NodeJS.Timeout | null = null;
let lastBootstrapAttempt = 0;
let isBootstrapping = false; // Prevent re-entrant calls
let isChecking = false; // Prevent concurrent cycle checks
const BOOTSTRAP_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes between bootstrap retries

/**
 * Get coins from DexScreener trending/boosted tokens
 * Used as ultimate fallback when queue is empty
 */
async function getCoinsFromTrending(count: number = 2): Promise<{
  contractAddress: string;
  symbol: string;
  name: string;
  imageUrl: string | null;
  price: number;
  chainId: string;
}[]> {
  console.log(`🔥 Fetching ${count} trending tokens from DexScreener as fallback...`);
  
  try {
    // Get trending tokens, preferring Base and Solana chains
    const trendingTokens = await getTrendingTokens(count * 3, ['base', 'solana']);
    
    if (trendingTokens.length < count) {
      console.log(`⚠️ Only found ${trendingTokens.length} trending tokens (need ${count})`);
      
      // Try without chain filter if not enough
      if (trendingTokens.length < count) {
        const allTrending = await getTrendingTokens(count * 3);
        trendingTokens.push(...allTrending.filter(t => 
          !trendingTokens.some(existing => existing.address.toLowerCase() === t.address.toLowerCase())
        ));
      }
    }
    
    // Filter to ensure we have valid tokens with good liquidity
    const validTokens = trendingTokens
      .filter(t => t.liquidity >= 10000) // Minimum $10k liquidity
      .slice(0, count);
    
    if (validTokens.length < count) {
      console.log(`⚠️ Not enough valid trending tokens (need ${count}, have ${validTokens.length})`);
      return [];
    }
    
    console.log(`🔥 Using ${validTokens.length} trending tokens: ${validTokens.map(t => `${t.symbol} (${t.chainId})`).join(', ')}`);
    
    return validTokens.map(t => ({
      contractAddress: t.address,
      symbol: t.symbol,
      name: t.name,
      imageUrl: t.imageUrl || null,
      price: t.price,
      chainId: t.chainId,
    }));
    
  } catch (error: any) {
    console.error('❌ Failed to fetch trending tokens:', error.message);
    return [];
  }
}

/**
 * Get coins from the fallback queue to use when auction has no bids
 * Returns 2 coins if available, marks them as used
 * If queue is empty, falls back to DexScreener trending tokens
 */
async function getCoinsFromFallbackQueue(count: number = 2): Promise<{
  contractAddress: string;
  symbol: string;
  name: string;
  imageUrl: string | null;
  id?: number;
  fromTrending?: boolean;
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
    console.log(`🔥 Trying DexScreener trending tokens as ultimate fallback...`);
    
    // Try trending tokens as fallback
    const trendingCoins = await getCoinsFromTrending(count);
    if (trendingCoins.length >= count) {
      return trendingCoins.map(c => ({
        contractAddress: c.contractAddress,
        symbol: c.symbol,
        name: c.name,
        imageUrl: c.imageUrl,
        fromTrending: true,
      }));
    }
    
    return [];
  }

  // Delete coins from queue after using them
  const coinIds = coins.map(c => c.id);
  await supabase
    .from('fallback_coin_queue')
    .delete()
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

  // Reset cooldown so bootstrap runs immediately
  lastBootstrapAttempt = 0;
  isBootstrapping = false;
  isChecking = false;
  
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
  if (isMonitoring) {
    // Already monitoring, but run an immediate check since we just enabled
    console.log('🔄 Already monitoring, running immediate check...');
    checkAndCycleAuctions();
    return;
  }
  
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
      .in('status', ['SCHEDULED', 'ACTIVE'])
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

  // CASE 2b: No active/scheduled market - check if the linked market just settled
  // This catches the case where settlement happened but we need to trigger the next cycle
  if (!currentMarket && autoCycleConfig.linkedMarketId) {
    const { data: linkedMarket } = await supabase
      .from('markets')
      .select('*')
      .eq('id', autoCycleConfig.linkedMarketId)
      .single();
    
    if (linkedMarket && linkedMarket.status === 'SETTLED') {
      console.log(`🏁 Linked market ${linkedMarket.title} is SETTLED - triggering next auction cycle...`);
      
      // Stop auction if still running (shouldn't be, but safety check)
      if (auctionConfig.isActive) {
        await stopOnChainAuction();
      }
      
      // Finalize and create new market
      await finalizeAuctionAndCreateMarket();
      return;
    }
  }

  // CASE 3: Current market exists (scheduled or active)
  if (currentMarket) {
    const isScheduled = currentMarket.status === 'SCHEDULED';
    
    // Update linked market in DB if not set
    if (autoCycleConfig.linkedMarketId !== currentMarket.id) {
      await supabase
        .from('auction_config')
        .update({ linked_market_id: currentMarket.id })
        .eq('id', 1);
    }

    // CASE 3a: SCHEDULED market - auction runs, waiting for market to activate
    if (isScheduled) {
      const startTime = new Date(currentMarket.start_time || currentMarket.lock_time);
      const minutesToActivation = (startTime.getTime() - now.getTime()) / (1000 * 60);
      
      console.log(`📊 Market: ${currentMarket.title} (SCHEDULED, activates in ${Math.round(minutesToActivation)} min)`);
      
      // Check if auction is marked active but has actually expired (timer ran out)
      // In this case, we need to clean up the old auction and start a fresh one
      const auctionExpired = auctionConfig.isActive && auctionConfig.auctionEnd && now > auctionConfig.auctionEnd;
      
      if (auctionExpired) {
        console.log('⚠️ Old auction expired but still marked active - cleaning up...');
        console.log(`   Auction end: ${auctionConfig.auctionEnd.toISOString()}`);
        console.log(`   Current time: ${now.toISOString()}`);
        
        // Stop the expired auction (this will let us finalize and clear)
        await stopOnChainAuction();
        
        // Wait a moment for state to update
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Clear old bids (both on-chain and database)
        await clearOnChainAuctionBids();
        await clearDatabaseBids();
        
        // Wait a moment
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Now start a fresh auction for the current scheduled market
        const settleTime = new Date(currentMarket.settle_time);
        const hoursUntilSettle = Math.max(1, Math.floor((settleTime.getTime() - now.getTime()) / (1000 * 60 * 60)));
        console.log(`🎪 Starting fresh auction (${hoursUntilSettle} hours until market settles)`);
        await startOnChainAuction(hoursUntilSettle);
        return;
      }
      
      // If auction not running, start it for the full cycle
      if (!auctionConfig.isActive) {
        // Auction runs until market settles (start_time + 12h battle = settle_time)
        const settleTime = new Date(currentMarket.settle_time);
        const hoursUntilSettle = Math.max(1, Math.floor((settleTime.getTime() - now.getTime()) / (1000 * 60 * 60)));
        console.log(`🎪 Starting auction (${hoursUntilSettle} hours until market settles)`);
        await startOnChainAuction(hoursUntilSettle);
      }
      // Don't finalize for SCHEDULED markets - just let them transition to ACTIVE via scheduledMarketActivation
      return;
    }

    // CASE 3b: ACTIVE market - auction runs alongside battle, finalize when battle ends
    const settleTime = new Date(currentMarket.settle_time);
    const minutesRemaining = (settleTime.getTime() - now.getTime()) / (1000 * 60);

    console.log(`📊 Market: ${currentMarket.title} (ACTIVE, settles in ${Math.round(minutesRemaining)} min)`);

    // Check if auction has ended (either by timer or manually stopped)
    // If auction ended but market is still active, we should schedule the next battle now
    const auctionEnded = !auctionConfig.isActive || (auctionConfig.auctionEnd && now > auctionConfig.auctionEnd);
    
    if (auctionEnded) {
      console.log('🏁 Auction has ended while market is still active - scheduling next battle...');
      console.log(`   Auction isActive: ${auctionConfig.isActive}`);
      console.log(`   Auction end time: ${auctionConfig.auctionEnd ? new Date(auctionConfig.auctionEnd).toISOString() : 'N/A'}`);
      console.log(`   Current time: ${now.toISOString()}`);
      await finalizeAuctionAndCreateMarket();
      return;
    }

    // If auction not running, start it to run alongside the active battle
    if (!auctionConfig.isActive) {
      const hoursUntilEnd = Math.max(1, Math.floor((minutesRemaining - 5) / 60));
      console.log(`🎪 Starting auction to run alongside active market (${hoursUntilEnd} hours remaining)`);
      await startOnChainAuction(hoursUntilEnd);
      return;
    }

    // Market is about to settle - stop auction, finalize, refund losers, create next market
    if (minutesRemaining <= 2) {
      console.log('⏰ Market battle ending soon, stopping auction...');
      const stopped = await stopOnChainAuction();
      if (stopped) {
        // Wait a moment for on-chain confirmation, then finalize
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
    .eq('status', 'SCHEDULED')
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
  const usingTrending = fallbackCoins.some(c => c.fromTrending);
  console.log(`${usingTrending ? '🔥' : '📦'} Got ${fallbackCoins.length} coins${usingTrending ? ' from DexScreener trending' : ' from queue'}:`, fallbackCoins.map(c => c.symbol).join(', ') || 'none');
  
  if (fallbackCoins.length < 2) {
    console.log('⚠️ Need at least 2 coins to bootstrap. Add coins to fallback queue or ensure DexScreener API is working.');
    return;
  }
  
  // Fetch current prices for fallback coins
  console.log(`📡 Fetching prices for ${fallbackCoins[0].symbol} and ${fallbackCoins[1].symbol}...`);
  const token1 = await getTokenByAddress(fallbackCoins[0].contractAddress);
  const token2 = await getTokenByAddress(fallbackCoins[1].contractAddress);
  
  console.log(`📡 Token1 result:`, token1 ? `${token1.symbol} @ $${token1.price}` : 'FAILED');
  console.log(`📡 Token2 result:`, token2 ? `${token2.symbol} @ $${token2.price}` : 'FAILED');
  
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
  
  // NOTE: On-chain market is NOT created here - it will be created when the market
  // transitions from "scheduled" to "active" by scheduledMarketActivation service
  console.log(`📋 Market will be created on-chain when scheduled period ends at ${startTime.toLocaleString()}`);
  
  // Create database market (scheduled, no on-chain ID yet)
  const marketId = `market-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  const marketData = {
    id: marketId,
    title: `${coin1.symbol} vs ${coin2.symbol}`,
    stock_symbol: `${coin1.symbol}-${coin2.symbol}`,
    description: `Which coin will have the higher price increase? Preview until ${startTime.toLocaleString()}, battle until ${settleTime.toLocaleString()}.`,
    is_dual_coin: true,
    status: 'SCHEDULED',
    start_time: startTime.toISOString(),
    total_cost: 0,
    reference_price: 0,
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
    // contract_market_id will be set when market activates (on-chain creation)
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
  
  // Clear any old bids and start fresh auction (both on-chain and database)
  console.log('🧹 Clearing old auction bids...');
  await clearOnChainAuctionBids();
  await clearDatabaseBids();
  
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
 * 
 * COMPLETE FLOW:
 * 1. Get top 2 auction winners (different coins) from on-chain leaderboard
 * 2. If not enough bids, fall back to coins from fallback_coin_queue
 * 3. Call finalizeOnChainAuction(winnerBidIds) - this triggers smart contract to:
 *    - Mark winners
 *    - AUTO-REFUND all losing bidders (returns their USDC)
 *    - Vault winning bid amounts for treasury
 * 4. Create new SCHEDULED dual-coin market in database with winner coin addresses
 * 5. Clear old auction bids on-chain
 * 6. Start new 24-hour auction
 * 7. scheduledMarketActivation service will later:
 *    - Activate the market when start_time arrives
 *    - Create the on-chain battle market with the coin symbols
 *    - Fetch fresh prices at activation time
 * 
 * Falls back to queue if not enough auction bids
 */
async function finalizeAuctionAndCreateMarket() {
  try {
    console.log('🏁 Finalizing auction and creating new market...');
    console.log('   Step 1: Get auction winners from on-chain leaderboard');
    
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
        await clearDatabaseBids();
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
        await clearDatabaseBids();
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

    // Finalize auction on-chain if we had winners (this refunds losers automatically)
    if (hadAuctionWinners && winnerBidIds.length === 2) {
      console.log(`🏆 Finalizing auction on-chain with winners - this will refund all losers...`);
      console.log(`   Winner 1: ${coin1.symbol} (${coin1.address.slice(0, 10)}...)`);
      console.log(`   Winner 2: ${coin2.symbol} (${coin2.address.slice(0, 10)}...)`);
      
      const finalized = await finalizeOnChainAuction(winnerBidIds);
      if (!finalized) {
        console.error('⚠️ On-chain auction finalization failed - continuing with market creation anyway');
        // Don't return - we still want to create the next market
        // Bids can be manually refunded later if needed
      } else {
        console.log('✅ Auction finalized on-chain - losers have been refunded');
      }
    } else {
      console.log('📦 No auction winners - using fallback coins, skipping on-chain finalization');
    }

    const supabase = getDb();

    // Use the next 24-hour session timing
    const { startTime, lockTime, settleTime, auctionDurationHours, sessionLabel } = getNext24HourCycleTiming();
    console.log(`\n📅 Step 4: Creating SCHEDULED market for coin battle`);
    console.log(`   Session: ${sessionLabel}`);
    console.log(`   Coin A: ${coin1.symbol} (${coin1.name})`);
    console.log(`   Coin A Address: ${coin1.address}`);
    console.log(`   Coin B: ${coin2.symbol} (${coin2.name})`);
    console.log(`   Coin B Address: ${coin2.address}`);
    console.log(`   Start (goes active): ${startTime.toLocaleString()}`);
    console.log(`   Lock (betting stops): ${lockTime.toLocaleString()}`);
    console.log(`   Settle: ${settleTime.toLocaleString()}`);
    console.log(`   Total cycle: 24 hours (12h preview + 12h battle)`);

    // NOTE: On-chain market is NOT created here - it will be created when the market
    // transitions from "scheduled" to "active" by scheduledMarketActivation service
    console.log(`\n📋 Step 5: Market will be deployed on-chain when scheduled period ends`);
    console.log(`   On-chain deployment at: ${startTime.toLocaleString()}`);
    console.log(`   scheduledMarketActivation service will handle on-chain creation`);

    // Create database market as SCHEDULED (will auto-activate at startTime)
    const marketId = `market-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    const marketData = {
      id: marketId,
      title: `${coin1.symbol} vs ${coin2.symbol}`,
      stock_symbol: `${coin1.symbol}-${coin2.symbol}`,
      description: `Which coin will have the higher price increase? Preview until ${startTime.toLocaleString()}, battle until ${settleTime.toLocaleString()}.`,
      is_dual_coin: true,
      status: 'SCHEDULED',  // Start as scheduled, auto-activates at startTime
      start_time: startTime.toISOString(),  // When market goes active
      total_cost: 0,
      reference_price: 0,
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
      // contract_market_id will be set when market activates (on-chain creation)
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

    console.log(`✅ Created new scheduled market: ${newMarket.title} (DB ID: ${newMarket.id})`);
    console.log(`   On-chain market will be created at ${startTime.toLocaleString()}`);

    // Link new market to auction config
    await supabase
      .from('auction_config')
      .update({ linked_market_id: newMarket.id })
      .eq('id', 1);

    // Clear old auction bids (on-chain and database)
    console.log('\n🧹 Step 6: Clearing old auction bids...');
    await clearOnChainAuctionBids();
    await clearDatabaseBids();

    // Start new auction for full 24-hour cycle
    console.log(`\n🎪 Step 7: Starting new auction for next cycle`);
    console.log(`   Duration: ${auctionDurationHours} hours`);
    await startOnChainAuction(auctionDurationHours);

    console.log('\n✅ ======== AUTO-CYCLE COMPLETE ========');
    console.log(`   ✓ Auction finalized (losers refunded)`);
    console.log(`   ✓ New market scheduled: ${coin1.symbol} vs ${coin2.symbol}`);
    console.log(`   ✓ Battle starts: ${startTime.toLocaleString()}`);
    console.log(`   ✓ New auction running for next winners`);
    console.log('=========================================\n');

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

/**
 * Manually trigger auction cycle check (for testing)
 * This bypasses the auto-cycle enabled check
 */
export async function triggerAuctionCycleCheck(): Promise<{ triggered: boolean; message: string }> {
  console.log('🧪 Manually triggering auction cycle check...');
  
  // Temporarily bypass the isChecking flag for manual trigger
  const wasChecking = isChecking;
  isChecking = false;
  
  try {
    await checkAndCycleAuctions();
    return { triggered: true, message: 'Auction cycle check completed' };
  } catch (error: any) {
    return { triggered: false, message: error.message };
  } finally {
    isChecking = wasChecking;
  }
}

/**
 * Manually trigger auction finalization and new market creation (for testing)
 * This creates a new market from auction winners (or fallback queue)
 */
export async function triggerFinalizeAndCreateMarket(): Promise<{ triggered: boolean; message: string }> {
  console.log('🧪 Manually triggering auction finalization and new market creation...');
  
  try {
    await finalizeAuctionAndCreateMarket();
    return { triggered: true, message: 'Auction finalized and new market created' };
  } catch (error: any) {
    return { triggered: false, message: error.message };
  }
}
