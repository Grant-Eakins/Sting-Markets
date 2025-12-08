/**
 * Script to create a market on-chain
 * Run with: node create-market-onchain.js
 * 
 * Make sure you have your private key in .env as DEPLOYER_PRIVATE_KEY
 */

import { createPublicClient, createWalletClient, http } from 'viem';
import { baseSepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import dotenv from 'dotenv';

dotenv.config();

const CONTRACT_ADDRESS = '0xcddCc37B9A6a5736953C81E7AB0fca40f293B1ff'; // ProportionalMarketUSDC

const ABI = [
  {
    "inputs": [
      { "internalType": "string", "name": "trendName", "type": "string" },
      { "internalType": "uint256", "name": "initialInterest", "type": "uint256" },
      { "internalType": "uint256", "name": "lockTime", "type": "uint256" },
      { "internalType": "uint256", "name": "settleTime", "type": "uint256" }
    ],
    "name": "createMarket",
    "outputs": [
      { "internalType": "uint256", "name": "", "type": "uint256" }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  }
];

async function main() {
  // Get private key from environment
  let privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!privateKey) {
    console.error('❌ DEPLOYER_PRIVATE_KEY not found in .env file');
    process.exit(1);
  }

  // Clean up the private key (remove quotes, spaces, newlines)
  privateKey = privateKey.trim().replace(/['"]/g, '');
  
  // Ensure it starts with 0x
  if (!privateKey.startsWith('0x')) {
    privateKey = `0x${privateKey}`;
  }

  console.log('🔑 Private key length:', privateKey.length, '(should be 66)');

  const account = privateKeyToAccount(privateKey);

  const walletClient = createWalletClient({
    account,
    chain: baseSepolia,
    transport: http()
  });

  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http()
  });

  console.log('🔗 Creating market on Base Sepolia...');
  console.log('📍 Contract:', CONTRACT_ADDRESS);
  console.log('👤 Owner:', account.address);

  // Create market for "AI" trend
  const now = Math.floor(Date.now() / 1000);
  const lockTime = now + 86400; // 24 hours from now
  const settleTime = lockTime + 86400; // 48 hours from now

  try {
    const hash = await walletClient.writeContract({
      address: CONTRACT_ADDRESS,
      abi: ABI,
      functionName: 'createMarket',
      args: [
        'AI', // trendName
        75n,  // initialInterest (0-100)
        BigInt(lockTime),
        BigInt(settleTime)
      ]
    });

    console.log('⏳ Transaction submitted:', hash);
    console.log('🔗 View on BaseScan:', `https://sepolia.basescan.org/tx/${hash}`);

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    
    if (receipt.status === 'success') {
      console.log('✅ Market created successfully!');
      console.log('📊 Market ID: 0');
      console.log('🎯 Trend: AI');
      console.log('📈 Initial Interest: 75');
      console.log('🔒 Lock Time:', new Date(lockTime * 1000).toLocaleString());
      console.log('⚖️  Settle Time:', new Date(settleTime * 1000).toLocaleString());
    } else {
      console.error('❌ Transaction failed');
    }
  } catch (error) {
    console.error('❌ Error creating market:', error.message);
  }
}

main();
