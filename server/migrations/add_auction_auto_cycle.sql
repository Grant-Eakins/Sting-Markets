-- Add auto-cycle mode for listing auctions
-- When enabled, automatically starts/stops auctions synced to dual coin battle lifecycle

ALTER TABLE auction_config 
ADD COLUMN IF NOT EXISTS auto_cycle_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS linked_market_id INTEGER;

-- Add comment explaining the feature
COMMENT ON COLUMN auction_config.auto_cycle_enabled IS 'When true, automatically cycles auctions with dual coin battles';
COMMENT ON COLUMN auction_config.linked_market_id IS 'The current dual coin market this auction cycle is linked to';

-- Verify changes
SELECT column_name, data_type, column_default
FROM information_schema.columns 
WHERE table_name = 'auction_config'
AND column_name IN ('auto_cycle_enabled', 'linked_market_id');
