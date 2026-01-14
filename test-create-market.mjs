/**
 * Test creating a market on-chain to verify the approval works
 */
import { createPublicClient, createWalletClient, http } from 'viem';
import { baseSepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import dotenv from 'dotenv';

dotenv.config();

const DUAL_COIN_CONTRACT_ADDRESS = '0xfe1FbFd6d3d53617d1dd4664280900aCf9B16df4';
const MOCK_USDC_ADDRESS = '0x2A9A8eb5a722053AeF8E98A5E1f0dfDC9CaE5f50';

const DUAL_COIN_ABI = [
  {
    inputs: [
      { name: 'coinASymbol', type: 'string' },
      { name: 'coinBSymbol', type: 'string' },
      { name: 'lockTime', type: 'uint256' },
      { name: 'settleTime', type: 'uint256' }
    ],
    name: 'createMarket',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [],
    name: 'nextMarketId',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'token',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function'
  }
];

const ERC20_ABI = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' }
    ],
    name: 'allowance',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  }
];

async function main() {
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('DEPLOYER_PRIVATE_KEY not found in .env');
  }

  const account = privateKeyToAccount(privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`);
  console.log(`\n👤 Owner wallet: ${account.address}`);

  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http()
  });

  const walletClient = createWalletClient({
    account,
    chain: baseSepolia,
    transport: http()
  });

  // Check what token the contract uses
  const tokenAddress = await publicClient.readContract({
    address: DUAL_COIN_CONTRACT_ADDRESS,
    abi: DUAL_COIN_ABI,
    functionName: 'token'
  });
  console.log(`💰 Contract token: ${tokenAddress}`);
  console.log(`   Expected MockUSDC: ${MOCK_USDC_ADDRESS}`);
  console.log(`   Match: ${tokenAddress.toLowerCase() === MOCK_USDC_ADDRESS.toLowerCase()}`);

  // Check balance
  const balance = await publicClient.readContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [account.address]
  });
  console.log(`💰 Balance: ${Number(balance) / 1e6} USDC`);

  // Check allowance
  const allowance = await publicClient.readContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [account.address, DUAL_COIN_CONTRACT_ADDRESS]
  });
  console.log(`✅ Allowance: ${Number(allowance) / 1e6} USDC`);

  // Check next market ID
  const nextMarketId = await publicClient.readContract({
    address: DUAL_COIN_CONTRACT_ADDRESS,
    abi: DUAL_COIN_ABI,
    functionName: 'nextMarketId'
  });
  console.log(`📊 Next market ID: ${nextMarketId}`);

  // Try to create a market
  const now = Math.floor(Date.now() / 1000);
  const lockTime = now + (12 * 60 * 60); // 12 hours from now
  const settleTime = lockTime + (5 * 60); // 5 minutes after lock

  console.log(`\n🚀 Creating test market...`);
  console.log(`   Lock time: ${new Date(lockTime * 1000).toISOString()}`);
  console.log(`   Settle time: ${new Date(settleTime * 1000).toISOString()}`);

  try {
    const hash = await walletClient.writeContract({
      address: DUAL_COIN_CONTRACT_ADDRESS,
      abi: DUAL_COIN_ABI,
      functionName: 'createMarket',
      args: ['TestCoinA', 'TestCoinB', BigInt(lockTime), BigInt(settleTime)]
    });

    console.log(`⏳ Transaction: ${hash}`);
    
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log(`✅ Market created! Status: ${receipt.status}`);
    console.log(`🔗 https://sepolia.basescan.org/tx/${hash}`);
  } catch (error) {
    console.error(`❌ Error:`, error.message);
    if (error.cause) console.error(`   Cause:`, error.cause);
  }
}

main().catch(console.error);
