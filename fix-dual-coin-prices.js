/**
 * Fix dual-coin market opening prices by fetching current prices from DexScreener
 * Run this to update existing markets that have placeholder prices like $1, $3
 */

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Fetch token data from DexScreener
async function getTokenByAddress(address) {
  try {
    const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${address}`);
    if (!response.ok) {
      console.error(`❌ DexScreener API error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    if (!data.pairs || data.pairs.length === 0) {
      console.error(`❌ No pairs found for token ${address}`);
      return null;
    }

    // Try Base chain first, fall back to Solana or any chain
    let pair = data.pairs.find(p => p.chainId === 'base');
    
    // If not on Base, try Solana
    if (!pair) {
      pair = data.pairs.find(p => p.chainId === 'solana');
    }
    
    // If still not found, use the first pair with best liquidity
    if (!pair) {
      pair = data.pairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
    }
    
    if (!pair) {
      console.error(`❌ No trading pair found for ${address}`);
      return null;
    }

    console.log(`   Found on ${pair.chainId} chain`);
    
    return {
      address: pair.baseToken.address,
      name: pair.baseToken.name,
      symbol: pair.baseToken.symbol,
      price: parseFloat(pair.priceUsd),
      imageUrl: pair.info?.imageUrl,
      chainId: pair.chainId,
    };
  } catch (error) {
    console.error(`❌ Error fetching token ${address}:`, error.message);
    return null;
  }
}

async function fixDualCoinPrices() {
  console.log('🔧 Fixing dual-coin market opening prices...\n');

  // Fetch all active dual-coin markets
  const { data: markets, error } = await supabase
    .from('markets')
    .select('*')
    .eq('is_dual_coin', true)
    .in('status', ['ACTIVE', 'SCHEDULED']);

  if (error) {
    console.error('❌ Error fetching markets:', error.message);
    return;
  }

  if (!markets || markets.length === 0) {
    console.log('ℹ️  No dual-coin markets found');
    return;
  }

  console.log(`📊 Found ${markets.length} dual-coin markets\n`);

  for (const market of markets) {
    console.log(`\n🎯 Processing: ${market.stock_symbol}`);
    console.log(`   Status: ${market.status}`);
    console.log(`   Current Coin A opening price: $${market.coin_a_opening_price}`);
    console.log(`   Current Coin B opening price: $${market.coin_b_opening_price}`);

    if (!market.coin_a_address || !market.coin_b_address) {
      console.log('   ⚠️  Missing token addresses, skipping');
      continue;
    }

    // Fetch current prices
    console.log(`   Fetching ${market.coin_a_symbol} price...`);
    const tokenA = await getTokenByAddress(market.coin_a_address);
    
    // Wait 500ms to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
    
    console.log(`   Fetching ${market.coin_b_symbol} price...`);
    const tokenB = await getTokenByAddress(market.coin_b_address);

    if (!tokenA || !tokenB) {
      console.log('   ❌ Failed to fetch token prices, skipping');
      continue;
    }

    console.log(`   ✅ ${market.coin_a_symbol}: $${tokenA.price < 0.01 ? tokenA.price.toFixed(8) : tokenA.price.toFixed(4)}`);
    console.log(`   ✅ ${market.coin_b_symbol}: $${tokenB.price < 0.01 ? tokenB.price.toFixed(8) : tokenB.price.toFixed(4)}`);

    // Only update if prices are significantly different (not just minor fluctuations)
    const coinADiff = Math.abs((tokenA.price - market.coin_a_opening_price) / tokenA.price);
    const coinBDiff = Math.abs((tokenB.price - market.coin_b_opening_price) / tokenB.price);

    if (coinADiff > 0.5 || coinBDiff > 0.5) {
      // Update the market with actual prices
      const { error: updateError } = await supabase
        .from('markets')
        .update({
          coin_a_opening_price: tokenA.price,
          coin_b_opening_price: tokenB.price,
          reference_price: tokenA.price, // Update legacy field too
        })
        .eq('id', market.id);

      if (updateError) {
        console.log(`   ❌ Failed to update: ${updateError.message}`);
      } else {
        console.log(`   ✅ Updated opening prices!`);
      }
    } else {
      console.log(`   ℹ️  Prices look correct (< 50% difference), no update needed`);
    }

    // Wait 1 second between markets to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('\n✅ Done fixing dual-coin prices!');
}

// Run the fix
fixDualCoinPrices().catch(console.error);
