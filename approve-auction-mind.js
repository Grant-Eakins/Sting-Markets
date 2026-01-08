/**
 * Approve ListingAuction contract to spend MIND tokens
 * Run: node approve-auction-mind.js
 */

import { createWalletClient, createPublicClient, http, parseUnits } from 'viem';
import { baseSepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import * as dotenv from 'dotenv';

dotenv.config();

const MIND_TOKEN_ADDRESS = '0xce31ae82c11dd708ef51c93deeb5be0474a132d1'; // Base Sepolia
const LISTING_AUCTION_ADDRESS = '0xbd1a3880c174d9ae8831bf28880e6e4e9a5090b5'; // Base Sepolia

const MIND_ABI = [
  {
    "inputs": [
      { "name": "spender", "type": "address" },
      { "name": "amount", "type": "uint256" }
    ],
    "name": "approve",
    "outputs": [{ "name": "", "type": "bool" }],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "name": "owner", "type": "address" },
      { "name": "spender", "type": "address" }
    ],
    "name": "allowance",
    "outputs": [{ "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "name": "account", "type": "address" }],
    "name": "balanceOf",
    "outputs": [{ "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  }
];

async function main() {
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  
  if (!privateKey) {
    console.error('❌ DEPLOYER_PRIVATE_KEY not found in .env');
    process.exit(1);
  }

  const account = privateKeyToAccount(privateKey);
  
  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http('https://sepolia.base.org'),
  });

  const walletClient = createWalletClient({
    account,
    chain: baseSepolia,
    transport: http('https://sepolia.base.org'),
  });

  console.log('🔍 Checking MIND token status...');
  console.log(`   Wallet: ${account.address}`);
  console.log(`   MIND Token: ${MIND_TOKEN_ADDRESS}`);
  console.log(`   ListingAuction: ${LISTING_AUCTION_ADDRESS}`);

  // Check balance
  const balance = await publicClient.readContract({
    address: MIND_TOKEN_ADDRESS,
    abi: MIND_ABI,
    functionName: 'balanceOf',
    args: [account.address],
  });

  console.log(`\n💰 Your MIND balance: ${Number(balance) / 1e18} MIND`);

  // Check current allowance
  const currentAllowance = await publicClient.readContract({
    address: MIND_TOKEN_ADDRESS,
    abi: MIND_ABI,
    functionName: 'allowance',
    args: [account.address, LISTING_AUCTION_ADDRESS],
  });

  console.log(`📋 Current allowance: ${Number(currentAllowance) / 1e18} MIND`);

  if (Number(currentAllowance) >= Number(parseUnits('1000', 18))) {
    console.log('✅ Already approved! You can submit bids now.');
    return;
  }

  // Approve 1000 MIND tokens (enough for multiple bids)
  const approveAmount = parseUnits('1000', 18);
  
  console.log('\n🔐 Approving ListingAuction to spend 1000 MIND...');
  
  const hash = await walletClient.writeContract({
    address: MIND_TOKEN_ADDRESS,
    abi: MIND_ABI,
    functionName: 'approve',
    args: [LISTING_AUCTION_ADDRESS, approveAmount],
  });

  console.log(`📝 Transaction submitted: ${hash}`);
  console.log(`🔗 https://sepolia.basescan.org/tx/${hash}`);
  
  console.log('⏳ Waiting for confirmation...');
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  
  if (receipt.status === 'success') {
    console.log('✅ Approval successful!');
    console.log('🎯 You can now submit bids to the listing auction');
  } else {
    console.log('❌ Approval failed');
  }
}

main().catch(console.error);
