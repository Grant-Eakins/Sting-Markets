// Fix opening prices for existing markets - convert from encoded to raw USD
import 'dotenv/config';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

async function fixOpeningPrices() {
  // Fetch active dual-coin markets
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/markets?select=id,coin_a_symbol,coin_b_symbol,coin_a_opening_price,coin_b_opening_price,coin_a_address,coin_b_address,status&is_dual_coin=eq.true`,
    {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    }
  );

  const markets = await response.json();
  console.log('Found markets:', markets);

  if (!Array.isArray(markets) || markets.length === 0) {
    console.log('No active dual-coin markets found');
    return;
  }

  // Fetch current prices from DexScreener
  for (const market of markets) {
    console.log(`\nFixing market: ${market.coin_a_symbol} vs ${market.coin_b_symbol}`);
    console.log(`Current encoded prices: A=${market.coin_a_opening_price}, B=${market.coin_b_opening_price}`);

    // Fetch current prices (use these as opening since market just started)
    const [tokenARes, tokenBRes] = await Promise.all([
      fetch(`https://api.dexscreener.com/latest/dex/tokens/${market.coin_a_address}`),
      fetch(`https://api.dexscreener.com/latest/dex/tokens/${market.coin_b_address}`)
    ]);

    const tokenAData = await tokenARes.json();
    const tokenBData = await tokenBRes.json();

    // Find Base pairs
    const tokenAPair = tokenAData.pairs?.find(p => p.chainId === 'base');
    const tokenBPair = tokenBData.pairs?.find(p => p.chainId === 'base');

    if (!tokenAPair || !tokenBPair) {
      console.log('Could not find Base pairs for tokens');
      continue;
    }

    const priceA = parseFloat(tokenAPair.priceUsd);
    const priceB = parseFloat(tokenBPair.priceUsd);

    console.log(`Raw USD prices: A=$${priceA}, B=$${priceB}`);

    // Update the market
    const updateRes = await fetch(
      `${SUPABASE_URL}/rest/v1/markets?id=eq.${market.id}`,
      {
        method: 'PATCH',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({
          coin_a_opening_price: priceA,
          coin_b_opening_price: priceB
        })
      }
    );

    if (updateRes.ok) {
      console.log(`✅ Updated market ${market.id}`);
    } else {
      console.log(`❌ Failed to update: ${await updateRes.text()}`);
    }
  }
}

fixOpeningPrices().catch(console.error);
