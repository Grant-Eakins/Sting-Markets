/**
 * Create XRP market on new contract
 */
import { createPublicClient, createWalletClient, http } from 'viem';
import { baseSepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import dotenv from 'dotenv';

dotenv.config();

const CONTRACT_ADDRESS = '0xcddCc37B9A6a5736953C81E7AB0fca40f293B1ff'; // ProportionalMarketUSDC

const ABI = [
  {
    inputs: [
      { name: 'stockSymbol', type: 'string' },
      { name: 'sessionType', type: 'uint8' },
      { name: 'referencePrice', type: 'uint256' },
      { name: 'lockTime', type: 'uint256' },
      { name: 'settleTime', type: 'uint256' }
    ],
    name: 'createMarket',
    outputs: [{ type: 'uint256' }],
    stateMutability: 'nonpayable',
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

async function main() {
  let privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!privateKey) {
    console.error('❌ DEPLOYER_PRIVATE_KEY not found');
    process.exit(1);
  }

  privateKey = privateKey.trim().replace(/['"]/g, '');
  if (!privateKey.startsWith('0x')) {
    privateKey = `0x${privateKey}`;
  }

  const account = privateKeyToAccount(privateKey);
  console.log('👤 Account:', account.address);

  const walletClient = createWalletClient({
    account,
    chain: baseSepolia,
    transport: http('https://sepolia.base.org')
  });

  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http('https://sepolia.base.org')
  });

  // Check current state
  const nextId = await publicClient.readContract({
    address: CONTRACT_ADDRESS,
    abi: ABI,
    functionName: 'nextMarketId'
  });
  console.log('📊 Current nextMarketId:', Number(nextId));

  // XRP market parameters
  const stockSymbol = 'XRP';
  const sessionType = 0; // INTRADAY (22 buckets)
  const referencePrice = 220n; // $2.20 in cents
  const lockTime = BigInt(Math.floor(new Date('2025-12-04T12:00:00Z').getTime() / 1000));
  const settleTime = BigInt(Math.floor(new Date('2025-12-04T12:00:03Z').getTime() / 1000));

  console.log('\n🚀 Creating XRP market...');
  console.log('   Symbol:', stockSymbol);
  console.log('   Price: $' + (Number(referencePrice) / 100).toFixed(2));
  console.log('   Lock:', new Date(Number(lockTime) * 1000).toISOString());
  console.log('   Settle:', new Date(Number(settleTime) * 1000).toISOString());

  try {
    const hash = await walletClient.writeContract({
      address: CONTRACT_ADDRESS,
      abi: ABI,
      functionName: 'createMarket',
      args: [stockSymbol, sessionType, referencePrice, lockTime, settleTime]
    });

    console.log('\n⏳ TX:', hash);
    
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    
    if (receipt.status === 'success') {
      const newNextId = await publicClient.readContract({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: 'nextMarketId'
      });
      const marketId = Number(newNextId) - 1;
      console.log('\n✅ SUCCESS! Market ID:', marketId);
      console.log('🔗 https://sepolia.basescan.org/tx/' + hash);
      console.log('\n⚠️  Now update the backend database:');
      console.log('   Set blockchainMarketId = ' + marketId + ' for the XRP market');
    } else {
      console.log('❌ Transaction failed');
    }
  } catch (e) {
    console.error('❌ Error:', e.message);
  }
}

main();
