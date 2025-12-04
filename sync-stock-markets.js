/**
 * Script to sync stock markets with on-chain ProportionalMarket contract
 * Creates markets for stocks like TSLA, NVDA, AAPL, etc.
 */

import { createPublicClient, createWalletClient, http, parseAbi } from 'viem';
import { baseSepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import dotenv from 'dotenv';

dotenv.config();

// ProportionalMarket contract on Base Sepolia
const CONTRACT_ADDRESS = '0xfB1CcB2EA0441b375244a0A6a98F8a5c97B57496';
const BACKEND_URL = process.env.NODE_ENV === 'production' 
  ? 'https://sting-markets-production.up.railway.app'
  : 'http://localhost:3001';

const ABI = parseAbi([
  'function createMarket(string stockSymbol, uint8 sessionType, uint256 referencePrice, uint256 lockTime, uint256 settleTime) external returns (uint256)',
  'function marketCounter() view returns (uint256)',
  'function getMarket(uint256) view returns (string, uint8, uint8, uint8, uint256, uint256, uint256, uint256, bool, uint8, uint256)',
  'function owner() view returns (address)',
]);

// SessionType enum: 0 = INTRADAY, 1 = OVERNIGHT
const SessionType = {
  INTRADAY: 0,
  OVERNIGHT: 1,
};

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

  console.log('🔗 Syncing stock markets to Base Sepolia...');
  console.log('📍 Contract:', CONTRACT_ADDRESS);
  console.log('👤 Owner:', account.address);

  // Check owner
  const owner = await publicClient.readContract({
    address: CONTRACT_ADDRESS,
    abi: ABI,
    functionName: 'owner'
  });
  console.log('📜 Contract owner:', owner);
  
  if (owner.toLowerCase() !== account.address.toLowerCase()) {
    console.error('❌ Your wallet is not the contract owner!');
    console.error('   Your address:', account.address);
    console.error('   Owner address:', owner);
    process.exit(1);
  }

  // Get current on-chain market counter
  const currentCounter = await publicClient.readContract({
    address: CONTRACT_ADDRESS,
    abi: ABI,
    functionName: 'marketCounter'
  });

  console.log(`📊 Current on-chain markets: ${currentCounter}`);

  // Fetch markets from backend
  console.log('\n📡 Fetching markets from backend...');
  const response = await fetch(`${BACKEND_URL}/api/markets?status=all`);
  const data = await response.json();
  
  // Handle API response format {success: true, markets: [...]}
  const backendMarkets = data.markets || data;
  
  if (!Array.isArray(backendMarkets)) {
    console.error('❌ Invalid response from backend:', data);
    process.exit(1);
  }
  
  console.log(`📦 Found ${backendMarkets.length} markets in backend`);

  // Filter to markets that need to be created on-chain
  // Since we're starting fresh (marketCounter = 0), ALL markets need to be created
  const marketsToCreate = Number(currentCounter) === 0 
    ? backendMarkets 
    : backendMarkets.filter(m => m.blockchainMarketId === undefined || m.blockchainMarketId === null);

  if (marketsToCreate.length === 0) {
    console.log('✅ All markets already synced!');
    
    // List existing markets
    for (let i = 0; i < Number(currentCounter); i++) {
      const market = await publicClient.readContract({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: 'getMarket',
        args: [BigInt(i)]
      });
      console.log(`   Market ${i}: ${market[0]} - ${(Number(market[10]) / 1e18).toFixed(6)} ETH`);
    }
    return;
  }

  console.log(`\n🚀 Creating ${marketsToCreate.length} markets on-chain...`);

  for (const market of marketsToCreate) {
    try {
      // Determine session type based on isAfterHours
      const sessionType = market.isAfterHours ? SessionType.OVERNIGHT : SessionType.INTRADAY;
      
      // Reference price in cents (openingPrice is already in cents from backend)
      const referencePrice = BigInt(Math.round(market.openingPrice || market.currentPrice || 10000));
      
      // Lock and settle times
      const lockTime = BigInt(Math.floor(new Date(market.lockTime).getTime() / 1000));
      const settleTime = BigInt(Math.floor(new Date(market.settleTime).getTime() / 1000));
      
      console.log(`\n📈 Creating market for ${market.stockSymbol}...`);
      console.log(`   Session: ${sessionType === 0 ? 'INTRADAY' : 'OVERNIGHT'}`);
      console.log(`   Reference Price: $${(Number(referencePrice) / 100).toFixed(2)}`);
      console.log(`   Lock: ${new Date(Number(lockTime) * 1000).toLocaleString()}`);
      console.log(`   Settle: ${new Date(Number(settleTime) * 1000).toLocaleString()}`);
      
      const hash = await walletClient.writeContract({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: 'createMarket',
        args: [market.stockSymbol, sessionType, referencePrice, lockTime, settleTime]
      });
      
      console.log(`   ⏳ Tx: ${hash}`);
      
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      
      if (receipt.status === 'success') {
        // Get the new market ID (it's currentCounter before increment)
        const newMarketId = Number(currentCounter) + marketsToCreate.indexOf(market);
        console.log(`   ✅ Created! Market ID: ${newMarketId}`);
        
        // Update backend with blockchain market ID
        try {
          await fetch(`${BACKEND_URL}/api/markets/${market.id}/blockchain-id`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ blockchainMarketId: newMarketId })
          });
          console.log(`   📝 Updated backend with blockchainMarketId: ${newMarketId}`);
        } catch (e) {
          console.log(`   ⚠️  Failed to update backend: ${e.message}`);
        }
      } else {
        console.log(`   ❌ Transaction failed`);
      }
    } catch (err) {
      console.error(`   ❌ Error creating market ${market.stockSymbol}:`, err.message);
    }
  }

  // Final status
  const finalCounter = await publicClient.readContract({
    address: CONTRACT_ADDRESS,
    abi: ABI,
    functionName: 'marketCounter'
  });
  console.log(`\n✅ Done! Total on-chain markets: ${finalCounter}`);
}

main().catch(console.error);
