/**
 * Script to sync backend markets with on-chain markets
 * This creates on-chain markets for each backend market and updates the blockchainMarketId
 */

import { createPublicClient, createWalletClient, http } from 'viem';
import { baseSepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

const CONTRACT_ADDRESS = '0xfB1CcB2EA0441b375244a0A6a98F8a5c97B57496';
const BACKEND_URL = 'http://localhost:3001';

const ABI = [
  {
    "inputs": [
      { "internalType": "string", "name": "stockSymbol", "type": "string" },
      { "internalType": "uint8", "name": "sessionType", "type": "uint8" },
      { "internalType": "uint256", "name": "referencePrice", "type": "uint256" },
      { "internalType": "uint256", "name": "lockTime", "type": "uint256" },
      { "internalType": "uint256", "name": "settleTime", "type": "uint256" }
    ],
    "name": "createMarket",
    "outputs": [
      { "internalType": "uint256", "name": "", "type": "uint256" }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "marketCounter",
    "outputs": [
      { "internalType": "uint256", "name": "", "type": "uint256" }
    ],
    "stateMutability": "view",
    "type": "function"
  }
];

async function main() {
  // Get private key
  let privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!privateKey) {
    console.error('❌ DEPLOYER_PRIVATE_KEY not found in .env file');
    process.exit(1);
  }

  privateKey = privateKey.trim().replace(/['"]/g, '');
  if (!privateKey.startsWith('0x')) {
    privateKey = `0x${privateKey}`;
  }

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

  console.log('🔗 Syncing markets to Base Sepolia...');
  console.log('📍 Contract:', CONTRACT_ADDRESS);
  console.log('👤 Owner:', account.address);

  // Get current on-chain market counter
  const currentCounter = await publicClient.readContract({
    address: CONTRACT_ADDRESS,
    abi: ABI,
    functionName: 'marketCounter'
  });

  console.log(`📊 Current on-chain markets: ${currentCounter}`);

  // Fetch backend markets
  try {
    const response = await axios.get(`${BACKEND_URL}/api/markets`);
    const markets = response.data;

    console.log(`📋 Found ${markets.length} backend markets\n`);

    let nextMarketId = Number(currentCounter);

    for (const market of markets) {
      // Skip if already has blockchain market ID
      if (market.blockchainMarketId !== undefined && market.blockchainMarketId !== null) {
        console.log(`✅ ${market.stockSymbol || market.trendName} - Already on-chain (ID: ${market.blockchainMarketId})`);
        continue;
      }

      const stockSymbol = market.stockSymbol || market.trendName;
      console.log(`\n🚀 Creating on-chain market for: ${stockSymbol}`);

      const lockTime = Math.floor(new Date(market.lockTime).getTime() / 1000);
      const settleTime = Math.floor(new Date(market.settleTime).getTime() / 1000);
      
      // SessionType: 0 = INTRADAY (23 buckets), 1 = OVERNIGHT (42 buckets)
      const sessionType = market.isAfterHours ? 1 : 0;
      // Reference price in cents (e.g., $100.50 = 10050)
      const referencePrice = market.openingPrice || market.initialInterest || 10000;

      try {
        const hash = await walletClient.writeContract({
          address: CONTRACT_ADDRESS,
          abi: ABI,
          functionName: 'createMarket',
          args: [
            stockSymbol,
            sessionType,
            BigInt(referencePrice),
            BigInt(lockTime),
            BigInt(settleTime)
          ]
        });

        console.log(`⏳ Transaction: ${hash}`);
        const receipt = await publicClient.waitForTransactionReceipt({ hash });

        if (receipt.status === 'success') {
          console.log(`✅ Created on-chain market ID: ${nextMarketId}`);
          console.log(`   Symbol: ${stockSymbol}, Session: ${sessionType === 0 ? 'INTRADAY' : 'OVERNIGHT'}, Price: $${(referencePrice / 100).toFixed(2)}`);
          console.log(`🔗 BaseScan: https://sepolia.basescan.org/tx/${hash}`);
          
          // TODO: Update backend market with blockchainMarketId
          // You would need to add an endpoint to your backend API to update this
          console.log(`⚠️  Manual step: Update market ${market.id} with blockchainMarketId=${nextMarketId}`);
          
          nextMarketId++;
        } else {
          console.error(`❌ Transaction failed for ${stockSymbol}`);
        }
      } catch (error) {
        console.error(`❌ Error creating market ${stockSymbol}:`, error.message);
      }
    }

    console.log('\n✅ Sync complete!');
    console.log(`📊 Total on-chain markets: ${nextMarketId}`);
  } catch (error) {
    console.error('❌ Error fetching markets from backend:', error.message);
  }
}

main();
