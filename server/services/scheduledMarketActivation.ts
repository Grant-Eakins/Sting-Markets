/**
 * Service to activate scheduled markets when their startTime arrives
 * Runs every minute to check for markets ready to activate
 */

import { MarketStatus } from '../types/market';
import { getAllMarkets } from './marketService';
import { updateMarketStatus } from './database';
import { createOnChainMarket } from './blockchainSync';
import { getTokenByAddress } from './dexScreenerApi';

/**
 * Check for scheduled markets that should activate now and activate them
 */
export async function activateScheduledMarkets(): Promise<number> {
  const now = new Date();
  const markets = getAllMarkets();
  const scheduledMarkets = markets.filter(m => 
    m.status === MarketStatus.SCHEDULED && 
    m.startTime && 
    now >= m.startTime
  );

  if (scheduledMarkets.length === 0) {
    return 0;
  }

  console.log(`🚀 Found ${scheduledMarkets.length} scheduled markets ready to activate`);

  let activated = 0;
  for (const market of scheduledMarkets) {
    try {
      console.log(`⏰ Activating market: ${market.stockSymbol}`);

      // Recalculate lock and settle times at activation (12 hours from now)
      const activationTime = new Date();
      const newLockTime = new Date(activationTime.getTime() + 12 * 60 * 60 * 1000); // 12 hours from now
      const newSettleTime = new Date(activationTime.getTime() + 12 * 60 * 60 * 1000 + 5 * 60 * 1000); // 12 hours + 5 min
      
      market.lockTime = newLockTime;
      market.settleTime = newSettleTime;

      console.log(`   Lock time: ${newLockTime.toLocaleString()}`);
      console.log(`   Settle time: ${newSettleTime.toLocaleString()}`);

      // Fetch current prices for dual-coin markets
      if (market.isDualCoin && market.coinAAddress && market.coinBAddress) {
        const [tokenA, tokenB] = await Promise.all([
          getTokenByAddress(market.coinAAddress),
          getTokenByAddress(market.coinBAddress)
        ]);

        if (tokenA && tokenB) {
          // Update opening prices at activation time
          market.coinAOpeningPrice = tokenA.price < 0.01 
            ? Math.round(tokenA.price * 100_000_000) 
            : Math.round(tokenA.price * 100);
          
          market.coinBOpeningPrice = tokenB.price < 0.01 
            ? Math.round(tokenB.price * 100_000_000) 
            : Math.round(tokenB.price * 100);

          market.openingPrice = market.coinAOpeningPrice; // Use coin A as reference

          console.log(`   ${market.coinASymbol}: $${(market.coinAOpeningPrice / 100).toFixed(2)}`);
          console.log(`   ${market.coinBSymbol}: $${(market.coinBOpeningPrice / 100).toFixed(2)}`);
        }
      }

      // Create market on blockchain
      try {
        const numOutcomes = market.isDualCoin ? 2 : 42; // 2 outcomes for dual-coin battles
        const symbol = market.isDualCoin ? `${market.coinASymbol}vs${market.coinBSymbol}` : market.stockSymbol;
        const blockchainMarketId = await createOnChainMarket(
          symbol,
          market.openingPrice,
          newLockTime,
          newSettleTime,
          false, // isAfterHours
          numOutcomes
        );
        
        if (blockchainMarketId !== null) {
          market.blockchainMarketId = blockchainMarketId;
          console.log(`   ⛓️  Created on-chain market #${blockchainMarketId}`);
        }
      } catch (error: any) {
        console.error(`   ❌ Failed to create on-chain market:`, error.message);
        // Continue with activation even if blockchain creation fails
      }

      // Update status to ACTIVE
      market.status = MarketStatus.ACTIVE;
      market.openTimestamp = now;
      
      // Persist to database
      await updateMarketStatus(market.id, MarketStatus.ACTIVE);

      console.log(`✅ Market activated: ${market.stockSymbol}`);
      activated++;
    } catch (error: any) {
      console.error(`❌ Failed to activate market ${market.id}:`, error.message);
    }
  }

  return activated;
}

/**
 * Get all scheduled markets (for display purposes)
 */
export function getScheduledMarkets() {
  const markets = getAllMarkets();
  return markets.filter(m => m.status === MarketStatus.SCHEDULED)
    .sort((a, b) => {
      if (!a.startTime || !b.startTime) return 0;
      return a.startTime.getTime() - b.startTime.getTime();
    });
}
