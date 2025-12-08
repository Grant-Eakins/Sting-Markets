import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function deleteAllMarkets() {
  console.log('🗑️  Deleting all markets from database...');
  
  // First, delete all bets (foreign key constraint)
  const { error: betsError } = await supabase
    .from('bets')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');
  
  if (betsError) {
    console.error('Error deleting bets:', betsError);
  } else {
    console.log('✅ Deleted all bets');
  }
  
  // Then delete all markets
  const { data, error } = await supabase
    .from('markets')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000')
    .select();
  
  if (error) {
    console.error('Error deleting markets:', error);
  } else {
    console.log(`✅ Deleted ${data?.length || 0} markets`);
  }
  
  console.log('\n🎉 Done! Restart the server to create fresh markets on the new USDC contract.');
}

deleteAllMarkets();
