-- Supabase SQL Schema for Sting Markets
-- Run this in your Supabase SQL Editor (Database > SQL Editor)

-- Markets table
CREATE TABLE IF NOT EXISTS markets (
  id TEXT PRIMARY KEY,
  blockchain_market_id INTEGER,
  stock_symbol VARCHAR(10) NOT NULL,
  stock_name VARCHAR(100),
  description TEXT,
  status VARCHAR(20) DEFAULT 'ACTIVE',
  reference_price INTEGER NOT NULL,
  current_price INTEGER,
  final_price INTEGER,
  lock_time TIMESTAMPTZ NOT NULL,
  settle_time TIMESTAMPTZ NOT NULL,
  is_after_hours BOOLEAN DEFAULT FALSE,
  winning_position VARCHAR(10),
  price_change INTEGER,
  price_change_percent DECIMAL(10, 4),
  up_pool DECIMAL(18, 8) DEFAULT 0,
  down_pool DECIMAL(18, 8) DEFAULT 0,
  total_pool DECIMAL(18, 8) DEFAULT 0,
  total_bets INTEGER DEFAULT 0,
  category VARCHAR(50),
  contract_address VARCHAR(66),
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migration: Add contract_address column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'markets' AND column_name = 'contract_address'
  ) THEN
    ALTER TABLE markets ADD COLUMN contract_address VARCHAR(66);
  END IF;
END $$;

-- Migration: Add image_url column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'markets' AND column_name = 'image_url'
  ) THEN
    ALTER TABLE markets ADD COLUMN image_url TEXT;
  END IF;
END $$;

-- Bets table (for analytics - actual bets are on-chain)
CREATE TABLE IF NOT EXISTS bets (
  id TEXT PRIMARY KEY,
  market_id TEXT REFERENCES markets(id) ON DELETE CASCADE,
  user_address VARCHAR(42) NOT NULL,
  position VARCHAR(10) NOT NULL,
  amount DECIMAL(18, 8) NOT NULL,
  odds DECIMAL(10, 4),
  settled BOOLEAN DEFAULT FALSE,
  won BOOLEAN,
  payout DECIMAL(18, 8),
  claimed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_markets_status ON markets(status);
CREATE INDEX IF NOT EXISTS idx_markets_stock_symbol ON markets(stock_symbol);
CREATE INDEX IF NOT EXISTS idx_markets_settle_time ON markets(settle_time);
CREATE INDEX IF NOT EXISTS idx_bets_user_address ON bets(user_address);
CREATE INDEX IF NOT EXISTS idx_bets_market_id ON bets(market_id);

-- Enable Row Level Security (optional but recommended)
ALTER TABLE markets ENABLE ROW LEVEL SECURITY;
ALTER TABLE bets ENABLE ROW LEVEL SECURITY;

-- Allow public read access to markets
CREATE POLICY "Markets are viewable by everyone" ON markets
  FOR SELECT USING (true);

-- Allow service role to do everything
CREATE POLICY "Service role can manage markets" ON markets
  FOR ALL USING (auth.role() = 'service_role');

-- Allow public read access to bets  
CREATE POLICY "Bets are viewable by everyone" ON bets
  FOR SELECT USING (true);

-- Allow service role to manage bets
CREATE POLICY "Service role can manage bets" ON bets
  FOR ALL USING (auth.role() = 'service_role');

-- Note: For your backend to write data, use the service_role key (not anon key)
-- Or disable RLS for development:
-- ALTER TABLE markets DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE bets DISABLE ROW LEVEL SECURITY;
