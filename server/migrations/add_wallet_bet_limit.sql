-- Add wallet bet limit setting to auction_config

-- Add column to auction_config if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'auction_config' AND column_name = 'enable_wallet_bet_limit'
  ) THEN
    ALTER TABLE auction_config ADD COLUMN enable_wallet_bet_limit BOOLEAN DEFAULT true;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'auction_config' AND column_name = 'max_bet_per_wallet'
  ) THEN
    ALTER TABLE auction_config ADD COLUMN max_bet_per_wallet NUMERIC(20, 10) DEFAULT 10;
  END IF;
END $$;

-- Update existing row to have default values
UPDATE auction_config 
SET enable_wallet_bet_limit = true,
    max_bet_per_wallet = 10
WHERE id = 1 AND enable_wallet_bet_limit IS NULL;
