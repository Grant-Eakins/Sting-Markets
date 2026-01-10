-- Add dual coin market columns to markets table
-- Run this in Supabase SQL Editor

-- Title column
ALTER TABLE markets ADD COLUMN IF NOT EXISTS title TEXT;

-- Dual coin specific columns
ALTER TABLE markets ADD COLUMN IF NOT EXISTS is_dual_coin BOOLEAN DEFAULT false;
ALTER TABLE markets ADD COLUMN IF NOT EXISTS start_time TIMESTAMPTZ;
ALTER TABLE markets ADD COLUMN IF NOT EXISTS total_cost DECIMAL(18, 8) DEFAULT 0;

-- Coin A columns
ALTER TABLE markets ADD COLUMN IF NOT EXISTS coin_a_address TEXT;
ALTER TABLE markets ADD COLUMN IF NOT EXISTS coin_a_symbol VARCHAR(20);
ALTER TABLE markets ADD COLUMN IF NOT EXISTS coin_a_name TEXT;
ALTER TABLE markets ADD COLUMN IF NOT EXISTS coin_a_opening_price DECIMAL(30, 15);
ALTER TABLE markets ADD COLUMN IF NOT EXISTS coin_a_image_url TEXT;

-- Coin B columns
ALTER TABLE markets ADD COLUMN IF NOT EXISTS coin_b_address TEXT;
ALTER TABLE markets ADD COLUMN IF NOT EXISTS coin_b_symbol VARCHAR(20);
ALTER TABLE markets ADD COLUMN IF NOT EXISTS coin_b_name TEXT;
ALTER TABLE markets ADD COLUMN IF NOT EXISTS coin_b_opening_price DECIMAL(30, 15);
ALTER TABLE markets ADD COLUMN IF NOT EXISTS coin_b_image_url TEXT;

-- Contract market ID for blockchain sync
ALTER TABLE markets ADD COLUMN IF NOT EXISTS contract_market_id INTEGER;

-- Index for dual coin markets
CREATE INDEX IF NOT EXISTS idx_markets_is_dual_coin ON markets(is_dual_coin);
CREATE INDEX IF NOT EXISTS idx_markets_start_time ON markets(start_time);
CREATE INDEX IF NOT EXISTS idx_markets_contract_market_id ON markets(contract_market_id);

COMMENT ON COLUMN markets.is_dual_coin IS 'True for dual coin battle markets';
COMMENT ON COLUMN markets.start_time IS 'When a scheduled market becomes active';
COMMENT ON COLUMN markets.contract_market_id IS 'On-chain market ID from smart contract';
