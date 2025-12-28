import { createPublicClient, http, parseAbiItem } from 'viem';
import { baseSepolia } from 'viem/chains';

const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http('https://sepolia.base.org'),
});

const CONTRACT_ADDRESS = '0x219De13c961be6Bb0AA2CB1101944a443c79548d';
const YOUR_ADDRESS = '0xb0687EF6ea5906089Ec3586F9997764650BF1934';

console.log('Fetching all bets for:', YOUR_ADDRESS);
console.log('Contract:', CONTRACT_ADDRESS);
console.log('');

try {
  const currentBlock = await publicClient.getBlockNumber();
  const CHUNK_SIZE = 50000n;
  const LOOKBACK_BLOCKS = 500000n;
  const startBlock = currentBlock > LOOKBACK_BLOCKS ? currentBlock - LOOKBACK_BLOCKS : 0n;
  
  const purchaseLogs = [];
  const sellLogs = [];
  
  // Query in chunks
  for (let fromBlock = startBlock; fromBlock < currentBlock; fromBlock += CHUNK_SIZE) {
    const toBlock = fromBlock + CHUNK_SIZE - 1n > currentBlock ? currentBlock : fromBlock + CHUNK_SIZE - 1n;
    
    // Get purchases
    const purchases = await publicClient.getLogs({
      address: CONTRACT_ADDRESS,
      event: parseAbiItem('event SharesPurchased(uint256 indexed marketId, address indexed user, uint8 outcomeIndex, uint256 shares, uint256 cost)'),
      args: { user: YOUR_ADDRESS },
      fromBlock: fromBlock,
      toBlock: toBlock,
    });
    
    // Get sells
    const sells = await publicClient.getLogs({
      address: CONTRACT_ADDRESS,
      event: parseAbiItem('event SharesSold(uint256 indexed marketId, address indexed user, uint8 outcomeIndex, uint256 shares, uint256 payout)'),
      args: { user: YOUR_ADDRESS },
      fromBlock: fromBlock,
      toBlock: toBlock,
    });
    
    purchaseLogs.push(...purchases);
    sellLogs.push(...sells);
  }
  
  console.log(`Found ${purchaseLogs.length} purchases and ${sellLogs.length} sells`);
  console.log('');
  
  // Aggregate by position
  const positions = new Map();
  
  for (const log of purchaseLogs) {
    const marketId = log.args.marketId.toString();
    const outcomeIndex = log.args.outcomeIndex;
    const shares = log.args.shares;
    const cost = log.args.cost;
    
    const key = `${marketId}-${outcomeIndex}`;
    
    if (!positions.has(key)) {
      positions.set(key, {
        marketId,
        outcomeIndex,
        totalShares: 0n,
        totalCost: 0n,
        purchases: 0,
        sells: 0,
      });
    }
    
    const pos = positions.get(key);
    pos.totalShares += shares;
    pos.totalCost += cost;
    pos.purchases++;
  }
  
  // Process sells
  for (const log of sellLogs) {
    const marketId = log.args.marketId.toString();
    const outcomeIndex = log.args.outcomeIndex;
    const shares = log.args.shares;
    
    const key = `${marketId}-${outcomeIndex}`;
    
    if (positions.has(key)) {
      const pos = positions.get(key);
      const sharesBefore = pos.totalShares;
      const percentageSold = Number(shares) / Number(sharesBefore);
      
      pos.totalShares -= shares;
      pos.sells++;
      
      if (pos.totalShares > 0n) {
        const costReduction = BigInt(Math.floor(Number(pos.totalCost) * percentageSold));
        pos.totalCost -= costReduction;
      } else {
        pos.totalCost = 0n;
      }
    }
  }
  
  console.log('Positions:');
  console.log('==========');
  
  let activeCount = 0;
  const DUST_THRESHOLD = BigInt(10000000000000000); // 0.01 * 1e18
  
  for (const [key, pos] of positions) {
    const sharesNum = Number(pos.totalShares) / 1e18;
    const costNum = Number(pos.totalCost) / 1e18;
    const isDust = pos.totalShares <= DUST_THRESHOLD;
    
    console.log(`Market ${pos.marketId}, Bucket ${pos.outcomeIndex}:`);
    console.log(`  Shares: ${sharesNum.toFixed(4)} MIND`);
    console.log(`  Cost: ${costNum.toFixed(4)} MIND`);
    console.log(`  Purchases: ${pos.purchases}, Sells: ${pos.sells}`);
    console.log(`  Below dust threshold: ${isDust}`);
    console.log(`  Status: ${isDust ? 'FILTERED OUT' : 'ACTIVE'}`);
    console.log('');
    
    if (!isDust) activeCount++;
  }
  
  console.log(`Total positions: ${positions.size}`);
  console.log(`Active (above dust): ${activeCount}`);
  console.log(`Filtered (dust): ${positions.size - activeCount}`);
  
} catch (error) {
  console.error('Error:', error);
}
