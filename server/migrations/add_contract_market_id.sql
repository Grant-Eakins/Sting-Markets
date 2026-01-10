-- Add contract_market_id column to markets table
-- This stores the on-chain market ID for blockchain sync

ALTER TABLE markets 
ADD COLUMN IF NOT EXISTS contract_market_id INTEGER;

-- Add index for faster lookups by contract market ID
CREATE INDEX IF NOT EXISTS idx_markets_contract_market_id 
ON markets(contract_market_id);

COMMENT ON COLUMN markets.contract_market_id IS 'The on-chain market ID from the smart contract';
