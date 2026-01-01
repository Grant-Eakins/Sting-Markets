/**
 * Check the actual winning outcome for a market on the blockchain
 */
import { createPublicClient, http } from 'viem';
import { baseSepolia } from 'viem/chains';

const CONTRACT_ADDRESS = '0xa36fA2A8Dc1be09e049FE468281D36bc12c2043F';
const MARKET_ID = 1; // propaganda vs DONUT

const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http('https://sepolia.base.org'),
});

const ABI = [
  {
    "inputs": [{"internalType": "uint256", "name": "marketId", "type": "uint256"}],
    "name": "markets",
    "outputs": [
      {"internalType": "string", "name": "stockSymbol", "type": "string"},
      {"internalType": "uint256", "name": "marketId", "type": "uint256"},
      {"internalType": "uint8", "name": "sessionType", "type": "uint8"},
      {"internalType": "uint8", "name": "status", "type": "uint8"},
      {"internalType": "uint8", "name": "numOutcomes", "type": "uint8"},
      {"internalType": "uint256", "name": "referencePrice", "type": "uint256"},
      {"internalType": "uint256", "name": "finalPrice", "type": "uint256"},
      {"internalType": "uint256", "name": "lockTime", "type": "uint256"},
      {"internalType": "uint256", "name": "settleTime", "type": "uint256"},
      {"internalType": "bool", "name": "settled", "type": "bool"},
      {"internalType": "uint8", "name": "winningOutcome", "type": "uint8"},
      {"internalType": "uint256", "name": "totalLiquidity", "type": "uint256"}
    ],
    "stateMutability": "view",
    "type": "function"
  }
];

async function checkMarket() {
  console.log(`\n🔍 Checking market ${MARKET_ID} on blockchain...\n`);
  
  try {
    const marketData = await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi: ABI,
      functionName: 'markets',
      args: [BigInt(MARKET_ID)],
    });

    console.log('Market Data:');
    console.log('  Stock Symbol:', marketData[0]);
    console.log('  Market ID:', marketData[1].toString());
    console.log('  Session Type:', marketData[2]); // 0=INTRADAY, 1=OVERNIGHT
    console.log('  Status:', marketData[3]); // 0=ACTIVE, 1=LOCKED, 2=SETTLED, 3=CANCELLED
    console.log('  Num Outcomes:', marketData[4]);
    console.log('  Reference Price:', marketData[5].toString());
    console.log('  Final Price:', marketData[6].toString());
    console.log('  Lock Time:', new Date(Number(marketData[7]) * 1000).toLocaleString());
    console.log('  Settle Time:', new Date(Number(marketData[8]) * 1000).toLocaleString());
    console.log('  Settled:', marketData[9]);
    console.log('  Winning Outcome:', marketData[10]);
    console.log('  Total Liquidity:', (Number(marketData[11]) / 1e6).toFixed(2), 'USDC');
    
    console.log('\n🎯 RESULT:');
    if (marketData[9]) {
      console.log(`   Market IS settled`);
      console.log(`   Winning bucket: ${marketData[10]}`);
      console.log(`   ${marketData[10] === 0 ? 'Coin A (propaganda)' : 'Coin B (DONUT)'} won!`);
      console.log(`\n   Your bet: outcomeIndex 0 (propaganda)`);
      console.log(`   ${marketData[10] === 0 ? '✅ YOU WON!' : '❌ YOU LOST'}`);
    } else {
      console.log('   Market NOT yet settled on blockchain');
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkMarket();
