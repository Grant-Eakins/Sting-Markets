// Debug script to query SharesPurchased events from the contract
import { createPublicClient, http, parseAbiItem } from 'viem';
import { baseSepolia } from 'viem/chains';

const CONTRACT_ADDRESS = '0xcddCc37B9A6a5736953C81E7AB0fca40f293B1ff'; // ProportionalMarketUSDC

const client = createPublicClient({
  chain: baseSepolia,
  transport: http('https://sepolia.base.org'),
});

async function main() {
  console.log('🔍 Querying SharesPurchased events from contract:', CONTRACT_ADDRESS);
  console.log('Chain: Base Sepolia (84532)');
  console.log('');

  try {
    // Get current block
    const currentBlock = await client.getBlockNumber();
    console.log('Current block:', currentBlock);

    // Query last 100k blocks
    const fromBlock = currentBlock - 100000n;
    console.log('Searching from block:', fromBlock, 'to', currentBlock);
    console.log('');

    // Query ALL SharesPurchased events (no user filter)
    const logs = await client.getLogs({
      address: CONTRACT_ADDRESS,
      event: parseAbiItem('event SharesPurchased(uint256 indexed marketId, address indexed user, uint8 outcomeIndex, uint256 shares, uint256 cost)'),
      fromBlock: fromBlock,
      toBlock: currentBlock,
    });

    console.log(`Found ${logs.length} SharesPurchased events`);
    console.log('');

    if (logs.length === 0) {
      console.log('❌ No bets have been placed on this contract yet!');
      console.log('');
      console.log('This means either:');
      console.log('1. No one has placed a bet yet');
      console.log('2. Bets are going to demo mode (blockchainMarketId is undefined)');
      console.log('3. The contract address is wrong');
    } else {
      console.log('✅ Bets found! Details:');
      for (const log of logs) {
        console.log('---');
        console.log('Market ID:', log.args.marketId?.toString());
        console.log('User:', log.args.user);
        console.log('Outcome Index:', log.args.outcomeIndex);
        console.log('Shares:', log.args.shares?.toString());
        console.log('Cost (wei):', log.args.cost?.toString());
        console.log('Tx Hash:', log.transactionHash);
        console.log('Block:', log.blockNumber?.toString());
      }
    }

  } catch (error) {
    console.error('Error querying events:', error);
  }
}

main();
