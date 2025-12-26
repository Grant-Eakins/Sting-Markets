import { Market, Bet, MarketStatus, Position, MarketOdds, CreateMarketRequest, PlaceBetRequest, SettlementResult } from '../types/market';
import { saveMarket, saveBet, loadAllMarkets, settleMarketInDb, updateMarketPriceInDb, updateMarketStatus, isDatabaseConnected, deleteAllMarketsFromDb } from './database';

// In-memory storage (synced with database for persistence)
const markets = new Map<string, Market>();
const bets = new Map<string, Bet>();
const userBetsByMarket = new Map<string, Map<string, Bet[]>>(); // marketId -> userAddress -> Bet[]

/**
 * Initialize markets from database on startup
 */
export async function initializeMarketsFromDb(): Promise<void> {
  if (!isDatabaseConnected()) {
    console.log('⚠️  Database not connected - using in-memory storage only');
    return;
  }

  try {
    const dbMarkets = await loadAllMarkets();
    const now = new Date();
    
    for (const market of dbMarkets) {
      // Fix stale market statuses on startup
      // If lock time passed but still ACTIVE, mark as LOCKED
      if (market.status === MarketStatus.ACTIVE && now >= new Date(market.lockTime)) {
        market.status = MarketStatus.LOCKED;
        console.log(`🔒 Auto-locked stale market: ${market.stockSymbol}`);
        updateMarketStatus(market.id, MarketStatus.LOCKED).catch(() => {});
      }
      
      // If settle time passed but still LOCKED (or ACTIVE), mark as SETTLED
      // This allows new markets to be created for the same symbol
      if ((market.status === MarketStatus.ACTIVE || market.status === MarketStatus.LOCKED) 
          && now >= new Date(market.settleTime)) {
        market.status = MarketStatus.SETTLED;
        console.log(`🏁 Auto-settled stale market: ${market.stockSymbol}`);
        updateMarketStatus(market.id, MarketStatus.SETTLED).catch(() => {});
      }
      
      markets.set(market.id, market);
    }
    
    const activeCount = dbMarkets.filter(m => m.status === MarketStatus.ACTIVE).length;
    const lockedCount = dbMarkets.filter(m => m.status === MarketStatus.LOCKED).length;
    const settledCount = dbMarkets.filter(m => m.status === MarketStatus.SETTLED).length;
    
    console.log(`✅ Loaded ${dbMarkets.length} markets from database`);
    console.log(`   Active: ${activeCount}, Locked: ${lockedCount}, Settled: ${settledCount}`);
  } catch (error: any) {
    console.error('❌ Failed to load markets from database:', error.message);
  }
}

/**
 * Creates a new prediction market for a stock
 */
export function createMarket(request: CreateMarketRequest): Market {
  const id = `market-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const now = new Date();
  
  // Use passed lockTime/settleTime if provided, otherwise calculate from hours
  let lockTime: Date;
  let settleTime: Date;
  
  if (request.lockTime && request.settleTime) {
    // Direct timestamps provided - use them
    lockTime = request.lockTime;
    settleTime = request.settleTime;
  } else {
    // Calculate from hours (default behavior)
    const lockHours = request.lockHours || (request.isAfterHours ? 8 : 2);
    const settleHours = request.settleHours || (request.isAfterHours ? 16 : 3);
    lockTime = new Date(now.getTime() + lockHours * 60 * 60 * 1000);
    settleTime = new Date(now.getTime() + settleHours * 60 * 60 * 1000);
  }

  const market: Market = {
    id,
    stockSymbol: request.stockSymbol,
    stockName: request.stockName,
    description: request.description,
    status: MarketStatus.ACTIVE,
    createdAt: now,
    lockTime,
    settleTime,
    openingPrice: request.openingPrice,
    currentPrice: request.openingPrice,
    openTimestamp: now,
    isAfterHours: request.isAfterHours,
    upPool: 0,
    downPool: 0,
    totalPool: 0,
    upBettors: 0,
    downBettors: 0,
    totalBets: 0,
    imageUrl: request.imageUrl,
    category: request.category,
    contractAddress: request.contractAddress,
    isDualCoin: request.isDualCoin,
    coinASymbol: request.coinASymbol,
    coinAName: request.coinAName,
    coinAAddress: request.coinAAddress,
    coinAImageUrl: request.coinAImageUrl,
    coinAOpeningPrice: request.coinAOpeningPrice,
    coinBSymbol: request.coinBSymbol,
    coinBName: request.coinBName,
    coinBAddress: request.coinBAddress,
    coinBImageUrl: request.coinBImageUrl,
    coinBOpeningPrice: request.coinBOpeningPrice,
    autoRecreate: request.autoRecreate ?? true, // Default to true if not specified
  };

  markets.set(id, market);
  
  // Save to database asynchronously
  saveMarket(market).catch(err => console.error('Failed to save market to DB:', err));
  
  console.log(`✅ Market created: ${market.stockSymbol} @ $${(request.openingPrice / 100).toFixed(2)} (${request.isAfterHours ? 'After-Hours' : 'Trading Hours'})`);
  
  return market;
}

/**
 * Places a bet on a market
 */
export function placeBet(request: PlaceBetRequest): Bet {
  const market = markets.get(request.marketId);
  
  if (!market) {
    throw new Error('Market not found');
  }
  
  if (market.status !== MarketStatus.ACTIVE) {
    throw new Error('Market is not active');
  }
  
  if (new Date() >= market.lockTime) {
    throw new Error('Betting is locked for this market');
  }
  
  const betId = `bet-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const odds = calculateOdds(market);
  
  const bet: Bet = {
    id: betId,
    marketId: request.marketId,
    userAddress: request.userAddress,
    position: request.position,
    amount: request.amount,
    odds: request.position === Position.UP ? odds.upOdds : odds.downOdds,
    timestamp: new Date(),
    settled: false,
    claimed: false,
  };
  
  // Update market pools
  if (request.position === Position.UP) {
    market.upPool += request.amount;
    market.upBettors++;
  } else {
    market.downPool += request.amount;
    market.downBettors++;
  }
  market.totalPool += request.amount;
  market.totalBets++;
  
  // Store bet
  bets.set(betId, bet);
  
  // Track user bets by market
  if (!userBetsByMarket.has(request.marketId)) {
    userBetsByMarket.set(request.marketId, new Map());
  }
  const marketUserBets = userBetsByMarket.get(request.marketId)!;
  if (!marketUserBets.has(request.userAddress)) {
    marketUserBets.set(request.userAddress, []);
  }
  marketUserBets.get(request.userAddress)!.push(bet);
  
  markets.set(request.marketId, market);
  
  console.log(`💰 Bet placed: ${request.userAddress.slice(0, 6)}... bet ${request.amount} ETH on ${request.position}`);
  
  return bet;
}

/**
 * Calculates current odds for a market
 */
export function calculateOdds(market: Market): MarketOdds {
  const total = market.totalPool;
  
  if (total === 0) {
    return {
      upOdds: 2.0,
      downOdds: 2.0,
      upPercentage: 50,
      downPercentage: 50,
    };
  }
  
  const upPercentage = (market.upPool / total) * 100;
  const downPercentage = (market.downPool / total) * 100;
  
  // Calculate odds (simplified - real platforms use more complex formulas)
  const upOdds = market.upPool > 0 ? total / market.upPool : 2.0;
  const downOdds = market.downPool > 0 ? total / market.downPool : 2.0;
  
  return {
    upOdds: Math.max(1.01, Math.min(upOdds, 10)), // Cap between 1.01x and 10x
    downOdds: Math.max(1.01, Math.min(downOdds, 10)),
    upPercentage,
    downPercentage,
  };
}

/**
 * Settles a market based on closing stock price
 */
export async function settleMarket(marketId: string, closingPrice: number): Promise<SettlementResult> {
  const market = markets.get(marketId);
  
  if (!market) {
    throw new Error('Market not found');
  }
  
  if (market.status === MarketStatus.SETTLED) {
    throw new Error('Market already settled');
  }

  // Settle on blockchain if market has blockchain ID
  if (market.blockchainMarketId !== undefined) {
    const { settleOnChainMarket } = await import('./blockchainSync');
    try {
      await settleOnChainMarket(market.blockchainMarketId, closingPrice);
    } catch (error) {
      console.error('Failed to settle market on-chain:', error);
      // Continue with backend settlement even if blockchain fails
    }
  }
  
  const priceChange = closingPrice - market.openingPrice;
  const priceChangePercent = (priceChange / market.openingPrice) * 100;
  const winningPosition = priceChange >= 0 ? Position.UP : Position.DOWN;
  
  market.closingPrice = closingPrice;
  market.closeTimestamp = new Date();
  market.priceChange = priceChange;
  market.priceChangePercent = priceChangePercent;
  market.winningPosition = winningPosition;
  market.status = MarketStatus.SETTLED;
  
  // Settle all bets
  const marketBets = Array.from(bets.values()).filter(b => b.marketId === marketId);
  let winnersCount = 0;
  let totalPayout = 0;
  
  for (const bet of marketBets) {
    bet.settled = true;
    bet.won = bet.position === winningPosition;
    
    if (bet.won) {
      bet.payout = bet.amount * bet.odds;
      totalPayout += bet.payout;
      winnersCount++;
    } else {
      bet.payout = 0;
    }
    
    bets.set(bet.id, bet);
  }
  
  markets.set(marketId, market);
  
  // Save settlement to database
  settleMarketInDb(marketId, closingPrice, winningPosition, priceChange, priceChangePercent)
    .catch(err => console.error('Failed to save settlement to DB:', err));
  
  console.log(`🏁 Market settled: ${market.stockSymbol}`);
  console.log(`   Opening Price: $${(market.openingPrice / 100).toFixed(2)}`);
  console.log(`   Closing Price: $${(closingPrice / 100).toFixed(2)}`);
  console.log(`   Change: ${priceChange >= 0 ? '+' : ''}$${(priceChange / 100).toFixed(2)} (${priceChangePercent.toFixed(2)}%)`);
  console.log(`   Winner: ${winningPosition}`);
  console.log(`   Winners: ${winnersCount} bettors`);
  console.log(`   Total payout: ${totalPayout.toFixed(4)} ETH`);
  
  return {
    marketId,
    closingPrice,
    priceChange,
    priceChangePercent,
    winningPosition,
    winnersCount,
    totalPayout,
  };
}

/**
 * Gets all active markets
 */
export function getActiveMarkets(): Market[] {
  return Array.from(markets.values())
    .filter(m => m.status === MarketStatus.ACTIVE)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/**
 * Gets all markets
 */
export function getAllMarkets(): Market[] {
  return Array.from(markets.values())
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/**
 * Gets a specific market
 */
export function getMarket(marketId: string): Market | undefined {
  return markets.get(marketId);
}

/**
 * Gets user's bets for a market
 */
export function getUserBetsForMarket(marketId: string, userAddress: string): Bet[] {
  const marketUserBets = userBetsByMarket.get(marketId);
  if (!marketUserBets) return [];
  return marketUserBets.get(userAddress) || [];
}

/**
 * Gets all user's bets across all markets
 */
export function getAllUserBets(userAddress: string): Bet[] {
  const userBets: Bet[] = [];
  for (const [_, marketBets] of userBetsByMarket) {
    const bets = marketBets.get(userAddress);
    if (bets) {
      userBets.push(...bets);
    }
  }
  return userBets.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
}

/**
 * Claims winnings for a bet
 */
export function claimWinnings(betId: string, userAddress: string): number {
  const bet = bets.get(betId);
  
  if (!bet) {
    throw new Error('Bet not found');
  }
  
  if (bet.userAddress !== userAddress) {
    throw new Error('Not your bet');
  }
  
  if (!bet.settled) {
    throw new Error('Bet not settled yet');
  }
  
  if (!bet.won) {
    throw new Error('Bet did not win');
  }
  
  if (bet.claimed) {
    throw new Error('Winnings already claimed');
  }
  
  bet.claimed = true;
  bets.set(betId, bet);
  
  console.log(`💸 Claimed: ${bet.payout} ETH for bet ${betId}`);
  
  return bet.payout!;
}

/**
 * Locks markets that have passed their lock time
 */
export function lockExpiredMarkets(): number {
  const now = new Date();
  let locked = 0;
  
  for (const [id, market] of markets) {
    if (market.status === MarketStatus.ACTIVE && now >= market.lockTime) {
      market.status = MarketStatus.LOCKED;
      markets.set(id, market);
      locked++;
      // Update status in database
      updateMarketStatus(id, MarketStatus.LOCKED).catch(err => 
        console.error('Failed to update market status in DB:', err)
      );
      console.log(`🔒 Market locked: ${market.stockSymbol}`);
    }
  }
  
  return locked;
}

/**
 * Gets markets ready for settlement
 */
export function getMarketsReadyToSettle(): Market[] {
  const now = new Date();
  return Array.from(markets.values())
    .filter(m => m.status === MarketStatus.LOCKED && now >= m.settleTime);
}

/**
 * Updates current stock price for a market
 */
export function updateMarketPrice(marketId: string, currentPrice: number): void {
  const market = markets.get(marketId);
  if (market && market.status !== MarketStatus.SETTLED) {
    market.currentPrice = currentPrice;
    markets.set(marketId, market);
    // Update price in database (don't await, fire and forget)
    updateMarketPriceInDb(marketId, currentPrice).catch(() => {});
  }
}

/**
 * Updates pool balances from blockchain data
 */
export function updateMarketPools(marketId: string, pools: { upPool: number; downPool: number; totalPool: number }): void {
  const market = markets.get(marketId);
  if (market) {
    market.upPool = pools.upPool;
    market.downPool = pools.downPool;
    market.totalPool = pools.totalPool;
    markets.set(marketId, market);
  }
}

/**
 * Clears all markets from memory AND database - useful for resetting state
 */
export async function clearAllMarkets(): Promise<number> {
  const count = markets.size;
  markets.clear();
  bets.clear();
  userBetsByMarket.clear();
  console.log(`🗑️ Cleared ${count} markets from memory`);
  
  // Also clear from database
  const dbCount = await deleteAllMarketsFromDb();
  console.log(`🗑️ Cleared ${dbCount} markets from database`);
  
  return count;
}

/**
 * Deletes a market by stock symbol
 */
export function deleteMarketBySymbol(symbol: string): boolean {
  for (const [id, market] of markets) {
    if (market.stockSymbol === symbol && market.status === MarketStatus.ACTIVE) {
      markets.delete(id);
      console.log(`🗑️ Deleted market for ${symbol}`);
      return true;
    }
  }
  return false;
}

/**
 * Deletes a market by ID
 */
export function deleteMarketById(marketId: string): boolean {
  const market = markets.get(marketId);
  if (market) {
    markets.delete(marketId);
    // Also clean up associated bets
    const marketUserBets = userBetsByMarket.get(marketId);
    if (marketUserBets) {
      userBetsByMarket.delete(marketId);
    }
    console.log(`🗑️ Deleted market: ${market.stockSymbol} (${marketId})`);
    return true;
  }
  return false;
}
