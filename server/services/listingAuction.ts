/**
 * Listing Auction Service
 * Manages coin listing bids for dual coin market creation
 */

import { getSupabase } from './database';
import { getTokenByAddress } from './dexScreenerApi';

const getDb = () => {
  const db = getSupabase();
  if (!db) throw new Error('Database not initialized');
  return db;
};

export interface ListingBid {
  id: string;
  walletAddress: string;
  coinContractAddress: string;
  chain: 'base' | 'solana';
  coinSymbol: string;
  coinName?: string;
  marketCap?: number;
  bidAmount: number;
  txHash?: string;
  status: 'active' | 'winner' | 'refunded' | 'expired';
  createdAt: Date;
  updatedAt: Date;
  rank?: number;
}

export interface AuctionConfig {
  isActive: boolean;
  minMarketCap: number;
  maxMarketCap: number;
  minBidAmount: number;
  auctionDurationHours: number;
  currentAuctionStart?: Date;
  currentAuctionEnd?: Date;
}

/**
 * Get current auction configuration
 */
export async function getAuctionConfig(): Promise<AuctionConfig | null> {
  const supabase = getDb();
  const { data, error } = await supabase
    .from('auction_config')
    .select('*')
    .eq('id', 1)
    .single();

  if (error) {
    console.error('Error fetching auction config:', error);
    return null;
  }

  return {
    isActive: data.is_active,
    minMarketCap: parseFloat(data.min_market_cap),
    maxMarketCap: parseFloat(data.max_market_cap),
    minBidAmount: parseFloat(data.min_bid_amount),
    auctionDurationHours: data.auction_duration_hours,
    currentAuctionStart: data.current_auction_start ? new Date(data.current_auction_start) : undefined,
    currentAuctionEnd: data.current_auction_end ? new Date(data.current_auction_end) : undefined,
  };
}

/**
 * Update auction configuration (admin only)
 */
export async function updateAuctionConfig(config: Partial<AuctionConfig>): Promise<boolean> {
  const supabase = getDb();
  const updateData: any = {
    updated_at: new Date().toISOString(),
  };

  if (config.isActive !== undefined) updateData.is_active = config.isActive;
  if (config.minMarketCap !== undefined) updateData.min_market_cap = config.minMarketCap;
  if (config.maxMarketCap !== undefined) updateData.max_market_cap = config.maxMarketCap;
  if (config.minBidAmount !== undefined) updateData.min_bid_amount = config.minBidAmount;
  if (config.auctionDurationHours !== undefined) updateData.auction_duration_hours = config.auctionDurationHours;
  if (config.currentAuctionStart !== undefined) updateData.current_auction_start = config.currentAuctionStart;
  if (config.currentAuctionEnd !== undefined) updateData.current_auction_end = config.currentAuctionEnd;

  const { error } = await supabase
    .from('auction_config')
    .update(updateData)
    .eq('id', 1);

  if (error) {
    console.error('Error updating auction config:', error);
    return false;
  }

  return true;
}

/**
 * Start a new auction period
 */
export async function startAuction(durationHours: number = 24): Promise<boolean> {
  const now = new Date();
  const endTime = new Date(now.getTime() + durationHours * 60 * 60 * 1000);

  console.log(`🎪 Starting new auction: ${now.toISOString()} to ${endTime.toISOString()}`);

  return await updateAuctionConfig({
    isActive: true,
    currentAuctionStart: now,
    currentAuctionEnd: endTime,
    auctionDurationHours: durationHours,
  });
}

/**
 * Stop the current auction
 */
export async function stopAuction(): Promise<boolean> {
  console.log('🛑 Stopping auction');
  return await updateAuctionConfig({ isActive: false });
}

/**
 * Validate coin eligibility based on market cap
 */
export async function validateCoinEligibility(
  coinAddress: string,
  chain: 'base' | 'solana',
  config: AuctionConfig
): Promise<{ eligible: boolean; reason?: string; token?: any }> {
  try {
    const token = await getTokenByAddress(coinAddress);
    
    if (!token) {
      return { eligible: false, reason: `Token not found on DexScreener (${chain})` };
    }

    const marketCap = token.marketCap || 0;

    if (marketCap < config.minMarketCap) {
      return { 
        eligible: false, 
        reason: `Market cap $${marketCap.toLocaleString()} is below minimum $${config.minMarketCap.toLocaleString()}` 
      };
    }

    if (marketCap > config.maxMarketCap) {
      return { 
        eligible: false, 
        reason: `Market cap $${marketCap.toLocaleString()} is above maximum $${config.maxMarketCap.toLocaleString()}` 
      };
    }

    return { eligible: true, token };
  } catch (error: any) {
    return { eligible: false, reason: `Error validating token: ${error.message}` };
  }
}

/**
 * Submit a new bid
 */
export async function submitBid(
  walletAddress: string,
  coinContractAddress: string,
  chain: 'base' | 'solana',
  bidAmount: number,
  txHash?: string
): Promise<{ success: boolean; error?: string; bid?: ListingBid }> {
  // Check if auction is active
  const config = await getAuctionConfig();
  if (!config || !config.isActive) {
    return { success: false, error: 'No active auction' };
  }

  // Check if auction has ended
  if (config.currentAuctionEnd && new Date() > config.currentAuctionEnd) {
    return { success: false, error: 'Auction has ended' };
  }

  // Validate bid amount
  if (bidAmount < config.minBidAmount) {
    return { success: false, error: `Minimum bid is ${config.minBidAmount} USDC` };
  }

  // Validate coin eligibility
  const validation = await validateCoinEligibility(coinContractAddress, chain, config);
  if (!validation.eligible) {
    return { success: false, error: validation.reason };
  }

  const token = validation.token!;

  // Insert bid
  const supabase = getDb();
  const { data, error } = await supabase
    .from('listing_bids')
    .insert({
      wallet_address: walletAddress,
      coin_contract_address: coinContractAddress,
      chain: chain,
      coin_symbol: token.symbol,
      coin_name: token.name,
      market_cap: token.marketCap,
      bid_amount: bidAmount,
      tx_hash: txHash,
      status: 'active',
    })
    .select()
    .single();

  if (error) {
    console.error('Error inserting bid:', error);
    return { success: false, error: 'Failed to submit bid' };
  }

  console.log(`💰 New bid: ${token.symbol} (${chain}) - ${bidAmount} USDC from ${walletAddress}`);

  return { 
    success: true, 
    bid: {
      id: data.id,
      walletAddress: data.wallet_address,
      coinContractAddress: data.coin_contract_address,
      chain: data.chain,
      coinSymbol: data.coin_symbol,
      coinName: data.coin_name,
      marketCap: parseFloat(data.market_cap),
      bidAmount: parseFloat(data.bid_amount),
      txHash: data.tx_hash,
      status: data.status,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
    }
  };
}

/**
 * Get auction leaderboard
 */
export async function getLeaderboard(limit: number = 50): Promise<ListingBid[]> {
  const supabase = getDb();
  const { data, error } = await supabase
    .from('auction_leaderboard')
    .select('*')
    .order('rank', { ascending: true })
    .limit(limit);

  if (error) {
    console.error('Error fetching leaderboard:', error);
    return [];
  }

  return data.map((row: any) => ({
    id: row.id,
    walletAddress: row.wallet_address,
    chain: row.chain,
    coinContractAddress: row.coin_contract_address,
    coinSymbol: row.coin_symbol,
    coinName: row.coin_name,
    marketCap: parseFloat(row.market_cap),
    bidAmount: parseFloat(row.bid_amount),
    txHash: row.tx_hash,
    status: row.status,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    rank: row.rank,
  }));
}

/**
 * Get top 2 winners
 */
export async function getTopTwoWinners(): Promise<ListingBid[]> {
  const leaderboard = await getLeaderboard(2);
  return leaderboard.slice(0, 2);
}

/**
 * Finalize auction and mark winners
 */
export async function finalizeAuction(): Promise<{ success: boolean; winners?: ListingBid[] }> {
  console.log('🏆 Finalizing auction...');

  const winners = await getTopTwoWinners();
  
  if (winners.length < 2) {
    console.log('⚠️ Not enough bids to finalize auction');
    return { success: false };
  }

  const supabase = getDb();

  // Mark winners
  for (const winner of winners) {
    await supabase
      .from('listing_bids')
      .update({ status: 'winner', updated_at: new Date().toISOString() })
      .eq('id', winner.id);
  }

  // Mark all other active bids as expired
  await supabase
    .from('listing_bids')
    .update({ status: 'expired', updated_at: new Date().toISOString() })
    .eq('status', 'active')
    .not('id', 'in', `(${winners.map(w => `'${w.id}'`).join(',')})`);

  // Stop auction
  await stopAuction();

  console.log(`✅ Auction finalized! Winners: ${winners.map(w => w.coinSymbol).join(' vs ')}`);

  return { success: true, winners };
}

/**
 * Get user's bids
 */
export async function getUserBids(walletAddress: string): Promise<ListingBid[]> {
  const supabase = getDb();
  const { data, error } = await supabase
    .from('listing_bids')
    .select('*')
    .eq('wallet_address', walletAddress)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching user bids:', error);
    return [];
  }

  return data.map((row: any) => ({
    id: row.id,
    walletAddress: row.wallet_address,
    chain: row.chain,
    coinContractAddress: row.coin_contract_address,
    coinSymbol: row.coin_symbol,
    coinName: row.coin_name,
    marketCap: parseFloat(row.market_cap),
    bidAmount: parseFloat(row.bid_amount),
    txHash: row.tx_hash,
    status: row.status,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }));
}
