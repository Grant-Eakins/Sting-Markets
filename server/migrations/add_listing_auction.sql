-- Listing Auction System for Dual Coin Market Creation

-- Create bids table
CREATE TABLE IF NOT EXISTS listing_bids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT NOT NULL,
  coin_contract_address TEXT NOT NULL,
  chain TEXT NOT NULL DEFAULT 'base', -- 'base' or 'solana'
  coin_symbol TEXT NOT NULL,
  coin_name TEXT,
  market_cap NUMERIC(20, 2),
  bid_amount NUMERIC(20, 10) NOT NULL, -- Amount in USDC (6 decimals stored as decimal)
  tx_hash TEXT, -- Transaction hash of the bid payment
  status TEXT DEFAULT 'active', -- active, winner, refunded, expired
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create auction_config table for admin settings
CREATE TABLE IF NOT EXISTS auction_config (
  id INTEGER PRIMARY KEY DEFAULT 1,
  is_active BOOLEAN DEFAULT false,
  min_market_cap NUMERIC(20, 2) DEFAULT 0,
  max_market_cap NUMERIC(20, 2) DEFAULT 1000000000, -- 1B default ceiling
  min_bid_amount NUMERIC(20, 10) DEFAULT 10, -- Minimum bid in USDC
  auction_duration_hours INTEGER DEFAULT 24, -- How long auction runs
  current_auction_start TIMESTAMP,
  current_auction_end TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT single_config CHECK (id = 1) -- Only one config row allowed
);

-- Insert default config
INSERT INTO auction_config (id) VALUES (1) 
ON CONFLICT (id) DO NOTHING;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_listing_bids_status ON listing_bids(status);
CREATE INDEX IF NOT EXISTS idx_listing_bids_created ON listing_bids(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_listing_bids_amount ON listing_bids(bid_amount DESC);
CREATE INDEX IF NOT EXISTS idx_listing_bids_wallet ON listing_bids(wallet_address);

-- Create view for active leaderboard
CREATE OR REPLACE VIEW auction_leaderboard AS
SELECT 
  lb.*,
  ROW_NUMBER() OVER (ORDER BY lb.bid_amount DESC, lb.created_at ASC) as rank
FROM listing_bids lb
WHERE lb.status = 'active'
  AND EXISTS (
    SELECT 1 FROM auction_config ac 
    WHERE ac.is_active = true 
    AND NOW() BETWEEN ac.current_auction_start AND ac.current_auction_end
  );

-- Verify tables
SELECT table_name, column_name, data_type 
FROM information_schema.columns 
WHERE table_name IN ('listing_bids', 'auction_config')
ORDER BY table_name, ordinal_position;
