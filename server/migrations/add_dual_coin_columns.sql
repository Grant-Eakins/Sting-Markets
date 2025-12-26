-- Migration: Add dual-coin market support and autoRecreate control
-- Run this in your Supabase SQL editor

-- Add dual-coin flag
ALTER TABLE markets ADD COLUMN IF NOT EXISTS is_dual_coin BOOLEAN DEFAULT FALSE;

-- Add Coin A fields
ALTER TABLE markets ADD COLUMN IF NOT EXISTS coin_a_symbol TEXT;
ALTER TABLE markets ADD COLUMN IF NOT EXISTS coin_a_name TEXT;
ALTER TABLE markets ADD COLUMN IF NOT EXISTS coin_a_address TEXT;
ALTER TABLE markets ADD COLUMN IF NOT EXISTS coin_a_image_url TEXT;
ALTER TABLE markets ADD COLUMN IF NOT EXISTS coin_a_opening_price INTEGER;
ALTER TABLE markets ADD COLUMN IF NOT EXISTS coin_a_current_price INTEGER;
ALTER TABLE markets ADD COLUMN IF NOT EXISTS coin_a_closing_price INTEGER;
ALTER TABLE markets ADD COLUMN IF NOT EXISTS coin_a_change_percent DECIMAL;

-- Add Coin B fields
ALTER TABLE markets ADD COLUMN IF NOT EXISTS coin_b_symbol TEXT;
ALTER TABLE markets ADD COLUMN IF NOT EXISTS coin_b_name TEXT;
ALTER TABLE markets ADD COLUMN IF NOT EXISTS coin_b_address TEXT;
ALTER TABLE markets ADD COLUMN IF NOT EXISTS coin_b_image_url TEXT;
ALTER TABLE markets ADD COLUMN IF NOT EXISTS coin_b_opening_price INTEGER;
ALTER TABLE markets ADD COLUMN IF NOT EXISTS coin_b_current_price INTEGER;
ALTER TABLE markets ADD COLUMN IF NOT EXISTS coin_b_closing_price INTEGER;
ALTER TABLE markets ADD COLUMN IF NOT EXISTS coin_b_change_percent DECIMAL;

-- Add auto-recreate control
ALTER TABLE markets ADD COLUMN IF NOT EXISTS auto_recreate BOOLEAN DEFAULT FALSE;

-- Create index for faster dual-coin queries
CREATE INDEX IF NOT EXISTS idx_markets_is_dual_coin ON markets(is_dual_coin);
CREATE INDEX IF NOT EXISTS idx_markets_auto_recreate ON markets(auto_recreate);

-- Update existing markets to have autoRecreate = true (default behavior)
UPDATE markets SET auto_recreate = TRUE WHERE auto_recreate IS NULL;

COMMENT ON COLUMN markets.is_dual_coin IS 'True for head-to-head coin comparison markets';
COMMENT ON COLUMN markets.auto_recreate IS 'If true, market automatically recreates after settlement';
COMMENT ON COLUMN markets.coin_a_symbol IS 'Symbol for Coin A (UP position in dual-coin markets)';
COMMENT ON COLUMN markets.coin_b_symbol IS 'Symbol for Coin B (DOWN position in dual-coin markets)';
