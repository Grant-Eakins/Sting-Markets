import { createPublicClient, http } from 'viem';
import { baseSepolia } from 'viem/chains';

const CONTRACT_ADDRESS = '0xcddCc37B9A6a5736953C81E7AB0fca40f293B1ff';

const ABI = [
  {
    inputs: [{ name: 'marketId', type: 'uint256' }],
    name: 'getMarket',
    outputs: [
      { name: 'stockSymbol', type: 'string' },
      { name: 'sessionType', type: 'uint8' },
      { name: 'status', type: 'uint8' },
      { name: 'numOutcomes', type: 'uint8' },
      { name: 'referencePrice', type: 'uint256' },
      { name: 'finalPrice', type: 'uint256' },
      { name: 'lockTime', type: 'uint256' },
      { name: 'settleTime', type: 'uint256' },
      { name: 'settled', type: 'bool' },
      { name: 'winningOutcome', type: 'uint8' },
      { name: 'totalLiquidity', type: 'uint256' }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'nextMarketId',
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  }
];

const client = createPublicClient({
  chain: baseSepolia,
  transport: http()
});

async function check() {
  const nextId = await client.readContract({
    address: CONTRACT_ADDRESS,
    abi: ABI,
    functionName: 'nextMarketId'
  });
  console.log('nextMarketId:', Number(nextId));
  
  for (let i = 0; i <= Number(nextId); i++) {
    const market = await client.readContract({
      address: CONTRACT_ADDRESS,
      abi: ABI,
      functionName: 'getMarket',
      args: [BigInt(i)]
    });
    console.log(`\nMarket ${i}:`, {
      stockSymbol: market[0],
      sessionType: market[1],
      status: market[2],
      numOutcomes: market[3],
      referencePrice: Number(market[4]),
      lockTime: new Date(Number(market[6]) * 1000).toISOString(),
      totalLiquidity: Number(market[10])
    });
  }
}

check();
