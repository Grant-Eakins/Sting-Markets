-- Add support for scheduled markets with countdown timers
-- Markets will start in SCHEDULED status and activate at startTime (noon or midnight)

-- Add start_time column for scheduled market activation
ALTER TABLE markets 
ADD COLUMN IF NOT EXISTS start_time TIMESTAMPTZ;

-- Add index for querying scheduled markets ready to activate
CREATE INDEX IF NOT EXISTS idx_markets_scheduled_start_time 
ON markets(start_time) 
WHERE status = 'SCHEDULED';

-- Add comment explaining the new field
COMMENT ON COLUMN markets.start_time IS 'When a SCHEDULED market should activate and begin accepting bets. Markets activate at noon or midnight for 12-hour trading periods.';
