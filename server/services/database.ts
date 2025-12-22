/**
 * Supabase Database Service
 * Persists market data to PostgreSQL for reliability across server restarts
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Market, MarketStatus, Bet, Position } from '../types/market';

let supabase: SupabaseClient | null = null;

/**
 * Initialize Supabase client
 */
export function initializeDatabase(): boolean {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;

  console.log('🔍 Checking Supabase config...');
  console.log('   URL:', url ? `${url.substring(0, 30)}...` : 'NOT SET');
  console.log('   KEY:', key ? `${key.substring(0, 20)}...` : 'NOT SET');

  if (!url || !key) {
    console.log('⚠️  Supabase not configured - using in-memory storage only');
    console.log('   Set SUPABASE_URL and SUPABASE_ANON_KEY in .env to enable persistence');
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
        lock_time: market.lockTime.toISOString(),
        settle_time: market.settleTime.toISOString(),
        is_after_hours: market.isAfterHours,
        winning_position: market.winningPosition,
        price_change: market.priceChange,
        price_change_percent: market.priceChangePercent,
        up_pool: market.upPool,
        down_pool: market.downPool,
        total_pool: market.totalPool,
        total_bets: market.totalBets,
        category: market.category,
        contract_address: market.contractAddress,
        image_url: market.imageUrl,
        created_at: market.createdAt.toISOString(),
      }, { onConflict: 'id' });

    if (error) {
      console.error('❌ Error saving market:', error.message);
      return false;
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

    return (data || []).map(dbMarketToMarket);
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
  if (!supabase) return false;

  try {
    const { error } = await supabase
      .from('markets')
      .delete()
      .eq('id', marketId);

    if (error) {
      console.error('❌ Error deleting market:', error.message);
      return false;
    }
    return true;
  } catch (error: any) {
    console.error('❌ Error deleting market:', error.message);
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
    const symbolMap = new Map<string, any[]>();
    for (const market of activeMarkets) {
      const symbol = market.stock_symbol?.toUpperCase();
      if (!symbol) continue;
      
      if (!symbolMap.has(symbol)) {
        symbolMap.set(symbol, []);
      }
      symbolMap.get(symbol)!.push(market);
    }

    // Find markets to delete
    // Priority: Keep the one with highest blockchain_market_id (most recent on-chain)
    // This ensures we keep the market that was actually created on-chain for this session
    const marketsToDelete: string[] = [];
    for (const [symbol, markets] of symbolMap.entries()) {
      if (markets.length > 1) {
        // Markets are already sorted by blockchain_market_id DESC
        // Keep the first one (highest blockchain ID), delete the rest
        const toKeep = markets[0];
        const toDelete = markets.slice(1);
        console.log(`🔍 Found ${markets.length} active ${symbol} markets`);
        console.log(`   Keeping: blockchain_market_id=${toKeep.blockchain_market_id}`);
        console.log(`   Deleting: ${toDelete.map((m: any) => m.blockchain_market_id).join(', ')}`);
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
  return {
    id: row.id,
    blockchainMarketId: row.blockchain_market_id,
    stockSymbol: row.stock_symbol,
    stockName: row.stock_name,
    description: row.description,
    status: row.status as MarketStatus,
    createdAt: new Date(row.created_at),
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
  };
}

/**
 * Convert database row to Bet object
 */
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
