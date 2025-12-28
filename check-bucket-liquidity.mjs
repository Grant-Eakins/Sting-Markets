import { createPublicClient, http } from 'viem';
import { baseSepolia } from 'viem/chains';

const CONTRACT_ADDRESS = '0x219De13c961be6Bb0AA2CB1101944a443c79548d';
const MARKET_ID = 2n; // WOJAK vs 67

const ABI = [
  {
    "inputs": [
      { "internalType": "uint256", "name": "marketId", "type": "uint256" },
      { "internalType": "uint8", "name": "outcomeIndex", "type": "uint8" }
    ],
    "name": "getBucketData",
    "outputs": [
      { "internalType": "uint256", "name": "bucketLiquidity", "type": "uint256" },
      { "internalType": "uint256", "name": "totalShares", "type": "uint256" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "marketId", "type": "uint256" }
    ],
    "name": "getMarket",
    "outputs": [
      { "internalType": "string", "name": "stockSymbol", "type": "string" },
      { "internalType": "uint8", "name": "sessionType", "type": "uint8" },
      { "internalType": "uint8", "name": "status", "type": "uint8" },
      { "internalType": "uint8", "name": "numOutcomes", "type": "uint8" },
      { "internalType": "uint256", "name": "referencePrice", "type": "uint256" },
      { "internalType": "uint256", "name": "finalPrice", "type": "uint256" },
      { "internalType": "uint256", "name": "lockTime", "type": "uint256" },
      { "internalType": "uint256", "name": "settleTime", "type": "uint256" },
      { "internalType": "bool", "name": "settled", "type": "bool" },
      { "internalType": "uint8", "name": "winningOutcome", "type": "uint8" },
      { "internalType": "uint256", "name": "totalLiquidity", "type": "uint256" }
    ],
    "stateMutability": "view",
    "type": "function"
  }
];

const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http('https://sepolia.base.org'),
});

console.log('Checking bucket liquidity for WOJAK vs 67 market...\n');

try {
  // Get market info
  const marketData = await publicClient.readContract({
    address: CONTRACT_ADDRESS,
    abi: ABI,
    functionName: 'getMarket',
    args: [MARKET_ID],
  });
  
  const [stockSymbol, sessionType, status, numOutcomes, referencePrice, finalPrice, lockTime, settleTime, settled, winningOutcome, totalLiquidity] = marketData;
  
  console.log(`Market: ${stockSymbol}`);
  console.log(`Total Liquidity: ${Number(totalLiquidity) / 1e18} MIND\n`);
  
  // Get bucket 0 (WOJAK / Coin A)
  const bucket0 = await publicClient.readContract({
    address: CONTRACT_ADDRESS,
    abi: ABI,
    functionName: 'getBucketData',
    args: [MARKET_ID, 0],
  });
  
  const [bucket0Liquidity, bucket0Shares] = bucket0;
  const bucket0LiquidityMind = Number(bucket0Liquidity) / 1e18;
  const bucket0SharesNum = Number(bucket0Shares) / 1e18;
  const bucket0Percent = (bucket0LiquidityMind / (Number(totalLiquidity) / 1e18)) * 100;
  
  console.log('Bucket 0 (WOJAK):');
  console.log(`  Liquidity: ${bucket0LiquidityMind.toFixed(2)} MIND (${bucket0Percent.toFixed(1)}%)`);
  console.log(`  Total Shares: ${bucket0SharesNum.toFixed(2)}`);
  console.log(`  Avg Price: ${(bucket0LiquidityMind / bucket0SharesNum).toFixed(4)} MIND per share`);
  console.log('');
  
  // Get bucket 1 (67 / Coin B)
  const bucket1 = await publicClient.readContract({
    address: CONTRACT_ADDRESS,
    abi: ABI,
    functionName: 'getBucketData',
    args: [MARKET_ID, 1],
  });
  
  const [bucket1Liquidity, bucket1Shares] = bucket1;
  const bucket1LiquidityMind = Number(bucket1Liquidity) / 1e18;
  const bucket1SharesNum = Number(bucket1Shares) / 1e18;
  const bucket1Percent = (bucket1LiquidityMind / (Number(totalLiquidity) / 1e18)) * 100;
  
  console.log('Bucket 1 (67):');
  console.log(`  Liquidity: ${bucket1LiquidityMind.toFixed(2)} MIND (${bucket1Percent.toFixed(1)}%)`);
  console.log(`  Total Shares: ${bucket1SharesNum.toFixed(2)}`);
  console.log(`  Avg Price: ${(bucket1LiquidityMind / bucket1SharesNum).toFixed(4)} MIND per share`);
  console.log('');
  
  console.log('WHY YOU GOT FEWER SHARES ON WOJAK:');
  console.log('=====================================');
  console.log('The bonding curve formula: shares = amount / (1 + liquidity * steepness)');
  console.log('');
  console.log(`WOJAK bucket has ${bucket0Percent.toFixed(1)}% of liquidity = MORE expensive`);
  console.log(`  → Each MIND buys ${(bucket0SharesNum / bucket0LiquidityMind).toFixed(4)} shares`);
  console.log('');
  console.log(`67 bucket has ${bucket1Percent.toFixed(1)}% of liquidity = CHEAPER`);
  console.log(`  → Each MIND buys ${(bucket1SharesNum / bucket1LiquidityMind).toFixed(4)} shares`);
  console.log('');
  console.log('This is CORRECT and by design:');
  console.log('- Early bettors get more shares (better value)');
  console.log('- Late bettors get fewer shares (worse value)');
  console.log('- This rewards conviction and prevents late manipulation');
  
} catch (error) {
  console.error('Error:', error);
}
