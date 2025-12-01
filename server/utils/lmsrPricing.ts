/**
 * LMSR (Logarithmic Market Scoring Rule) pricing utilities
 * Implements cost function, probability calculation, and expected values
 * for 23-outcome prediction markets
 */

import { NUM_OUTCOMES_TRADING, NUM_OUTCOMES_AFTERHOURS, BUCKET_BOUNDARIES_TRADING, BUCKET_BOUNDARIES_AFTERHOURS, SessionType, getNumOutcomes } from '../types/multiOutcome';

/**
 * Calculate LMSR cost function: C(q) = b * ln(sum(exp(qi/b)))
 * @param quantities Array of 23 quantities (shares outstanding for each outcome)
 * @param b Liquidity parameter (market depth)
 * @returns Total cost in ETH
 */
export function calculateLMSRCost(quantities: number[], b: number): number {
  const validLengths = [NUM_OUTCOMES_TRADING, NUM_OUTCOMES_AFTERHOURS];
  if (!validLengths.includes(quantities.length)) {
    throw new Error(`Expected ${NUM_OUTCOMES_TRADING} or ${NUM_OUTCOMES_AFTERHOURS} quantities, got ${quantities.length}`);
  }

  // Use log-sum-exp trick for numerical stability
  // C(q) = b * (max(q) + ln(sum(exp((qi - max(q))/b))))
  
  const maxQ = Math.max(...quantities);
  
  // Calculate sum of exp((qi - maxQ) / b)
  const sumExp = quantities.reduce((sum, qi) => {
    const exponent = (qi - maxQ) / b;
    return sum + Math.exp(exponent);
  }, 0);
  
  // C = b * (maxQ + ln(sumExp))
  const cost = b * (maxQ / b + Math.log(sumExp));
  
  return cost;
}

/**
 * Calculate cost difference for buying shares
 * @param currentQuantities Current quantity vector [q0, q1, ..., q22]
 * @param outcomeIndex Which bucket to buy (0-22)
 * @param sharesToBuy Number of shares to purchase
 * @param b Liquidity parameter
 * @returns Cost in ETH
 */
export function calculateBuyCost(
  currentQuantities: number[],
  outcomeIndex: number,
  sharesToBuy: number,
  b: number
): number {
  if (outcomeIndex < 0 || outcomeIndex >= currentQuantities.length) {
    throw new Error(`Invalid outcome index: ${outcomeIndex}`);
  }
  
  if (sharesToBuy <= 0) {
    throw new Error('Shares to buy must be positive');
  }
  
  const costBefore = calculateLMSRCost(currentQuantities, b);
  
  // Update quantities with new purchase
  const newQuantities = [...currentQuantities];
  newQuantities[outcomeIndex] += sharesToBuy;
  
  const costAfter = calculateLMSRCost(newQuantities, b);
  
  return costAfter - costBefore;
}

/**
 * Calculate payout for selling shares (inverse of buying)
 * When selling, the cost function decreases, so user receives the difference
 * @param currentQuantities Current quantity vector [q0, q1, ..., q22/41]
 * @param outcomeIndex Which bucket to sell (0-22/41)
 * @param sharesToSell Number of shares to sell
 * @param b Liquidity parameter
 * @returns Payout in ETH (positive value = money received)
 */
export function calculateSellPayout(
  currentQuantities: number[],
  outcomeIndex: number,
  sharesToSell: number,
  b: number
): number {
  if (outcomeIndex < 0 || outcomeIndex >= currentQuantities.length) {
    throw new Error(`Invalid outcome index: ${outcomeIndex}`);
  }
  
  if (sharesToSell <= 0) {
    throw new Error('Shares to sell must be positive');
  }
  
  if (sharesToSell > currentQuantities[outcomeIndex]) {
    throw new Error(`Cannot sell ${sharesToSell} shares, only ${currentQuantities[outcomeIndex]} available`);
  }
  
  const costBefore = calculateLMSRCost(currentQuantities, b);
  
  // Update quantities with sale (reduce shares)
  const newQuantities = [...currentQuantities];
  newQuantities[outcomeIndex] -= sharesToSell;
  
  const costAfter = calculateLMSRCost(newQuantities, b);
  
  // When selling, cost decreases, so payout is positive
  return costBefore - costAfter;
}

/**
 * Calculate probability distribution from quantities
 * P(i) = exp(qi/b) / sum(exp(qj/b))
 * @param quantities Current quantity vector
 * @param b Liquidity parameter
 * @returns Array of 23 probabilities (sum = 1.0)
 */
export function calculateProbabilities(quantities: number[], b: number): number[] {
  const validLengths = [NUM_OUTCOMES_TRADING, NUM_OUTCOMES_AFTERHOURS];
  if (!validLengths.includes(quantities.length)) {
    throw new Error(`Expected ${NUM_OUTCOMES_TRADING} or ${NUM_OUTCOMES_AFTERHOURS} quantities, got ${quantities.length}`);
  }
  
  // Use log-sum-exp trick for numerical stability
  const maxQ = Math.max(...quantities);
  
  // Calculate exp((qi - maxQ) / b) for each outcome
  const expValues = quantities.map(qi => {
    const exponent = (qi - maxQ) / b;
    return Math.exp(exponent);
  });
  
  const sumExp = expValues.reduce((sum, val) => sum + val, 0);
  
  // Normalize to get probabilities
  const probabilities = expValues.map(val => val / sumExp);
  
  return probabilities;
}

/**
 * Calculate expected price move (weighted average of bucket midpoints)
 * @param probabilities Probability distribution across 23 buckets
 * @param sessionType INTRADAY or OVERNIGHT to determine bucket boundaries
 * @returns Expected percentage move (e.g., 2.37 for +2.37%)
 */
export function calculateExpectedMove(probabilities: number[], sessionType: SessionType = SessionType.INTRADAY): number {
  const expectedLength = getNumOutcomes(sessionType);
  if (probabilities.length !== expectedLength) {
    throw new Error(`Expected ${expectedLength} probabilities for ${sessionType}, got ${probabilities.length}`);
  }
  
  const boundaries = sessionType === SessionType.INTRADAY 
    ? BUCKET_BOUNDARIES_TRADING 
    : BUCKET_BOUNDARIES_AFTERHOURS;
  
  let expectedMove = 0;
  
  for (let i = 0; i < probabilities.length; i++) {
    const midpoint = boundaries[i].midpoint;
    expectedMove += probabilities[i] * midpoint;
  }
  
  return expectedMove;
}

/**
 * Calculate implied final price from expected move
 * @param referencePrice Starting price in cents
 * @param expectedMovePercent Expected percentage move
 * @returns Implied final price in cents
 */
export function calculateImpliedPrice(
  referencePrice: number,
  expectedMovePercent: number
): number {
  return referencePrice * (1 + expectedMovePercent / 100);
}

/**
 * Determine winning bucket based on final price
 * @param referencePrice Starting price in cents
 * @param finalPrice Ending price in cents
 * @param sessionType INTRADAY (±10%) or OVERNIGHT (±20%)
 * @returns Winning bucket index (0-22)
 */
export function getWinningBucket(referencePrice: number, finalPrice: number, sessionType: SessionType = SessionType.INTRADAY): number {
  const priceChangePercent = ((finalPrice - referencePrice) / referencePrice) * 100;
  
  if (sessionType === SessionType.INTRADAY) {
    // Trading hours: ±10% range
    if (priceChangePercent >= 10) return 0;
    if (priceChangePercent >= 9) return 1;
    if (priceChangePercent >= 8) return 2;
    if (priceChangePercent >= 7) return 3;
    if (priceChangePercent >= 6) return 4;
    if (priceChangePercent >= 5) return 5;
    if (priceChangePercent >= 4) return 6;
    if (priceChangePercent >= 3) return 7;
    if (priceChangePercent >= 2) return 8;
    if (priceChangePercent >= 1) return 9;
    if (priceChangePercent >= 0) return 10;
    if (priceChangePercent >= -1) return 11;
    if (priceChangePercent >= -2) return 12;
    if (priceChangePercent >= -3) return 13;
    if (priceChangePercent >= -4) return 14;
    if (priceChangePercent >= -5) return 15;
    if (priceChangePercent >= -6) return 16;
    if (priceChangePercent >= -7) return 17;
    if (priceChangePercent >= -8) return 18;
    if (priceChangePercent >= -9) return 19;
    if (priceChangePercent >= -10) return 20;
    return 22;
  } else {
    // After-hours: ±10% range with 0.5% increments (42 buckets)
    if (priceChangePercent >= 10) return 0;
    if (priceChangePercent >= 9.5) return 1;
    if (priceChangePercent >= 9) return 2;
    if (priceChangePercent >= 8.5) return 3;
    if (priceChangePercent >= 8) return 4;
    if (priceChangePercent >= 7.5) return 5;
    if (priceChangePercent >= 7) return 6;
    if (priceChangePercent >= 6.5) return 7;
    if (priceChangePercent >= 6) return 8;
    if (priceChangePercent >= 5.5) return 9;
    if (priceChangePercent >= 5) return 10;
    if (priceChangePercent >= 4.5) return 11;
    if (priceChangePercent >= 4) return 12;
    if (priceChangePercent >= 3.5) return 13;
    if (priceChangePercent >= 3) return 14;
    if (priceChangePercent >= 2.5) return 15;
    if (priceChangePercent >= 2) return 16;
    if (priceChangePercent >= 1.5) return 17;
    if (priceChangePercent >= 1) return 18;
    if (priceChangePercent >= 0.5) return 19;
    if (priceChangePercent >= 0) return 20;
    if (priceChangePercent >= -0.5) return 21;
    if (priceChangePercent >= -1) return 22;
    if (priceChangePercent >= -1.5) return 23;
    if (priceChangePercent >= -2) return 24;
    if (priceChangePercent >= -2.5) return 25;
    if (priceChangePercent >= -3) return 26;
    if (priceChangePercent >= -3.5) return 27;
    if (priceChangePercent >= -4) return 28;
    if (priceChangePercent >= -4.5) return 29;
    if (priceChangePercent >= -5) return 30;
    if (priceChangePercent >= -5.5) return 31;
    if (priceChangePercent >= -6) return 32;
    if (priceChangePercent >= -6.5) return 33;
    if (priceChangePercent >= -7) return 34;
    if (priceChangePercent >= -7.5) return 35;
    if (priceChangePercent >= -8) return 36;
    if (priceChangePercent >= -8.5) return 37;
    if (priceChangePercent >= -9) return 38;
    if (priceChangePercent >= -9.5) return 39;
    if (priceChangePercent >= -10) return 40;
    return 41;  // -10% or worse
  }
}

/**
 * Calculate variance and standard deviation of probability distribution
 * @param probabilities Probability distribution
 * @param expectedMove Expected value (mean)
 * @param sessionType INTRADAY or OVERNIGHT
 * @returns Object with variance and standard deviation
 */
export function calculateDistributionStats(
  probabilities: number[],
  expectedMove: number,
  sessionType: SessionType = SessionType.INTRADAY
): { variance: number; stdDev: number } {
  const boundaries = sessionType === SessionType.INTRADAY 
    ? BUCKET_BOUNDARIES_TRADING 
    : BUCKET_BOUNDARIES_AFTERHOURS;
  
  let variance = 0;
  
  for (let i = 0; i < probabilities.length; i++) {
    const midpoint = boundaries[i].midpoint;
    const deviation = midpoint - expectedMove;
    variance += probabilities[i] * deviation * deviation;
  }
  
  const stdDev = Math.sqrt(variance);
  
  return { variance, stdDev };
}

/**
 * Calculate 68% confidence interval (±1 standard deviation)
 * @param expectedMove Expected value (mean)
 * @param stdDev Standard deviation
 * @returns Lower and upper bounds
 */
export function calculateConfidenceInterval(
  expectedMove: number,
  stdDev: number
): { lower: number; upper: number } {
  return {
    lower: expectedMove - stdDev,
    upper: expectedMove + stdDev
  };
}

/**
 * Initialize quantities for a new market (all zeros)
 * @param sessionType INTRADAY (23 buckets) or OVERNIGHT (42 buckets)
 * @returns Array of zeros
 */
export function initializeQuantities(sessionType: SessionType = SessionType.INTRADAY): number[] {
  const numOutcomes = getNumOutcomes(sessionType);
  return new Array(numOutcomes).fill(0);
}

/**
 * Calculate instantaneous price for buying next share
 * dC/dqi = (1/b) * exp(qi/b) / sum(exp(qj/b)) = P(i)
 * @param probabilities Current probability distribution
 * @returns Price per share for each outcome (equals probability)
 */
export function calculateInstantaneousPrices(probabilities: number[]): number[] {
  // In LMSR, instantaneous price = probability
  return [...probabilities];
}

/**
 * Estimate number of shares you can buy for a given budget
 * Uses binary search to find the right quantity
 * @param currentQuantities Current market state
 * @param outcomeIndex Which bucket
 * @param budget Maximum ETH to spend
 * @param b Liquidity parameter
 * @returns Estimated shares you can buy
 */
export function estimateSharesForBudget(
  currentQuantities: number[],
  outcomeIndex: number,
  budget: number,
  b: number
): number {
  if (budget <= 0) return 0;
  
  // Binary search for the right quantity
  let low = 0;
  let high = budget * 100; // Rough upper bound
  let bestShares = 0;
  
  const iterations = 20; // Binary search iterations
  
  for (let i = 0; i < iterations; i++) {
    const mid = (low + high) / 2;
    const cost = calculateBuyCost(currentQuantities, outcomeIndex, mid, b);
    
    if (cost <= budget) {
      bestShares = mid;
      low = mid;
    } else {
      high = mid;
    }
  }
  
  return Math.floor(bestShares);
}

/**
 * Calculate payout for a winning position
 * In LMSR, winning shares pay $1 each
 * @param winningShares Number of shares in winning bucket
 * @returns Payout in ETH
 */
export function calculatePayout(winningShares: number): number {
  return winningShares; // $1 per share
}

/**
 * Calculate potential profit/loss for a position
 * @param quantities User's quantity vector
 * @param probabilities Current probabilities
 * @param costBasis Total spent
 * @returns Object with current value and PnL
 */
export function calculatePositionValue(
  quantities: number[],
  probabilities: number[],
  costBasis: number
): { currentValue: number; pnl: number; pnlPercent: number } {
  // Current value = sum of (quantity * probability) for each outcome
  let currentValue = 0;
  for (let i = 0; i < quantities.length; i++) {
    currentValue += quantities[i] * probabilities[i];
  }
  
  const pnl = currentValue - costBasis;
  const pnlPercent = costBasis > 0 ? (pnl / costBasis) * 100 : 0;
  
  return { currentValue, pnl, pnlPercent };
}
