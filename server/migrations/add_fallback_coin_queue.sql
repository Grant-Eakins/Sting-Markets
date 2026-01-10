-- Add fallback coin queue for 24/7 market creation
-- When auction doesn't have enough bids, use coins from this queue

CREATE TABLE IF NOT EXISTS fallback_coin_queue (
  id SERIAL PRIMARY KEY,
  contract_address TEXT NOT NULL,
  symbol TEXT NOT NULL,
  name TEXT NOT NULL,
  image_url TEXT,
  added_by TEXT,  -- wallet address of admin who added it
  added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  used_at TIMESTAMP WITH TIME ZONE,  -- when this coin was used to create a market
  is_available BOOLEAN DEFAULT true  -- false after used once
);

-- Index for finding available coins quickly
CREATE INDEX IF NOT EXISTS idx_fallback_queue_available 
ON fallback_coin_queue(is_available, added_at);

-- Unique constraint to prevent duplicate coins in queue
CREATE UNIQUE INDEX IF NOT EXISTS idx_fallback_queue_address 
ON fallback_coin_queue(LOWER(contract_address)) 
WHERE is_available = true;

COMMENT ON TABLE fallback_coin_queue IS 'Queue of coins to use for market creation when auction has no bids';
COMMENT ON COLUMN fallback_coin_queue.is_available IS 'False after coin has been used to create a market';
