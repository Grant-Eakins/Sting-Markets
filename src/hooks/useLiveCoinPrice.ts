import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

const API_BASE = import.meta.env.PROD ? '/api' : 'http://localhost:3001/api';

interface TokenInfo {
  symbol: string;
  name: string;
  price: number;
  priceChange24h: number;
  liquidity: number;
  volume24h: number;
  imageUrl?: string;
}

/**
 * Hook to fetch live token price from DexScreener
 */
export function useLiveCoinPrice(contractAddress?: string) {
  return useQuery({
    queryKey: ['token-price', contractAddress],
    queryFn: async (): Promise<TokenInfo | null> => {
      if (!contractAddress) return null;
      const response = await axios.get(`${API_BASE}/markets/token/${contractAddress}`);
      return response.data.token;
    },
    enabled: !!contractAddress,
    refetchInterval: 30000, // Refresh every 30 seconds
    staleTime: 15000, // Consider data stale after 15 seconds
  });
}
