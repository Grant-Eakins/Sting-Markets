import { createPublicClient, http, parseAbiItem } from 'viem';
import { baseSepolia } from 'viem/chains';

const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http('https://sepolia.base.org'),
});

const contracts = [
  { name: 'ProportionalMarketMIND (OLD)', address: '0x219De13c961be6Bb0AA2CB1101944a443c79548d' },
  { name: 'ProportionalMarketUSDC (NEW)', address: '0xcddCc37B9A6a5736953C81E7AB0fca40f293B1ff' }
];

console.log('Checking for SharesPurchased events...\n');

for (const contract of contracts) {
  try {
    const currentBlock = await publicClient.getBlockNumber();
    const startBlock = currentBlock - 100000n;
    
    const logs = await publicClient.getLogs({
      address: contract.address,
      event: parseAbiItem('event SharesPurchased(uint256 indexed marketId, address indexed user, uint8 outcomeIndex, uint256 shares, uint256 cost)'),
      fromBlock: startBlock,
      toBlock: currentBlock,
    });
    
    console.log(`${contract.name}:`);
    console.log(`  Address: ${contract.address}`);
    console.log(`  Total bets: ${logs.length}`);
    if (logs.length > 0) {
      console.log(`  First bet at block: ${logs[0].blockNumber}`);
      console.log(`  Latest bet at block: ${logs[logs.length - 1].blockNumber}`);
      
      // Show unique users
      const users = new Set(logs.map(l => l.args.user));
      console.log(`  Unique bettors: ${users.size}`);
      console.log(`  Users: ${[...users].join(', ')}`);
    }
    console.log('');
  } catch (error) {
    console.log(`${contract.name}: Error - ${error.message}`);
    console.log('');
  }
}
