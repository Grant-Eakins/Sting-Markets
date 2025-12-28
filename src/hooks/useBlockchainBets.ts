import { useAccount } from 'wagmi';
import { CONTRACT_ADDRESSES, TOKEN_DECIMALS } from '@/config/contract';
import { useState, useEffect } from 'react';
import { createPublicClient, http, parseAbiItem } from 'viem';
import { baseSepolia } from 'viem/chains';

// MIND token uses 18 decimals
const DECIMALS_DIVISOR = 10 ** TOKEN_DECIMALS;

// Create a public client for reading events with a proper RPC
const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http('https://sepolia.base.org'),
});

export interface BlockchainBet {
  betId: bigint;           // Synthetic ID based on event log index
  marketId: bigint;
  outcomeIndex: number;    // Bucket index (0-22 for intraday, 0-41 for overnight)
  shares: bigint;          // Number of shares remaining (after sells)
  cost: bigint;            // Token paid (in 18 decimal units)
  timestamp: number;       // Block timestamp
  txHash: string;          // Transaction hash
  // Legacy compatibility fields
  bettor: string;
  position: number;        // 0 if bucket < middle (UP-ish), 1 if bucket > middle (DOWN-ish)
  amount: bigint;          // Same as cost
  odds: bigint;            // Placeholder - parimutuel doesn't have fixed odds
  claimed: boolean;        // Will be determined from market settlement status
}

interface PositionKey {
  marketId: string;
  outcomeIndex: number;
}

export function useBlockchainBets() {
  const { address } = useAccount();
  const [bets, setBets] = useState<BlockchainBet[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const contractAddress = CONTRACT_ADDRESSES[84532];

  const fetchBets = async () => {
    if (!address || !contractAddress) {
      console.log('📊 useBlockchainBets: No address or contract', { address, contractAddress });
      setBets([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    console.log(`📊 Fetching bets for ${address} from contract ${contractAddress}`);
    console.log(`   Contract: ${contractAddress}`);

    try {
      // Get current block number
      console.log('📊 Getting current block number...');
      const currentBlock = await publicClient.getBlockNumber();
      console.log(`📊 Current block: ${currentBlock}`);
      
      // Query in chunks of 50,000 blocks (well under the 100k limit)
      const CHUNK_SIZE = 50000n;
      const LOOKBACK_BLOCKS = 500000n; // ~12 days on Base Sepolia (increased from 200k)
      const startBlock = currentBlock > LOOKBACK_BLOCKS ? currentBlock - LOOKBACK_BLOCKS : 0n;
      
      console.log(`📊 Querying blocks ${startBlock} to ${currentBlock} (looking back ${LOOKBACK_BLOCKS} blocks)`);

      const purchaseLogs: any[] = [];
      const sellLogs: any[] = [];
      const claimLogs: any[] = [];
      
      // Query in chunks for purchase, sell, and claim events
      for (let fromBlock = startBlock; fromBlock < currentBlock; fromBlock += CHUNK_SIZE) {
        const toBlock = fromBlock + CHUNK_SIZE - 1n > currentBlock ? currentBlock : fromBlock + CHUNK_SIZE - 1n;
        
        console.log(`📊 Querying chunk: ${fromBlock} to ${toBlock}`);
        
        // Fetch SharesPurchased events
        const purchases = await publicClient.getLogs({
          address: contractAddress as `0x${string}`,
          event: parseAbiItem('event SharesPurchased(uint256 indexed marketId, address indexed user, uint8 outcomeIndex, uint256 shares, uint256 cost)'),
          args: {
            user: address,
          },
          fromBlock: fromBlock,
          toBlock: toBlock,
        });
        
        // Fetch SharesSold events
        const sells = await publicClient.getLogs({
          address: contractAddress as `0x${string}`,
          event: parseAbiItem('event SharesSold(uint256 indexed marketId, address indexed user, uint8 outcomeIndex, uint256 shares, uint256 payout)'),
          args: {
            user: address,
          },
          fromBlock: fromBlock,
          toBlock: toBlock,
        });
        
        // Fetch PayoutClaimed events to track claimed status
        const claims = await publicClient.getLogs({
          address: contractAddress as `0x${string}`,
          event: parseAbiItem('event PayoutClaimed(uint256 indexed marketId, address indexed user, uint256 payout)'),
          args: {
            user: address,
          },
          fromBlock: fromBlock,
          toBlock: toBlock,
        });
        
        purchaseLogs.push(...purchases);
        sellLogs.push(...sells);
        claimLogs.push(...claims);
        console.log(`📊 Found ${purchases.length} purchases, ${sells.length} sells, ${claims.length} claims in chunk`);
      }

      console.log(`📊 Total: ${purchaseLogs.length} purchases, ${sellLogs.length} sells, ${claimLogs.length} claims for ${address}`);
      
      // Track which markets have been claimed
      const claimedMarkets = new Set<string>();
      for (const log of claimLogs) {
        claimedMarkets.add(log.args.marketId!.toString());
      }

      // Aggregate positions by market + outcomeIndex
      // Track net shares per position (buys - sells)
      const positionMap = new Map<string, {
        marketId: bigint;
        outcomeIndex: number;
        totalShares: bigint;
        totalCost: bigint;
        firstTimestamp: number;
        firstTxHash: string;
        firstBetId: bigint;
      }>();

      // Process all purchases
      for (const log of purchaseLogs) {
        const marketId = log.args.marketId!;
        const outcomeIndex = log.args.outcomeIndex!;
        const shares = log.args.shares!;
        const cost = log.args.cost!;
        
        const key = `${marketId.toString()}-${outcomeIndex}`;
        
        let timestamp = Date.now() / 1000;
        try {
          const block = await publicClient.getBlock({ blockNumber: log.blockNumber });
          timestamp = Number(block.timestamp);
        } catch (e) {
          console.warn('Could not fetch block timestamp:', e);
        }
        
        const existing = positionMap.get(key);
        if (existing) {
          existing.totalShares += shares;
          existing.totalCost += cost;
        } else {
          // Create a stable betId from marketId and outcomeIndex
          // This ensures the same position always has the same betId
          const stableBetId = marketId * 1000n + BigInt(outcomeIndex);
          
          positionMap.set(key, {
            marketId,
            outcomeIndex,
            totalShares: shares,
            totalCost: cost,
            firstTimestamp: timestamp,
            firstTxHash: log.transactionHash,
            firstBetId: stableBetId,
          });
        }
      }

      // Process all sells (subtract from positions)
      for (const log of sellLogs) {
        const marketId = log.args.marketId!;
        const outcomeIndex = log.args.outcomeIndex!;
        const shares = log.args.shares!;
        
        const key = `${marketId.toString()}-${outcomeIndex}`;
        
        const existing = positionMap.get(key);
        if (existing && existing.totalShares > 0n) {
          // Calculate what percentage of shares are being sold
          const sharesBefore = existing.totalShares;
          const percentageSold = Number(shares) / Number(sharesBefore);
          
          // Reduce shares
          existing.totalShares -= shares;
          
          // Proportionally reduce cost basis
          if (existing.totalShares > 0n) {
            // Reduce cost by the same proportion as shares sold
            const costReduction = BigInt(Math.floor(Number(existing.totalCost) * percentageSold));
            existing.totalCost -= costReduction;
          } else {
            existing.totalCost = 0n;
          }
          
          console.log(`📊 Sell processed: ${key} - sold ${Number(shares)/DECIMALS_DIVISOR} shares (${(percentageSold*100).toFixed(1)}%), remaining: ${Number(existing.totalShares)/DECIMALS_DIVISOR}`);
        }
      }

      // Convert to bets array, filtering out fully sold positions
      const activeBets: BlockchainBet[] = [];
      
      // Dust threshold: positions with less than 0.01 tokens worth are considered fully sold
      const DUST_THRESHOLD = BigInt(10000000000000000); // 0.01 * 1e18
      
      console.log(`📊 Processing ${positionMap.size} positions...`);
      
      for (const [key, position] of positionMap) {
        // Check if this market was claimed
        const isClaimed = claimedMarkets.has(position.marketId.toString());
        
        // Skip positions where all shares have been sold (or only dust remains)
        // BUT keep claimed positions so they show in settled bets
        if (position.totalShares <= DUST_THRESHOLD && !isClaimed) {
          console.log(`📊 Position ${key} fully sold (shares: ${Number(position.totalShares)/DECIMALS_DIVISOR}), skipping`);
          continue;
        }
        
        console.log(`📊 Position ${key} active with ${Number(position.totalShares)/DECIMALS_DIVISOR} shares, claimed: ${isClaimed}`);
        
        // Determine if this is an UP or DOWN position
        // For 2-bucket dual-coin: bucket 0 = UP (Coin A), bucket 1 = DOWN (Coin B)
        // For 10-bucket solo: bucket 0-4 = UP (gains), bucket 5-9 = DOWN (losses)
        // For 22/42 bucket LMSR: middle bucket separates UP/DOWN
        // Note: We don't know numOutcomes here, so use bucket index heuristics
        let isUpPosition: boolean;
        if (position.outcomeIndex === 0) {
          isUpPosition = true; // Bucket 0 is always UP in all market types
        } else if (position.outcomeIndex === 1) {
          isUpPosition = false; // For 2-bucket, bucket 1 is DOWN; for others, still UP but safer to mark DOWN
        } else if (position.outcomeIndex <= 4) {
          isUpPosition = true; // Buckets 2-4 are UP for 10-bucket markets
        } else if (position.outcomeIndex <= 20) {
          isUpPosition = false; // Buckets 5-20 are DOWN for 10-bucket or middle for 22/42
        } else {
          isUpPosition = false; // Buckets 21+ are definitely DOWN
        }
        const positionType = isUpPosition ? 0 : 1;
        
        activeBets.push({
          betId: position.firstBetId,
          marketId: position.marketId,
          outcomeIndex: position.outcomeIndex,
          shares: position.totalShares,
          cost: position.totalCost,
          timestamp: position.firstTimestamp,
          txHash: position.firstTxHash,
          bettor: address,
          position: positionType,
          amount: position.totalCost,
          odds: BigInt(200),
          claimed: isClaimed,
        });
      }

      // Sort by timestamp descending (newest first)
      activeBets.sort((a, b) => b.timestamp - a.timestamp);

      setBets(activeBets);
      console.log(`📊 Processed ${activeBets.length} active positions (${purchaseLogs.length} buys, ${sellLogs.length} sells, ${claimLogs.length} claims)`);
    } catch (err) {
      console.error('❌ Error fetching bets:', err);
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBets();
    
    // Refresh every 15 seconds
    const interval = setInterval(fetchBets, 15000);
    return () => clearInterval(interval);
  }, [address, contractAddress]);

  return {
    bets,
    isLoading,
    error,
    refetch: fetchBets,
  };
}
