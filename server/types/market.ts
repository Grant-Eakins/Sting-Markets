export enum MarketStatus {
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
  stockSymbol: string;        // Stock ticker (e.g., "AAPL", "TSLA")
  stockName?: string;         // Full company name
  description: string;
  status: MarketStatus;
  
  // Timing
  createdAt: Date;
  lockTime: Date;             // When betting closes
  settleTime: Date;           // When market settles
  
  // Price data (in cents to avoid decimals: 17525 = $175.25)
  openingPrice: number;       // Opening price in cents
  currentPrice?: number;      // Current price (updated live)
  openTimestamp: Date;        // When opening price was recorded
  
  // Settlement data
  closingPrice?: number;      // Closing price in cents
  closeTimestamp?: Date;
  priceChange?: number;       // Change in price (cents)
  priceChangePercent?: number; // Percentage change
  winningPosition?: Position;
  
  // Market type
  isAfterHours: boolean;      // True for after-hours markets (4PM-9:30AM)
  
  // Betting pools (in ETH)
  upPool: number;
  downPool: number;
  totalPool: number;
  
  // Statistics
  upBettors: number;
  downBettors: number;
  totalBets: number;
  
  // Metadata
  imageUrl?: string;
  category?: string;
  contractAddress?: string;       // Contract address for meme coins
  
  // Blockchain integration
  blockchainMarketId?: number;  // On-chain market ID (if created on blockchain)
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
  stockSymbol: string;        // Stock ticker (e.g., "AAPL")
  stockName?: string;         // Full company name
  description: string;
  openingPrice: number;       // Opening price in cents (17525 = $175.25)
  isAfterHours: boolean;      // True for after-hours markets
  lockHours?: number;         // Hours until betting locks (default varies by market type)
  settleHours?: number;       // Hours until settlement (default varies by market type)
  lockTime?: Date;            // Direct lock time (overrides lockHours if provided)
  settleTime?: Date;          // Direct settle time (overrides settleHours if provided)
  imageUrl?: string;
  category?: string;
  contractAddress?: string;     // Contract address for meme coins (for price lookups)
  blockchainMarketId?: number;  // Optional: on-chain market ID if already created
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
