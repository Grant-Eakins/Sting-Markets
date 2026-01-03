-- Fix markets that were created on MIND contract but marked as isDualCoin=true
-- This clears their blockchainMarketId so they can be recreated on the correct dual coin contract

-- Option 1: Clear blockchain IDs for these specific markets
UPDATE markets 
SET blockchain_market_id = NULL
WHERE blockchain_market_id IN (14, 16, 17) 
  AND is_dual_coin = true;

-- Option 2: If you want to set them as single coin markets instead, use this:
-- UPDATE markets 
-- SET is_dual_coin = false
-- WHERE blockchain_market_id IN (14, 16, 17);

-- Verify the changes
SELECT id, stock_symbol, coin_a_symbol, coin_b_symbol, is_dual_coin, blockchain_market_id, status
FROM markets
WHERE id IN (
  SELECT id FROM markets WHERE stock_symbol IN ('ZORA-VIRTUAL') OR stock_symbol = 'THENICKSHIRLEY-REALGARRYTAN'
)
ORDER BY created_at DESC;
