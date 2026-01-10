/**
 * Auction Auto-Cycle Service
 * Automatically manages auction lifecycle synced to dual coin battles
 * 
 * FLOW:
 * 1. Dual coin market starts -> Auction starts (runs alongside market)
 * 2. Market ends -> Stop auction, finalize with winners, refund losers
 * 3. Create new dual coin market from winning bids
 * 4. Clear old auction data and start new auction
 * 5. Repeat
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
import { getNext12HourSettlement } from './cryptoSync';

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

  const now = new Date();

  // CASE 1: No active market and no active auction - need to bootstrap
  if (!activeMarket && !auctionConfig.isActive) {
    console.log('🚀 No active market or auction - bootstrapping auto-cycle...');
    await bootstrapAutoCycle();
    return;
  }

  // CASE 2: No active market but auction exists - finalize and create market
  if (!activeMarket && auctionConfig.isActive) {
    // Check if auction has ended
    if (now > auctionConfig.auctionEnd) {
      console.log('🏁 Auction ended, no active market - finalizing and creating new market...');
      await finalizeAuctionAndCreateMarket();
    }
    return;
  }

  // CASE 3: Active market exists
  if (activeMarket) {
    const marketEndTime = new Date(activeMarket.resolution_time);
    const minutesRemaining = (marketEndTime.getTime() - now.getTime()) / (1000 * 60);

    // Update linked market in DB if not set
    if (autoCycleConfig.linkedMarketId !== activeMarket.id) {
      await supabase
        .from('auction_config')
        .update({ linked_market_id: activeMarket.id })
        .eq('id', 1);
    }

    // If auction not running, start it
    if (!auctionConfig.isActive) {
      // Calculate hours until market ends (minus 5 minutes buffer)
      const hoursUntilEnd = Math.max(1, Math.floor((minutesRemaining - 5) / 60));
      console.log(`🎪 Starting auction to run alongside market (${hoursUntilEnd} hours)`);
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
}

/**
 * Bootstrap the auto-cycle with an initial market and auction
 */
async function bootstrapAutoCycle() {
  console.log('🚀 Bootstrapping auto-cycle...');
  
  // Check if there's a scheduled market we can activate
  const supabase = getDb();
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
    // Activate the scheduled market
    await supabase
      .from('markets')
      .update({ status: 'active' })
      .eq('id', scheduledMarket.id);
    
    // Link it and start auction
    await supabase
      .from('auction_config')
      .update({ linked_market_id: scheduledMarket.id })
      .eq('id', 1);
    
    // Start auction for 12 hours (standard session length)
    await startOnChainAuction(12);
    console.log('✅ Bootstrap complete - activated scheduled market and started auction');
  } else {
    console.log('⚠️ No scheduled market to bootstrap with. Create a dual coin market first.');
  }
}

/**
 * Finalize current auction, create new market from winners, and start new auction
 */
async function finalizeAuctionAndCreateMarket() {
  try {
    console.log('🏁 Finalizing auction and creating new market...');
    
    // Get top two winners from on-chain leaderboard
    const winners = await getOnChainTopTwoWinners();
    
    if (winners.length < 2) {
      console.log('⚠️ Not enough bids (need 2 different coins) - cannot create market');
      // Clear bids and start a new auction anyway
      await clearOnChainAuctionBids();
      await startOnChainAuction(12);
      return;
    }

    const [winner1, winner2] = winners;
    
    // Verify they are different coins
    if (winner1.coinAddress.toLowerCase() === winner2.coinAddress.toLowerCase()) {
      console.log('⚠️ Top bids are for the same coin - cannot create market');
      await clearOnChainAuctionBids();
      await startOnChainAuction(12);
      return;
    }

    console.log(`🏆 Winners: ${winner1.coinAddress.slice(0, 10)}... vs ${winner2.coinAddress.slice(0, 10)}...`);

    // Finalize auction on-chain (this refunds losers automatically)
    const finalized = await finalizeOnChainAuction([winner1.bidId, winner2.bidId]);
    
    if (!finalized) {
      console.error('❌ Failed to finalize auction on-chain');
      return;
    }

    // Fetch token info for both winners
    const token1 = await getTokenByAddress(winner1.coinAddress);
    const token2 = await getTokenByAddress(winner2.coinAddress);

    if (!token1 || !token2) {
      console.error('❌ Failed to fetch token info for winners');
      return;
    }

    const supabase = getDb();

    // Use the next 12-hour session timing
    const { lockTime, settleTime, sessionLabel } = getNext12HourSettlement();
    console.log(`📅 Creating market for ${sessionLabel}`);
    console.log(`   Lock: ${lockTime.toLocaleString()}`);
    console.log(`   Settle: ${settleTime.toLocaleString()}`);

    // Create on-chain market FIRST
    console.log(`⛓️ Creating on-chain dual coin market: ${token1.symbol} vs ${token2.symbol}`);
    const blockchainMarketId = await createDualCoinOnChainMarket(
      token1.symbol,
      token2.symbol,
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
      title: `${token1.symbol} vs ${token2.symbol}`,
      stock_symbol: `${token1.symbol}-${token2.symbol}`,
      description: `Which coin will have the higher price increase? Market runs until ${settleTime.toLocaleString()}.`,
      is_dual_coin: true,
      status: 'active',
      total_cost: 0,
      outcomes: 2,
      num_outcomes: 2,
      resolution_time: settleTime.toISOString(),
      lock_time: lockTime.toISOString(),
      coin_a_address: winner1.coinAddress,
      coin_a_symbol: token1.symbol,
      coin_a_name: token1.name,
      coin_a_opening_price: token1.price,
      coin_a_image_url: token1.imageUrl,
      coin_b_address: winner2.coinAddress,
      coin_b_symbol: token2.symbol,
      coin_b_name: token2.name,
      coin_b_opening_price: token2.price,
      coin_b_image_url: token2.imageUrl,
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

    // Calculate hours for new auction (until new market ends, minus buffer)
    const hoursUntilEnd = Math.max(1, Math.floor((settleTime.getTime() - Date.now()) / (1000 * 60 * 60) - 1));
    
    // Start new auction for next cycle
    console.log(`🎪 Starting new auction (${hoursUntilEnd} hours)`);
    await startOnChainAuction(hoursUntilEnd);

    console.log('✅ Auto-cycle complete! New market and auction are live.');

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
