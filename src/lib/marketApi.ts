import axios from 'axios';

// Use relative URL in production (same origin), localhost in development
const API_BASE = import.meta.env.PROD 
  ? '/api' 
  : (import.meta.env.VITE_API_URL || 'http://localhost:3001') + '/api';

export interface Market {
  id: string;
  stockSymbol: string;        // Stock ticker (e.g., "AAPL")
  stockName?: string;         // Full company name
  description: string;
  status: 'ACTIVE' | 'LOCKED' | 'SETTLED' | 'CANCELLED';
  createdAt: string;
  lockTime: string;
  settleTime: string;
  openingPrice: number;       // Opening price in cents
  currentPrice?: number;      // Current price in cents
  closingPrice?: number;      // Closing price in cents
  priceChange?: number;       // Change in cents
  priceChangePercent?: number;
  winningPosition?: 'UP' | 'DOWN';
  isAfterHours: boolean;      // True for after-hours markets
  upPool?: number;
  downPool?: number;
  totalPool?: number;
  upBettors?: number;
  downBettors?: number;
  totalBets?: number;
  imageUrl?: string;
  category?: string;
  contractAddress?: string;     // Contract address for meme coins (for price lookups)
  blockchainMarketId?: number;  // On-chain market ID
  probabilities?: number[];     // LMSR probabilities for each outcome (0-100%)
}

export interface MarketOdds {
  upOdds: number;
  downOdds: number;
  upPercentage: number;
  downPercentage: number;
}

export interface Bet {
  id: string;
  marketId: string;
  userAddress: string;
  position: 'UP' | 'DOWN';
  amount: number;
  odds: number;
  timestamp: string;
  settled: boolean;
  won?: boolean;
  payout?: number;
  claimed: boolean;
}

export interface UserStats {
  totalBets: number;
  totalStaked: number;
  settledBets: number;
  wonBets: number;
  totalWon: number;
  claimable: number;
  winRate: number;
}

export async function fetchMarkets(status: 'active' | 'all' = 'active'): Promise<Market[]> {
  try {
    const response = await axios.get(`${API_BASE}/markets`, {
      params: { status },
    });
    console.log('API Response:', response.data);
    console.log('Markets count:', response.data.markets?.length || 0);
    return response.data.markets || [];
  } catch (error) {
    console.error('Error fetching markets:', error);
    // Return empty array instead of mock data
    return [];
  }
}

export async function fetchMarket(id: string): Promise<{ market: Market; odds: MarketOdds }> {
  try {
    const response = await axios.get(`${API_BASE}/markets/${id}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching market:', error);
    throw error;
  }
}

export async function placeBet(
  marketId: string,
  position: 'UP' | 'DOWN',
  amount: number,
  userAddress: string
): Promise<{ bet: Bet; market: Market; odds: MarketOdds }> {
  try {
    const response = await axios.post(`${API_BASE}/markets/${marketId}/bet`, {
      position,
      amount,
      userAddress,
    });
    return response.data;
  } catch (error: any) {
    console.error('Error placing bet:', error);
    throw new Error(error.response?.data?.error || 'Failed to place bet');
  }
}

export async function fetchUserBets(userAddress: string): Promise<{ bets: Bet[]; stats: UserStats }> {
  try {
    const response = await axios.get(`${API_BASE}/markets/user/${userAddress}/bets`);
    return response.data;
  } catch (error) {
    console.error('Error fetching user bets:', error);
    return { bets: [], stats: getEmptyStats() };
  }
}

export async function claimWinnings(betId: string, userAddress: string): Promise<number> {
  try {
    const response = await axios.post(`${API_BASE}/bets/${betId}/claim`, {
      userAddress,
    });
    return response.data.payout;
  } catch (error: any) {
    console.error('Error claiming winnings:', error);
    throw new Error(error.response?.data?.error || 'Failed to claim winnings');
  }
}

function getMockMarkets(): Market[] {
  return [
    {
      id: 'market-1',
      stockSymbol: 'AAPL',
      stockName: 'Apple Inc.',
      description: 'Will AAPL go UP or DOWN from $175.43?',
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      lockTime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      settleTime: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
      openingPrice: 17543,
      currentPrice: 17625,
      isAfterHours: false,
      upPool: 2.5,
      downPool: 1.8,
      totalPool: 4.3,
      upBettors: 12,
      downBettors: 8,
      totalBets: 20,
      category: 'Trading Hours',
    },
    {
      id: 'market-2',
      stockSymbol: 'TSLA',
      stockName: 'Tesla Inc.',
      description: 'Will TSLA go UP or DOWN from $245.67?',
      status: 'ACTIVE',
      createdAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
      lockTime: new Date(Date.now() + 1 * 60 * 60 * 1000).toISOString(),
      settleTime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      openingPrice: 24567,
      currentPrice: 24450,
      isAfterHours: false,
      upPool: 3.2,
      downPool: 2.1,
      totalPool: 5.3,
      upBettors: 15,
      downBettors: 10,
      totalBets: 25,
      category: 'Trading Hours',
    },
    {
      id: 'market-3',
      stockSymbol: 'SPY',
      stockName: 'S&P 500 ETF',
      description: 'Will SPY go UP or DOWN from $480.25?',
      status: 'ACTIVE',
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      lockTime: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
      settleTime: new Date(Date.now() + 14 * 60 * 60 * 1000).toISOString(),
      openingPrice: 48025,
      currentPrice: 48090,
      isAfterHours: true,
      upPool: 1.8,
      downPool: 2.4,
      totalPool: 4.2,
      upBettors: 9,
      downBettors: 13,
      totalBets: 22,
      category: 'After Hours',
    },
  ];
}

function getEmptyStats(): UserStats {
  return {
    totalBets: 0,
    totalStaked: 0,
    settledBets: 0,
    wonBets: 0,
    totalWon: 0,
    claimable: 0,
    winRate: 0,
  };
}
