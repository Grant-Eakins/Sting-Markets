/**
 * Update the bidding token on the ListingAuction contract to use MockUSDC
 * Run with: node update-auction-token.js
 */

import { createWalletClient, createPublicClient, http, parseAbi } from 'viem';
import { baseSepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import dotenv from 'dotenv';

dotenv.config();

const AUCTION_ADDRESS = '0xd080A8e6260C394077cE6E8f77F9DbC5C2B50ec5';
const MOCK_USDC_ADDRESS = '0x2A9A8eb5a722053AeF8E98A5E1f0dfDC9CaE5f50';

const LISTING_AUCTION_ABI = parseAbi([
  'function updateBiddingToken(address _newToken) external',
  'function biddingToken() view returns (address)',
  'function owner() view returns (address)',
  'function stopAuction() external',
  'function startAuction(uint256 durationHours) external',
  'function config() view returns (bool isActive, uint256 minBidAmount, uint256 auctionStart, uint256 auctionEnd, uint256 minMarketCap, uint256 maxMarketCap)',
]);

async function main() {
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!privateKey) {
    console.error('❌ DEPLOYER_PRIVATE_KEY not found in .env');
    process.exit(1);
  }

  const account = privateKeyToAccount(privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`);
  console.log(`🔑 Using account: ${account.address}`);

  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(),
  });

  const walletClient = createWalletClient({
    account,
    chain: baseSepolia,
    transport: http(),
  });

  // Check current bidding token
  const currentToken = await publicClient.readContract({
    address: AUCTION_ADDRESS,
    abi: LISTING_AUCTION_ABI,
    functionName: 'biddingToken',
  });
  console.log(`📍 Current bidding token: ${currentToken}`);

  // Check owner
  const owner = await publicClient.readContract({
    address: AUCTION_ADDRESS,
    abi: LISTING_AUCTION_ABI,
    functionName: 'owner',
  });
  console.log(`👤 Contract owner: ${owner}`);

  if (owner.toLowerCase() !== account.address.toLowerCase()) {
    console.error(`❌ You are not the owner. Owner is ${owner}`);
    process.exit(1);
  }

  if (currentToken.toLowerCase() === MOCK_USDC_ADDRESS.toLowerCase()) {
    console.log('✅ Already using MockUSDC, no update needed');
    return;
  }

  // Check if auction is active
  const config = await publicClient.readContract({
    address: AUCTION_ADDRESS,
    abi: LISTING_AUCTION_ABI,
    functionName: 'config',
  });
  
  const isActive = config[0];
  console.log(`📊 Auction active: ${isActive}`);

  if (isActive) {
    console.log('⏸️  Stopping auction first...');
    const stopHash = await walletClient.writeContract({
      address: AUCTION_ADDRESS,
      abi: LISTING_AUCTION_ABI,
      functionName: 'stopAuction',
    });
    console.log(`📝 Stop tx: ${stopHash}`);
    const stopReceipt = await publicClient.waitForTransactionReceipt({ hash: stopHash });
    console.log(`✅ Auction stopped (block: ${stopReceipt.blockNumber})`);
    
    // Verify it's actually stopped
    const configAfterStop = await publicClient.readContract({
      address: AUCTION_ADDRESS,
      abi: LISTING_AUCTION_ABI,
      functionName: 'config',
    });
    console.log(`📊 Auction active after stop: ${configAfterStop[0]}`);
    
    if (configAfterStop[0]) {
      console.error('❌ Auction still active after stopAuction!');
      process.exit(1);
    }
  }

  console.log(`\n🔄 Updating bidding token to MockUSDC: ${MOCK_USDC_ADDRESS}`);

  const hash = await walletClient.writeContract({
    address: AUCTION_ADDRESS,
    abi: LISTING_AUCTION_ABI,
    functionName: 'updateBiddingToken',
    args: [MOCK_USDC_ADDRESS],
  });

  console.log(`📝 Transaction hash: ${hash}`);
  console.log('⏳ Waiting for confirmation...');

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  
  if (receipt.status === 'success') {
    console.log('✅ Bidding token updated successfully!');
    
    // Verify the change
    const newToken = await publicClient.readContract({
      address: AUCTION_ADDRESS,
      abi: LISTING_AUCTION_ABI,
      functionName: 'biddingToken',
    });
    console.log(`📍 New bidding token: ${newToken}`);
    
    // Restart the auction (168 hours = 1 week)
    console.log('\n🚀 Restarting auction for 168 hours...');
    const startHash = await walletClient.writeContract({
      address: AUCTION_ADDRESS,
      abi: LISTING_AUCTION_ABI,
      functionName: 'startAuction',
      args: [168n],
    });
    console.log(`📝 Start tx: ${startHash}`);
    await publicClient.waitForTransactionReceipt({ hash: startHash });
    console.log('✅ Auction restarted!');
  } else {
    console.error('❌ Transaction failed');
  }
}

main().catch(console.error);
