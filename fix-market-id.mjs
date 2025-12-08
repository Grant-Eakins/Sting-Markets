import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function fixMarketId() {
  console.log('🔧 Fixing XRP market blockchainMarketId from 0 to 1...');
  
  // Find the XRP market
  const { data: markets, error: fetchError } = await supabase
    .from('markets')
    .select('*')
    .eq('stock_symbol', 'XRP');
  
  if (fetchError) {
    console.error('Error fetching markets:', fetchError);
    return;
  }
  
  if (!markets || markets.length === 0) {
    console.log('No XRP market found');
    return;
  }
  
  const market = markets[0];
  console.log('Found market:', market.id);
  console.log('Current blockchainMarketId:', market.blockchain_market_id);
  
  // Update to correct ID
  const { error: updateError } = await supabase
    .from('markets')
    .update({ blockchain_market_id: 1 })
    .eq('id', market.id);
  
  if (updateError) {
    console.error('Error updating market:', updateError);
    return;
  }
  
  console.log('✅ Updated blockchainMarketId to 1');
}

fixMarketId();
