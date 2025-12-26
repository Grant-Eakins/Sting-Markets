export enum MarketStatus {
  SCHEDULED = 'SCHEDULED',  // Market scheduled but not yet active
  ACTIVE = 'ACTIVE',
  LOCKED = 'LOCKED',
  SETTLED = 'SETTLED',
  CANCELLED = 'CANCELLED'
}

export enum Position {
  UP = 'UP',
  DOWN = 'DOWN'
}

export interface Market {
  id: string;
  stockSymbol: string;        // Stock ticker (e.g., "AAPL", "TSLA") - LEGACY: now used for Coin A
  stockName?: string;         // Full company name - LEGACY: now used for Coin A
  description: string;
  status: MarketStatus;
  
  // Timing
  createdAt: Date;
  startTime?: Date;           // When market should activate (for SCHEDULED markets)
  lockTime: Date;             // When betting closes
  settleTime: Date;           // When market settles
  
  // LEGACY FIELDS (kept for backward compatibility with old single-coin markets)
  openingPrice: number;       // Opening price in cents
  currentPrice?: number;      // Current price (updated live)
  openTimestamp: Date;        // When opening price was recorded
  closingPrice?: number;      // Closing price in cents
  closeTimestamp?: Date;
  priceChange?: number;       // Change in price (cents)
  priceChangePercent?: number; // Percentage change
  
  // DUAL COIN FIELDS (for head-to-head comparison markets)
  // Coin A (UP position)
  coinASymbol?: string;
  coinAName?: string;
  coinAAddress?: string;
  coinAImageUrl?: string;
  coinAOpeningPrice?: number;
  coinACurrentPrice?: number;
  coinAClosingPrice?: number;
  coinAChangePercent?: number;
  
  // Coin B (DOWN position)
  coinBSymbol?: string;
  coinBName?: string;
  coinBAddress?: string;
  coinBImageUrl?: string;
  coinBOpeningPrice?: number;
  coinBCurrentPrice?: number;
  coinBClosingPrice?: number;
  coinBChangePercent?: number;
  
  // Settlement
  winningPosition?: Position;  // UP = Coin A wins, DOWN = Coin B wins
  
  // Market type
  isAfterHours: boolean;      // True for after-hours markets (4PM-9:30AM)
  isDualCoin?: boolean;       // True for head-to-head coin comparison markets
  
  // Betting pools (in MIND tokens)
  upPool: number;             // Pool for Coin A (UP)
  downPool: number;           // Pool for Coin B (DOWN)
  totalPool: number;
  
  // Statistics
  upBettors: number;
  downBettors: number;
  totalBets: number;
  
  // Metadata
  imageUrl?: string;          // LEGACY: Coin A image
  category?: string;
  contractAddress?: string;   // LEGACY: Coin A contract address
  autoRecreate?: boolean;     // If true, automatically create new market when this settles
  
  // Blockchain integration
  blockchainMarketId?: number;  // On-chain market ID (if created on blockchain)
  probabilities?: number[];     // Blockchain probabilities for buckets
}

export interface Bet {
  id: string;
  marketId: string;
  userAddress: string;
  position: Position;
  amount: number;        // ETH amount
  odds: number;          // Odds at time of bet
  timestamp: Date;
  
  // Settlement
  settled: boolean;
  won?: boolean;
  payout?: number;       // ETH payout if won
  claimed: boolean;
}

export interface UserPosition {
  marketId: string;
  market: Market;
  bets: Bet[];
  totalStaked: number;
  potentialPayout: number;
  position: Position;
}

export interface MarketOdds {
  upOdds: number;    // e.g., 1.5x
  downOdds: number;  // e.g., 2.3x
  upPercentage: number;
  downPercentage: number;
}

export interface CreateMarketRequest {
  stockSymbol: string;        // Stock ticker (e.g., "AAPL") - LEGACY or Coin A symbol
  stockName?: string;         // Full company name - LEGACY or Coin A name
  description: string;
  openingPrice: number;       // Opening price in cents (17525 = $175.25) - LEGACY or Coin A price
  isAfterHours: boolean;      // True for after-hours markets
  lockHours?: number;         // Hours until betting locks (default varies by market type)
  settleHours?: number;       // Hours until settlement (default varies by market type)
  lockTime?: Date;            // Direct lock time (overrides lockHours if provided)
  settleTime?: Date;          // Direct settle time (overrides settleHours if provided)
  imageUrl?: string;          // LEGACY or Coin A image
  category?: string;
  contractAddress?: string;   // Contract address for meme coins (for price lookups) - LEGACY or Coin A
  blockchainMarketId?: number;  // Optional: on-chain market ID if already created
  
  // Dual coin fields
  isDualCoin?: boolean;
  coinASymbol?: string;
  coinAName?: string;
  coinAAddress?: string;
  coinAImageUrl?: string;
  coinAOpeningPrice?: number;
  coinBSymbol?: string;
  coinBName?: string;
  coinBAddress?: string;
  coinBImageUrl?: string;
  coinBOpeningPrice?: number;
  autoRecreate?: boolean;     // If true, automatically create new market when this settles
}

export interface PlaceBetRequest {
  marketId: string;
  position: Position;
  amount: number;
  userAddress: string;
}

export interface SettlementResult {
  marketId: string;
  closingPrice: number;           // Closing price in cents
  priceChange: number;            // Absolute change in cents
  priceChangePercent: number;     // Percentage change
  winningPosition: Position;
  winnersCount: number;
  totalPayout: number;
}
