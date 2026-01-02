-- Comprehensive migration to fix ALL price columns to support decimal values
-- Run this in Supabase SQL Editor to fix integer type errors

-- Market price columns
ALTER TABLE markets ALTER COLUMN reference_price TYPE NUMERIC(20, 10);
ALTER TABLE markets ALTER COLUMN current_price TYPE NUMERIC(20, 10);
ALTER TABLE markets ALTER COLUMN final_price TYPE NUMERIC(20, 10);

-- Dual coin price columns  
ALTER TABLE markets ALTER COLUMN coin_a_opening_price TYPE NUMERIC(20, 10);
ALTER TABLE markets ALTER COLUMN coin_a_current_price TYPE NUMERIC(20, 10);
ALTER TABLE markets ALTER COLUMN coin_a_closing_price TYPE NUMERIC(20, 10);
ALTER TABLE markets ALTER COLUMN coin_b_opening_price TYPE NUMERIC(20, 10);
ALTER TABLE markets ALTER COLUMN coin_b_current_price TYPE NUMERIC(20, 10);
ALTER TABLE markets ALTER COLUMN coin_b_closing_price TYPE NUMERIC(20, 10);

-- Percentage columns (should support decimals)
ALTER TABLE markets ALTER COLUMN price_change TYPE NUMERIC(20, 10);
ALTER TABLE markets ALTER COLUMN price_change_percent TYPE NUMERIC(10, 4);
ALTER TABLE markets ALTER COLUMN coin_a_change_percent TYPE NUMERIC(10, 4);
ALTER TABLE markets ALTER COLUMN coin_b_change_percent TYPE NUMERIC(10, 4);

-- Pool columns (should support decimals for fractional amounts)
ALTER TABLE markets ALTER COLUMN up_pool TYPE NUMERIC(20, 10);
ALTER TABLE markets ALTER COLUMN down_pool TYPE NUMERIC(20, 10);
ALTER TABLE markets ALTER COLUMN total_pool TYPE NUMERIC(20, 10);

-- Verify the changes
SELECT column_name, data_type, numeric_precision, numeric_scale
FROM information_schema.columns
WHERE table_name = 'markets'
  AND column_name IN (
    'reference_price', 'current_price', 'final_price',
    'coin_a_opening_price', 'coin_a_current_price', 'coin_a_closing_price',
    'coin_b_opening_price', 'coin_b_current_price', 'coin_b_closing_price',
    'price_change', 'price_change_percent', 'coin_a_change_percent', 'coin_b_change_percent',
    'up_pool', 'down_pool', 'total_pool'
  )
ORDER BY column_name;
