/**
 * Supabase Database Service
 * Persists market data to PostgreSQL for reliability across server restarts
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Market, MarketStatus, Bet, Position } from '../types/market';

let supabase: SupabaseClient | null = null;

/**
 * Get Supabase client instance
 */
export function getSupabase(): SupabaseClient | null {
  return supabase;
}

/**
 * Initialize Supabase client
 */
export function initializeDatabase(): boolean {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  console.log('🔍 Checking Supabase config...');
  console.log('   URL:', url ? `${url.substring(0, 30)}...` : 'NOT SET');
  console.log('   KEY:', key ? `${key.substring(0, 20)}... (${process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SERVICE' : 'ANON'})` : 'NOT SET');

  if (!url || !key) {
    console.log('⚠️  Supabase not configured - using in-memory storage only');
    console.log('   Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env to enable persistence');
    return false;
  }

  try {
    supabase = createClient(url, key);
    console.log('✅ Supabase database connected');
    return true;
  } catch (error: any) {
    console.error('❌ Failed to connect to Supabase:', error.message);
    return false;
  }
}

/**
 * Check if database is available
 */
export function isDatabaseConnected(): boolean {
  return supabase !== null;
}

// ============================================
// MARKET OPERATIONS
// ============================================

/**
 * Save a market to the database
 */
export async function saveMarket(market: Market): Promise<boolean> {
  if (!supabase) return false;

  try {
    // Debug log all price values being saved
    console.log(`💾 Saving market ${market.id}:`);
    console.log(`   openingPrice: ${market.openingPrice} (type: ${typeof market.openingPrice})`);
    console.log(`   currentPrice: ${market.currentPrice} (type: ${typeof market.currentPrice})`);
    console.log(`   closingPrice: ${market.closingPrice} (type: ${typeof market.closingPrice})`);
    if (market.isDualCoin) {
      console.log(`   coinAOpeningPrice: ${market.coinAOpeningPrice} (type: ${typeof market.coinAOpeningPrice})`);
      console.log(`   coinBOpeningPrice: ${market.coinBOpeningPrice} (type: ${typeof market.coinBOpeningPrice})`);
    }
    
    const { error } = await supabase
      .from('markets')
      .upsert({
        id: market.id,
        blockchain_market_id: market.blockchainMarketId,
        stock_symbol: market.stockSymbol,
        stock_name: market.stockName,
        description: market.description,
        status: market.status,
        reference_price: market.openingPrice,
        current_price: market.currentPrice,
        final_price: market.closingPrice,
        start_time: market.startTime?.toISOString(),
        lock_time: market.lockTime.toISOString(),
        settle_time: market.settleTime.toISOString(),
        is_after_hours: market.isAfterHours,
        winning_position: market.winningPosition,
        price_change: market.priceChange,
        price_change_percent: market.priceChangePercent !== undefined ? Math.min(Math.max(market.priceChangePercent, -999999), 999999) : null,
        up_pool: market.upPool,
        down_pool: market.downPool,
        total_pool: market.totalPool,
        total_bets: market.totalBets,
        category: market.category,
        contract_address: market.contractAddress,
        image_url: market.imageUrl,
        is_dual_coin: market.isDualCoin || false,
        coin_a_symbol: market.coinASymbol,
        coin_a_name: market.coinAName,
        coin_a_address: market.coinAAddress,
        coin_a_image_url: market.coinAImageUrl,
        coin_a_opening_price: market.coinAOpeningPrice,
        coin_a_current_price: market.coinACurrentPrice,
        coin_a_closing_price: market.coinAClosingPrice,
        coin_a_change_percent: market.coinAChangePercent !== undefined ? Math.min(Math.max(market.coinAChangePercent, -999999), 999999) : null,
        coin_b_symbol: market.coinBSymbol,
        coin_b_name: market.coinBName,
        coin_b_address: market.coinBAddress,
        coin_b_image_url: market.coinBImageUrl,
        coin_b_opening_price: market.coinBOpeningPrice,
        coin_b_current_price: market.coinBCurrentPrice,
        coin_b_closing_price: market.coinBClosingPrice,
        coin_b_change_percent: market.coinBChangePercent !== undefined ? Math.min(Math.max(market.coinBChangePercent, -999999), 999999) : null,
        auto_recreate: market.autoRecreate ?? false,
        created_at: market.createdAt.toISOString(),
      }, { onConflict: 'id' });

    if (error) {
      console.error('❌ Error saving market:', error.message);
      console.error('   Full error:', JSON.stringify(error, null, 2));
      console.error('   Market ID:', market.id);
      console.error('   isDualCoin:', market.isDualCoin);
      return false;
    }
    console.log(`✅ Market saved to database: ${market.id} (isDualCoin: ${market.isDualCoin})`);
    if (market.isDualCoin) {
      console.log(`   Coin A opening price (stored): ${market.coinAOpeningPrice}`);
      console.log(`   Coin B opening price (stored): ${market.coinBOpeningPrice}`);
    }
    return true;
  } catch (error: any) {
    console.error('❌ Error saving market:', error.message);
    return false;
  }
}

/**
 * Load all markets from database
 */
export async function loadAllMarkets(): Promise<Market[]> {
  if (!supabase) return [];

  try {
    const { data, error } = await supabase
      .from('markets')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Error loading markets:', error.message);
      return [];
    }

    const markets = (data || []).map(dbMarketToMarket);
    
    // Filter out invalid dual coin markets (missing required addresses)
    const validMarkets = markets.filter(m => {
      if (m.isDualCoin) {
        if (!m.coinAAddress || !m.coinBAddress) {
          console.log(`⚠️  Skipping invalid dual coin market: ${m.stockSymbol} (missing coin addresses)`);
          return false;
        }
      }
      return true;
    });
    
    return validMarkets;
  } catch (error: any) {
    console.error('❌ Error loading markets:', error.message);
    return [];
  }
}

/**
 * Load active markets from database
 */
export async function loadActiveMarkets(): Promise<Market[]> {
  if (!supabase) return [];

  try {
    const { data, error } = await supabase
      .from('markets')
      .select('*')
      .in('status', ['ACTIVE', 'LOCKED'])
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Error loading active markets:', error.message);
      return [];
    }

    return (data || []).map(dbMarketToMarket);
  } catch (error: any) {
    console.error('❌ Error loading active markets:', error.message);
    return [];
  }
}

/**
 * Update market status
 */
export async function updateMarketStatus(marketId: string, status: MarketStatus): Promise<boolean> {
  if (!supabase) return false;

  try {
    const { error } = await supabase
      .from('markets')
      .update({ status })
      .eq('id', marketId);

    if (error) {
      console.error('❌ Error updating market status:', error.message);
      return false;
    }
    return true;
  } catch (error: any) {
    console.error('❌ Error updating market status:', error.message);
    return false;
  }
}

/**
 * Update market price
 */
export async function updateMarketPriceInDb(marketId: string, currentPrice: number): Promise<boolean> {
  if (!supabase) return false;

  try {
    const { error } = await supabase
      .from('markets')
      .update({ current_price: currentPrice })
      .eq('id', marketId);

    if (error) {
      console.error('❌ Error updating market price:', error.message);
      return false;
    }
    return true;
  } catch (error: any) {
    console.error('❌ Error updating market price:', error.message);
    return false;
  }
}

/**
 * Update blockchain market ID after on-chain creation
 */
export async function updateBlockchainMarketId(marketId: string, blockchainMarketId: number): Promise<boolean> {
  if (!supabase) return false;

  try {
    const { error } = await supabase
      .from('markets')
      .update({ blockchain_market_id: blockchainMarketId })
      .eq('id', marketId);

    if (error) {
      console.error('❌ Error updating blockchain market ID:', error.message);
      return false;
    }
    console.log(`💾 Saved blockchain market ID ${blockchainMarketId} for ${marketId}`);
    return true;
  } catch (error: any) {
    console.error('❌ Error updating blockchain market ID:', error.message);
    return false;
  }
}

/**
 * Mark market as settled
 */
export async function settleMarketInDb(
  marketId: string, 
  closingPrice: number, 
  winningPosition: Position,
  priceChange: number,
  priceChangePercent: number
): Promise<boolean> {
  if (!supabase) return false;

  try {
    const { error } = await supabase
      .from('markets')
      .update({ 
        status: MarketStatus.SETTLED,
        final_price: closingPrice,
        winning_position: winningPosition,
        price_change: priceChange,
        price_change_percent: priceChangePercent,
      })
      .eq('id', marketId);

    if (error) {
      console.error('❌ Error settling market in DB:', error.message);
      return false;
    }
    return true;
  } catch (error: any) {
    console.error('❌ Error settling market in DB:', error.message);
    return false;
  }
}

/**
 * Delete a market
 */
export async function deleteMarketFromDb(marketId: string): Promise<boolean> {
  if (!supabase) {
    console.log('⚠️  Database not connected - cannot delete from DB');
    return false;
  }

  try {
    console.log(`🗑️  Attempting to delete market from database: ${marketId}`);
    const { error } = await supabase
      .from('markets')
      .delete()
      .eq('id', marketId);

    if (error) {
      console.error('❌ Error deleting market from database:', error.message);
      console.error('   Market ID:', marketId);
      return false;
    }
    console.log(`✅ Successfully deleted market from database: ${marketId}`);
    return true;
  } catch (error: any) {
    console.error('❌ Error deleting market from database:', error.message);
    return false;
  }
}

/**
 * Delete ALL markets from the database
 * Used for complete reset
 */
export async function deleteAllMarketsFromDb(): Promise<number> {
  if (!supabase) return 0;

  try {
    // First get count
    const { data: toDelete, error: countError } = await supabase
      .from('markets')
      .select('id');

    if (countError) {
      console.error('❌ Error counting markets:', countError.message);
      return 0;
    }

    const deleteCount = toDelete?.length || 0;
    if (deleteCount === 0) {
      console.log('ℹ️  No markets in database to delete');
      return 0;
    }

    // Delete ALL markets
    const { error } = await supabase
      .from('markets')
      .delete()
      .neq('id', 'impossible-id'); // This matches all rows

    if (error) {
      console.error('❌ Error deleting all markets:', error.message);
      return 0;
    }

    console.log(`🗑️ Deleted ${deleteCount} markets from database`);
    return deleteCount;
  } catch (error: any) {
    console.error('❌ Error deleting all markets:', error.message);
    return 0;
  }
}

/**
 * Clean up old settled markets (keep for 7 days for history)
 * Returns the number of markets deleted
 */
export async function cleanupOldSettledMarkets(daysToKeep: number = 7): Promise<number> {
  if (!supabase) return 0;

  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    // First get count of markets to delete
    const { data: toDelete, error: countError } = await supabase
      .from('markets')
      .select('id')
      .eq('status', 'SETTLED')
      .lt('settle_time', cutoffDate.toISOString());

    if (countError) {
      console.error('❌ Error counting old markets:', countError.message);
      return 0;
    }

    const deleteCount = toDelete?.length || 0;
    if (deleteCount === 0) {
      return 0;
    }

    // Delete old settled markets
    const { error } = await supabase
      .from('markets')
      .delete()
      .eq('status', 'SETTLED')
      .lt('settle_time', cutoffDate.toISOString());

    if (error) {
      console.error('❌ Error cleaning up old markets:', error.message);
      return 0;
    }

    console.log(`🗑️ Cleaned up ${deleteCount} settled markets older than ${daysToKeep} days`);
    return deleteCount;
  } catch (error: any) {
    console.error('❌ Error cleaning up old markets:', error.message);
    return 0;
  }
}

/**
 * Clean up duplicate active markets (keep only one per symbol)
 * This can happen if sync runs multiple times before markets settle
 * 
 * IMPORTANT: When duplicates exist, we keep the one whose blockchain_market_id
 * is valid (not null) and matches the symbol. If multiple have blockchain IDs,
 * keep the one with the highest ID (most recent on-chain market).
 */
export async function cleanupDuplicateActiveMarkets(): Promise<number> {
  if (!supabase) return 0;

  try {
    // Get all active markets
    const { data: activeMarkets, error: fetchError } = await supabase
      .from('markets')
      .select('*')
      .eq('status', 'ACTIVE')
      .order('blockchain_market_id', { ascending: false, nullsFirst: false });

    if (fetchError) {
      console.error('❌ Error fetching active markets:', fetchError.message);
      return 0;
    }

    if (!activeMarkets || activeMarkets.length === 0) {
      return 0;
    }

    // Group by symbol and find duplicates
    // For dual-coin markets, use composite key of both coin addresses
    const symbolMap = new Map<string, any[]>();
    for (const market of activeMarkets) {
      let key: string;
      
      // For dual-coin markets, create a unique key from both addresses
      if (market.is_dual_coin && market.coin_a_address && market.coin_b_address) {
        key = `DUAL:${market.coin_a_address.toLowerCase()}:${market.coin_b_address.toLowerCase()}`;
      } else {
        // For single-coin markets, use the symbol
        const symbol = market.stock_symbol?.toUpperCase();
        if (!symbol) continue;
        key = symbol;
      }
      
      if (!symbolMap.has(key)) {
        symbolMap.set(key, []);
      }
      symbolMap.get(key)!.push(market);
    }

    // Find markets to delete
    // Priority: Keep the one with highest blockchain_market_id (most recent on-chain)
    // This ensures we keep the market that was actually created on-chain for this session
    const marketsToDelete: string[] = [];
    for (const [key, markets] of symbolMap.entries()) {
      if (markets.length > 1) {
        // Markets are already sorted by blockchain_market_id DESC
        // Keep the first one (highest blockchain ID), delete the rest
        const toKeep = markets[0];
        const toDelete = markets.slice(1);
        const displayName = markets[0].is_dual_coin 
          ? `${markets[0].coin_a_symbol}vs${markets[0].coin_b_symbol}` 
          : key;
        console.log(`🔍 Found ${markets.length} active ${displayName} markets`);
        console.log(`   Keeping: blockchain_market_id=${toKeep.blockchain_market_id}, id=${toKeep.id}`);
        console.log(`   Deleting: ${toDelete.map((m: any) => `id=${m.id} (blockchain=${m.blockchain_market_id})`).join(', ')}`);
        marketsToDelete.push(...toDelete.map((m: any) => m.id));
      }
    }

    if (marketsToDelete.length === 0) {
      return 0;
    }

    // Delete duplicate markets
    const { error: deleteError } = await supabase
      .from('markets')
      .delete()
      .in('id', marketsToDelete);

    if (deleteError) {
      console.error('❌ Error deleting duplicate markets:', deleteError.message);
      return 0;
    }

    console.log(`🗑️ Cleaned up ${marketsToDelete.length} duplicate active markets`);
    return marketsToDelete.length;
  } catch (error: any) {
    console.error('❌ Error cleaning up duplicates:', error.message);
    return 0;
  }
}

// ============================================
// BET OPERATIONS (for analytics/history)
// ============================================

/**
 * Save a bet to the database
 */
export async function saveBet(bet: Bet): Promise<boolean> {
  if (!supabase) return false;

  try {
    const { error } = await supabase
      .from('bets')
      .insert({
        id: bet.id,
        market_id: bet.marketId,
        user_address: bet.userAddress,
        position: bet.position,
        amount: bet.amount,
        odds: bet.odds,
        settled: bet.settled,
        won: bet.won,
        payout: bet.payout,
        claimed: bet.claimed,
        created_at: bet.timestamp.toISOString(),
      });

    if (error) {
      console.error('❌ Error saving bet:', error.message);
      return false;
    }
    return true;
  } catch (error: any) {
    console.error('❌ Error saving bet:', error.message);
    return false;
  }
}

/**
 * Load bets for a user
 */
export async function loadUserBets(userAddress: string): Promise<Bet[]> {
  if (!supabase) return [];

  try {
    const { data, error } = await supabase
      .from('bets')
      .select('*')
      .eq('user_address', userAddress.toLowerCase())
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Error loading user bets:', error.message);
      return [];
    }

    return (data || []).map(dbBetToBet);
  } catch (error: any) {
    console.error('❌ Error loading user bets:', error.message);
    return [];
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Convert database row to Market object
 */
function dbMarketToMarket(row: any): Market {
  // Debug log for dual coin markets
  if (row.is_dual_coin) {
    console.log(`🔍 Loading dual coin market from DB: ${row.stock_symbol}`);
    console.log(`   Status: ${row.status}`);
    console.log(`   Blockchain ID: ${row.blockchain_market_id}`);
    console.log(`   Coin A opening: ${row.coin_a_opening_price} (type: ${typeof row.coin_a_opening_price})`);
    console.log(`   Coin B opening: ${row.coin_b_opening_price} (type: ${typeof row.coin_b_opening_price})`);
  }
  
  return {
    id: row.id,
    blockchainMarketId: row.blockchain_market_id,
    stockSymbol: row.stock_symbol,
    stockName: row.stock_name,
    description: row.description,
    status: (row.status?.toUpperCase() || 'ACTIVE') as MarketStatus,
    createdAt: new Date(row.created_at),
    startTime: row.start_time ? new Date(row.start_time) : undefined,
    lockTime: new Date(row.lock_time),
    settleTime: new Date(row.settle_time),
    openingPrice: row.reference_price,
    currentPrice: row.current_price,
    closingPrice: row.final_price,
    openTimestamp: new Date(row.created_at),
    closeTimestamp: row.final_price ? new Date() : undefined,
    isAfterHours: row.is_after_hours,
    upPool: row.up_pool || 0,
    downPool: row.down_pool || 0,
    totalPool: row.total_pool || 0,
    upBettors: 0,
    downBettors: 0,
    totalBets: row.total_bets || 0,
    winningPosition: row.winning_position as Position | undefined,
    priceChange: row.price_change,
    priceChangePercent: row.price_change_percent,
    category: row.category,
    contractAddress: row.contract_address,
    imageUrl: row.image_url,
    isDualCoin: row.is_dual_coin || false,
    coinASymbol: row.coin_a_symbol,
    coinAName: row.coin_a_name,
    coinAAddress: row.coin_a_address,
    coinAImageUrl: row.coin_a_image_url,
    coinAOpeningPrice: row.coin_a_opening_price,
    coinACurrentPrice: row.coin_a_current_price,
    coinAClosingPrice: row.coin_a_closing_price,
    coinAChangePercent: row.coin_a_change_percent,
    coinBSymbol: row.coin_b_symbol,
    coinBName: row.coin_b_name,
    coinBAddress: row.coin_b_address,
    coinBImageUrl: row.coin_b_image_url,
    coinBOpeningPrice: row.coin_b_opening_price,
    coinBCurrentPrice: row.coin_b_current_price,
    coinBClosingPrice: row.coin_b_closing_price,
    coinBChangePercent: row.coin_b_change_percent,
    autoRecreate: row.auto_recreate ?? false,
  };
}

function dbBetToBet(row: any): Bet {
  return {
    id: row.id,
    marketId: row.market_id,
    userAddress: row.user_address,
    position: row.position as Position,
    amount: row.amount,
    odds: row.odds,
    timestamp: new Date(row.created_at),
    settled: row.settled,
    won: row.won,
    payout: row.payout,
    claimed: row.claimed,
  };
}

// ============================================
// PAUSED SYMBOLS OPERATIONS
// ============================================

/**
 * Save a paused symbol to the database
 */
export async function savePausedSymbol(symbol: string): Promise<boolean> {
  if (!supabase) return false;

  try {
    const { error } = await supabase
      .from('paused_symbols')
      .upsert({
        symbol: symbol.toUpperCase(),
        paused_at: new Date().toISOString(),
      }, { onConflict: 'symbol' });

    if (error) {
      console.error('❌ Error saving paused symbol:', error.message);
      return false;
    }
    return true;
  } catch (error: any) {
    console.error('❌ Error saving paused symbol:', error.message);
    return false;
  }
}

/**
 * Remove a paused symbol from the database
 */
export async function removePausedSymbol(symbol: string): Promise<boolean> {
  if (!supabase) return false;

  try {
    const { error } = await supabase
      .from('paused_symbols')
      .delete()
      .eq('symbol', symbol.toUpperCase());

    if (error) {
      console.error('❌ Error removing paused symbol:', error.message);
      return false;
    }
    return true;
  } catch (error: any) {
    console.error('❌ Error removing paused symbol:', error.message);
    return false;
  }
}

/**
 * Load all paused symbols from the database
 */
export async function loadPausedSymbols(): Promise<string[]> {
  if (!supabase) return [];

  try {
    const { data, error } = await supabase
      .from('paused_symbols')
      .select('symbol');

    if (error) {
      console.error('❌ Error loading paused symbols:', error.message);
      return [];
    }

    return (data || []).map((row: any) => row.symbol);
  } catch (error: any) {
    console.error('❌ Error loading paused symbols:', error.message);
    return [];
  }
}
