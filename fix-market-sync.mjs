/**
 * Fix market sync - Create new on-chain market with correct times
 * and update the backend blockchainMarketId
 */

import { createPublicClient, createWalletClient, http, parseEther } from 'viem';
import { baseSepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import dotenv from 'dotenv';

dotenv.config();

const CONTRACT_ADDRESS = '0x1C184a4e374C5a0A85630f7CE27C689273B2FbD3';
const BACKEND_URL = 'https://sting-markets-production.up.railway.app';

const ABI = [
  {
    inputs: [
      { name: "stockSymbol", type: "string" },
      { name: "sessionType", type: "uint8" },
      { name: "referencePrice", type: "uint256" },
      { name: "lockTime", type: "uint256" },
      { name: "settleTime", type: "uint256" }
    ],
    name: "createMarket",
    outputs: [{ type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [],
    name: "nextMarketId",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ name: "marketId", type: "uint256" }],
    name: "getMarket",
    outputs: [
      { type: "string" },
      { type: "uint8" },
      { type: "uint8" },
      { type: "uint8" },
      { type: "uint256" },
      { type: "uint256" },
      { type: "uint256" },
      { type: "uint256" },
      { type: "bool" },
      { type: "uint8" },
      { type: "uint256" }
    ],
    stateMutability: "view",
    type: "function"
  }
];

async function main() {
  console.log('🔍 Checking current state...\n');

  // Get the backend market
  const response = await fetch(`${BACKEND_URL}/api/markets`);
  const data = await response.json();
  const market = data.markets[0];

  console.log('📦 Backend market:');
  console.log(`   Symbol: ${market.stockSymbol}`);
  console.log(`   ID: ${market.id}`);
  console.log(`   blockchainMarketId: ${market.blockchainMarketId}`);
  console.log(`   lockTime: ${market.lockTime}`);
  console.log(`   settleTime: ${market.settleTime}`);
  console.log(`   openingPrice: ${market.openingPrice}\n`);

  // Setup viem clients
  let privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!privateKey) {
    console.error('❌ DEPLOYER_PRIVATE_KEY not found in .env');
    process.exit(1);
  }
  privateKey = privateKey.trim().replace(/['"]/g, '');
  if (!privateKey.startsWith('0x')) privateKey = `0x${privateKey}`;

  const account = privateKeyToAccount(privateKey);
  const publicClient = createPublicClient({ chain: baseSepolia, transport: http() });
  const walletClient = createWalletClient({ account, chain: baseSepolia, transport: http() });

  // Check on-chain market
  if (market.blockchainMarketId) {
    console.log(`⛓️  On-chain market ${market.blockchainMarketId}:`);
    const onChainMarket = await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi: ABI,
      functionName: 'getMarket',
      args: [BigInt(market.blockchainMarketId)]
    });
    
    const lockTime = new Date(Number(onChainMarket[6]) * 1000);
    const settleTime = new Date(Number(onChainMarket[7]) * 1000);
    const now = new Date();
    
    console.log(`   Symbol: ${onChainMarket[0]}`);
    console.log(`   Status: ${['ACTIVE', 'LOCKED', 'SETTLED', 'CANCELLED'][onChainMarket[2]]}`);
    console.log(`   lockTime: ${lockTime.toISOString()} ${lockTime < now ? '⚠️ EXPIRED' : '✅'}`);
    console.log(`   settleTime: ${settleTime.toISOString()} ${settleTime < now ? '⚠️ EXPIRED' : '✅'}`);
    console.log('');
    
    if (lockTime < now) {
      console.log('❌ On-chain market is EXPIRED! Lock time has passed.');
      console.log('   This is why your transactions are failing with "Market locked".\n');
    }
  }

  // Create new on-chain market
  console.log('🔨 Creating NEW on-chain market with correct times...');
  
  const backendLockTime = new Date(market.lockTime);
  const backendSettleTime = new Date(market.settleTime);
  
  // Make sure times are in the future (at least 5 minutes from now)
  const minFutureTime = new Date(Date.now() + 5 * 60 * 1000);
  let lockTimeUnix = Math.floor(backendLockTime.getTime() / 1000);
  let settleTimeUnix = Math.floor(backendSettleTime.getTime() / 1000);
  
  // If backend times are in the past, use them but warn
  const nowUnix = Math.floor(Date.now() / 1000);
  if (lockTimeUnix <= nowUnix) {
    console.log(`⚠️  Backend lockTime is in the past. Adjusting to 2 hours from now.`);
    lockTimeUnix = nowUnix + 2 * 60 * 60; // 2 hours from now
    settleTimeUnix = lockTimeUnix + 3; // 3 seconds after lock
  }
  
  console.log(`   Symbol: ${market.stockSymbol}`);
  console.log(`   Reference Price: ${market.openingPrice} (scaled to ${BigInt(market.openingPrice) * BigInt(1e16)})`);
  console.log(`   Lock Time: ${new Date(lockTimeUnix * 1000).toISOString()}`);
  console.log(`   Settle Time: ${new Date(settleTimeUnix * 1000).toISOString()}`);
  console.log(`   Session Type: 0 (INTRADAY)`);

  // Get next market ID before creation
  const nextMarketId = await publicClient.readContract({
    address: CONTRACT_ADDRESS,
    abi: ABI,
    functionName: 'nextMarketId'
  });
  console.log(`\n   Next on-chain market ID will be: ${nextMarketId}`);

  // Create market
  const { request } = await publicClient.simulateContract({
    address: CONTRACT_ADDRESS,
    abi: ABI,
    functionName: 'createMarket',
    args: [
      market.stockSymbol,
      0, // INTRADAY
      BigInt(market.openingPrice) * BigInt(1e16), // Scale to 18 decimals
      BigInt(lockTimeUnix),
      BigInt(settleTimeUnix)
    ],
    account
  });

  const hash = await walletClient.writeContract(request);
  console.log(`   Transaction: ${hash}`);
  
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`   Status: ${receipt.status === 'success' ? '✅ Success' : '❌ Failed'}`);

  if (receipt.status === 'success') {
    const newMarketId = Number(nextMarketId);
    console.log(`\n✅ Created on-chain market with ID: ${newMarketId}`);
    
    // Update backend
    console.log(`\n📝 Updating backend market ${market.id} with blockchainMarketId=${newMarketId}...`);
    
    const updateResponse = await fetch(`${BACKEND_URL}/api/markets/${market.id}/blockchain-id`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blockchainMarketId: newMarketId })
    });
    
    if (updateResponse.ok) {
      console.log('✅ Backend updated successfully!');
      console.log('\n🎉 Market is now ready for betting!');
    } else {
      console.log('❌ Failed to update backend. Please update manually:');
      console.log(`   Market ID: ${market.id}`);
      console.log(`   Set blockchainMarketId = ${newMarketId}`);
    }
  }
}

main().catch(console.error);
