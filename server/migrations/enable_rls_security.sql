-- Enable Row Level Security (RLS) on all public tables
-- Fix Supabase Database Linter security warnings

-- ======================================
-- 0. Create missing tables
-- ======================================

-- Paused symbols table (if doesn't exist)
CREATE TABLE IF NOT EXISTS paused_symbols (
  symbol TEXT PRIMARY KEY,
  paused_at TIMESTAMPTZ DEFAULT NOW()
);

-- ======================================
-- 1. Enable RLS on all tables
-- ======================================

-- Markets table
ALTER TABLE IF EXISTS markets ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Markets are viewable by everyone" ON markets;
DROP POLICY IF EXISTS "Service role can manage markets" ON markets;

-- Allow public read access
CREATE POLICY "Markets are viewable by everyone" ON markets
  FOR SELECT USING (true);

-- Allow service role to do everything
CREATE POLICY "Service role can manage markets" ON markets
  FOR ALL USING (auth.role() = 'service_role');

-- Bets table
ALTER TABLE IF EXISTS bets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Bets are viewable by everyone" ON bets;
DROP POLICY IF EXISTS "Service role can manage bets" ON bets;

CREATE POLICY "Bets are viewable by everyone" ON bets
  FOR SELECT USING (true);

CREATE POLICY "Service role can manage bets" ON bets
  FOR ALL USING (auth.role() = 'service_role');

-- Listing bids table
ALTER TABLE IF EXISTS listing_bids ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Listing bids are viewable by everyone" ON listing_bids;
DROP POLICY IF EXISTS "Service role can manage listing bids" ON listing_bids;

CREATE POLICY "Listing bids are viewable by everyone" ON listing_bids
  FOR SELECT USING (true);

CREATE POLICY "Service role can manage listing bids" ON listing_bids
  FOR ALL USING (auth.role() = 'service_role');

-- Auction config table
ALTER TABLE IF EXISTS auction_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Auction config is viewable by everyone" ON auction_config;
DROP POLICY IF EXISTS "Service role can manage auction config" ON auction_config;

CREATE POLICY "Auction config is viewable by everyone" ON auction_config
  FOR SELECT USING (true);

CREATE POLICY "Service role can manage auction config" ON auction_config
  FOR ALL USING (auth.role() = 'service_role');

-- Paused symbols table (if exists)
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'paused_symbols') THEN
    ALTER TABLE paused_symbols ENABLE ROW LEVEL SECURITY;
    
    DROP POLICY IF EXISTS "Paused symbols are viewable by everyone" ON paused_symbols;
    DROP POLICY IF EXISTS "Service role can manage paused symbols" ON paused_symbols;
    
    EXECUTE 'CREATE POLICY "Paused symbols are viewable by everyone" ON paused_symbols
      FOR SELECT USING (true)';
    
    EXECUTE 'CREATE POLICY "Service role can manage paused symbols" ON paused_symbols
      FOR ALL USING (auth.role() = ''service_role'')';
  END IF;
END $$;

-- ======================================
-- 2. Fix SECURITY DEFINER view
-- ======================================

-- Remove the auction_leaderboard view entirely
-- The leaderboard is now read directly from the smart contract via useAuctionLeaderboard hook
-- This eliminates the SECURITY DEFINER warning since the view is no longer needed
DROP VIEW IF EXISTS auction_leaderboard;

-- ======================================
-- Verification
-- ======================================

-- Check RLS status
SELECT 
  schemaname,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('markets', 'bets', 'listing_bids', 'auction_config', 'paused_symbols')
ORDER BY tablename;

-- Check policies
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('markets', 'bets', 'listing_bids', 'auction_config', 'paused_symbols')
ORDER BY tablename, policyname;

-- Check view security
SELECT 
  schemaname,
  viewname,
  viewowner,
  definition
FROM pg_views
WHERE schemaname = 'public'
  AND viewname = 'auction_leaderboard';
