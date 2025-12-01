/**
 * Multi-outcome prediction market types
 * Supports 23-bucket (trading) or 42-bucket (after-hours) price change predictions with LMSR pricing
 * 
 * WINNING LOGIC:
 * The winning bucket is determined by which bucket's range contains the actual price change.
 * For example, if a stock opens at $100 and closes at $102.50, that's a +2.5% change.
 * - Trading hours (1% buckets): This would fall in the "+2% to +3%" bucket
 * - After-hours (0.5% buckets): This would fall in the "+2.5% to +3%" bucket
 * 
 * All shares in the winning bucket split the total pool proportionally.
 * 
 * SELLING BEFORE SETTLEMENT:
 * Users can sell their shares at any time before the market locks using the LMSR pricing.
 * The sell price depends on the current probability distribution:
 * - If probability of your bucket increases → you can sell for profit
 * - If probability decreases → you would sell at a loss
 * - Sell payout = C(q_before) - C(q_after), where q_after has fewer shares in your bucket
 * 
 * Example: You bought 10 shares in "+3% to +4%" bucket for 0.5 ETH when probability was 4%.
 * Later, more people bet on that bucket and probability rises to 8%. You can now sell those
 * 10 shares for ~0.7 ETH, locking in a 0.2 ETH profit before the market even settles.
 */

export enum SessionType {
  INTRADAY = 'INTRADAY',     // Previous close → Today's 4pm close
  OVERNIGHT = 'OVERNIGHT'     // Today's 4pm close → Tomorrow's 9:30am open
}

export enum MarketStatus {
  ACTIVE = 'ACTIVE',
  LOCKED = 'LOCKED',
  SETTLED = 'SETTLED'
}

/**
 * One of 23 mutually exclusive price change buckets
 */
export interface OutcomeBucket {
  index: number;              // 0-22
  label: string;              // e.g., "+2% to +3%"
  minPercent: number;         // -10, -9, -8, ..., +9, +10 (percentage)
  maxPercent: number | null;  // null for "+10% or more" and "-10% or worse"
  midpointPercent: number;    // Midpoint for expected value calculation
  
  // LMSR state
  quantity: number;           // qi in LMSR formula
  probability: number;        // Current probability (0-1)
  shares: number;             // Total shares held across all users
}

/**
 * Multi-outcome prediction market
 */
export interface MultiOutcomeMarket {
  id: string;
  marketId: number;           // On-chain market ID
  
  // Stock info
  stockSymbol: string;
  stockName?: string;
  
  // Session info
  sessionType: SessionType;
  sessionDate: string;        // YYYY-MM-DD
  
  // Status
  status: MarketStatus;
  
  // Reference prices (in cents)
  referencePrice: number;     // Starting price (previous close or today's close)
  currentPrice?: number;      // Real-time price during active session
  finalPrice?: number;        // Settlement price
  
  // Timing
  createdAt: Date;
  lockTime: Date;
  settleTime: Date;
  
  // 23 outcome buckets
  outcomes: OutcomeBucket[];
  
  // LMSR parameters
  liquidityParam: number;     // b parameter (controls market depth)
  
  // Settlement
  settled: boolean;
  winningOutcome?: number;    // Index of winning bucket (0-22)
  
  // Statistics
  totalVolume: number;        // Total ETH bet
  totalBets: number;          // Number of bets placed
  uniqueBettors: number;      // Number of unique addresses
  
  // Expected move (weighted average of probabilities)
  expectedMovePercent: number; // e.g., +2.37%
  impliedFinalPrice: number;   // referencePrice * (1 + expectedMove)
  
  // Blockchain
  blockchainMarketId?: number;
  transactionHash?: string;
}

/**
 * User's position in a multi-outcome market
 */
export interface UserPosition {
  marketId: string;
  userAddress: string;
  
  // Quantities held in each bucket
  quantities: number[];       // Array of 23 values (qi for each outcome)
  
  // Total invested
  costBasis: number;          // Total ETH spent
  
  // Current value
  currentValue: number;       // Based on current probabilities
  
  // Timestamps
  firstBetAt: Date;
  lastBetAt: Date;
}

/**
 * Individual bet/trade on a specific outcome
 */
export interface OutcomeBet {
  id: string;
  marketId: string;
  userAddress: string;
  
  // Which bucket
  outcomeIndex: number;       // 0-22
  
  // Trade details
  quantity: number;           // Number of shares bought (negative = sold)
  costPaid: number;           // ETH paid for this trade
  
  // LMSR state at time of bet
  probabilityBefore: number;
  probabilityAfter: number;
  
  // Blockchain
  transactionHash?: string;
  blockNumber?: number;
  
  // Timestamp
  timestamp: Date;
}

/**
 * Request to create a new multi-outcome market
 */
export interface CreateMultiOutcomeMarketRequest {
  stockSymbol: string;
  stockName?: string;
  sessionType: SessionType;
  sessionDate: string;
  referencePrice: number;     // In cents
  lockTime: Date;
  settleTime: Date;
  liquidityParam?: number;    // Optional, defaults to 1000 ETH
}

/**
 * Request to place a bet on a specific outcome
 */
export interface PlaceOutcomeBetRequest {
  marketId: string;
  userAddress: string;
  outcomeIndex: number;       // 0-22
  quantity: number;           // Number of shares to buy
  maxCost?: number;           // Maximum willing to pay (slippage protection)
}

/**
 * Request to settle a multi-outcome market
 */
export interface SettleMultiOutcomeMarketRequest {
  marketId: string;
  finalPrice: number;         // In cents
}

/**
 * Response with probability distribution
 */
export interface ProbabilityDistribution {
  marketId: string;
  probabilities: number[];    // Array of 23 probabilities (sum = 1.0)
  expectedMovePercent: number;
  impliedFinalPrice: number;
  mostLikelyOutcome: number;  // Index with highest probability
  confidenceInterval?: {      // 68% confidence interval (1 std dev)
    lower: number;
    upper: number;
  };
}

/**
 * Market summary for display
 */
export interface MarketSummary {
  id: string;
  stockSymbol: string;
  stockName?: string;
  sessionType: SessionType;
  status: MarketStatus;
  referencePrice: number;
  currentPrice?: number;
  expectedMovePercent: number;
  impliedFinalPrice: number;
  totalVolume: number;
  totalBets: number;
  lockTime: Date;
  settleTime: Date;
  timeUntilLock?: number;     // Milliseconds
}

/**
 * Bucket boundaries for determining winning outcome
 * Trading hours: ±10% range
 * After-hours: ±20% range (2x wider)
 */
export const BUCKET_BOUNDARIES_TRADING = [
  { index: 0, min: 10, max: null, label: '+10% or more', midpoint: 10.5 },
  { index: 1, min: 9, max: 10, label: '+9% to +10%', midpoint: 9.5 },
  { index: 2, min: 8, max: 9, label: '+8% to +9%', midpoint: 8.5 },
  { index: 3, min: 7, max: 8, label: '+7% to +8%', midpoint: 7.5 },
  { index: 4, min: 6, max: 7, label: '+6% to +7%', midpoint: 6.5 },
  { index: 5, min: 5, max: 6, label: '+5% to +6%', midpoint: 5.5 },
  { index: 6, min: 4, max: 5, label: '+4% to +5%', midpoint: 4.5 },
  { index: 7, min: 3, max: 4, label: '+3% to +4%', midpoint: 3.5 },
  { index: 8, min: 2, max: 3, label: '+2% to +3%', midpoint: 2.5 },
  { index: 9, min: 1, max: 2, label: '+1% to +2%', midpoint: 1.5 },
  { index: 10, min: 0, max: 1, label: '0% to +1%', midpoint: 0.5 },
  { index: 11, min: -1, max: 0, label: '-1% to 0%', midpoint: -0.5 },
  { index: 12, min: -2, max: -1, label: '-2% to -1%', midpoint: -1.5 },
  { index: 13, min: -3, max: -2, label: '-3% to -2%', midpoint: -2.5 },
  { index: 14, min: -4, max: -3, label: '-4% to -3%', midpoint: -3.5 },
  { index: 15, min: -5, max: -4, label: '-5% to -4%', midpoint: -4.5 },
  { index: 16, min: -6, max: -5, label: '-6% to -5%', midpoint: -5.5 },
  { index: 17, min: -7, max: -6, label: '-7% to -6%', midpoint: -6.5 },
  { index: 18, min: -8, max: -7, label: '-8% to -7%', midpoint: -7.5 },
  { index: 19, min: -9, max: -8, label: '-9% to -8%', midpoint: -8.5 },
  { index: 20, min: -10, max: -9, label: '-10% to -9%', midpoint: -9.5 },
  { index: 21, min: null, max: -10, label: '-10% or worse', midpoint: -10.5 },
] as const;

export const BUCKET_BOUNDARIES_AFTERHOURS = [
  { index: 0, min: 10, max: null, label: '+10% or more', midpoint: 10.25 },
  { index: 1, min: 9.5, max: 10, label: '+9.5% to +10%', midpoint: 9.75 },
  { index: 2, min: 9, max: 9.5, label: '+9% to +9.5%', midpoint: 9.25 },
  { index: 3, min: 8.5, max: 9, label: '+8.5% to +9%', midpoint: 8.75 },
  { index: 4, min: 8, max: 8.5, label: '+8% to +8.5%', midpoint: 8.25 },
  { index: 5, min: 7.5, max: 8, label: '+7.5% to +8%', midpoint: 7.75 },
  { index: 6, min: 7, max: 7.5, label: '+7% to +7.5%', midpoint: 7.25 },
  { index: 7, min: 6.5, max: 7, label: '+6.5% to +7%', midpoint: 6.75 },
  { index: 8, min: 6, max: 6.5, label: '+6% to +6.5%', midpoint: 6.25 },
  { index: 9, min: 5.5, max: 6, label: '+5.5% to +6%', midpoint: 5.75 },
  { index: 10, min: 5, max: 5.5, label: '+5% to +5.5%', midpoint: 5.25 },
  { index: 11, min: 4.5, max: 5, label: '+4.5% to +5%', midpoint: 4.75 },
  { index: 12, min: 4, max: 4.5, label: '+4% to +4.5%', midpoint: 4.25 },
  { index: 13, min: 3.5, max: 4, label: '+3.5% to +4%', midpoint: 3.75 },
  { index: 14, min: 3, max: 3.5, label: '+3% to +3.5%', midpoint: 3.25 },
  { index: 15, min: 2.5, max: 3, label: '+2.5% to +3%', midpoint: 2.75 },
  { index: 16, min: 2, max: 2.5, label: '+2% to +2.5%', midpoint: 2.25 },
  { index: 17, min: 1.5, max: 2, label: '+1.5% to +2%', midpoint: 1.75 },
  { index: 18, min: 1, max: 1.5, label: '+1% to +1.5%', midpoint: 1.25 },
  { index: 19, min: 0.5, max: 1, label: '+0.5% to +1%', midpoint: 0.75 },
  { index: 20, min: 0, max: 0.5, label: '0% to +0.5%', midpoint: 0.25 },
  { index: 21, min: -0.5, max: 0, label: '-0.5% to 0%', midpoint: -0.25 },
  { index: 22, min: -1, max: -0.5, label: '-1% to -0.5%', midpoint: -0.75 },
  { index: 23, min: -1.5, max: -1, label: '-1.5% to -1%', midpoint: -1.25 },
  { index: 24, min: -2, max: -1.5, label: '-2% to -1.5%', midpoint: -1.75 },
  { index: 25, min: -2.5, max: -2, label: '-2.5% to -2%', midpoint: -2.25 },
  { index: 26, min: -3, max: -2.5, label: '-3% to -2.5%', midpoint: -2.75 },
  { index: 27, min: -3.5, max: -3, label: '-3.5% to -3%', midpoint: -3.25 },
  { index: 28, min: -4, max: -3.5, label: '-4% to -3.5%', midpoint: -3.75 },
  { index: 29, min: -4.5, max: -4, label: '-4.5% to -4%', midpoint: -4.25 },
  { index: 30, min: -5, max: -4.5, label: '-5% to -4.5%', midpoint: -4.75 },
  { index: 31, min: -5.5, max: -5, label: '-5.5% to -5%', midpoint: -5.25 },
  { index: 32, min: -6, max: -5.5, label: '-6% to -5.5%', midpoint: -5.75 },
  { index: 33, min: -6.5, max: -6, label: '-6.5% to -6%', midpoint: -6.25 },
  { index: 34, min: -7, max: -6.5, label: '-7% to -6.5%', midpoint: -6.75 },
  { index: 35, min: -7.5, max: -7, label: '-7.5% to -7%', midpoint: -7.25 },
  { index: 36, min: -8, max: -7.5, label: '-8% to -7.5%', midpoint: -7.75 },
  { index: 37, min: -8.5, max: -8, label: '-8.5% to -8%', midpoint: -8.25 },
  { index: 38, min: -9, max: -8.5, label: '-9% to -8.5%', midpoint: -8.75 },
  { index: 39, min: -9.5, max: -9, label: '-9.5% to -9%', midpoint: -9.25 },
  { index: 40, min: -10, max: -9.5, label: '-10% to -9.5%', midpoint: -9.75 },
  { index: 41, min: null, max: -10, label: '-10% or worse', midpoint: -10.25 },
] as const;

// Helper function to get appropriate boundaries
export function getBucketBoundaries(sessionType: SessionType) {
  return sessionType === SessionType.INTRADAY 
    ? BUCKET_BOUNDARIES_TRADING 
    : BUCKET_BOUNDARIES_AFTERHOURS;
}

export const NUM_OUTCOMES_TRADING = 23;  // Trading hours: 1% increments
export const NUM_OUTCOMES_AFTERHOURS = 42;  // After-hours: 0.5% increments
export const DEFAULT_LIQUIDITY_PARAM = 1000; // 1000 ETH equivalent

// Helper to get number of outcomes for a session
export function getNumOutcomes(sessionType: SessionType): number {
  return sessionType === SessionType.INTRADAY ? NUM_OUTCOMES_TRADING : NUM_OUTCOMES_AFTERHOURS;
}
