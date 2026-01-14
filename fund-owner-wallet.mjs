/**
 * Fund owner wallet with MockUSDC and approve dual coin contract
 * Run with: node fund-owner-wallet.mjs
 */

import { createPublicClient, createWalletClient, http, parseUnits } from 'viem';
import { baseSepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import dotenv from 'dotenv';

dotenv.config();

const MOCK_USDC_ADDRESS = '0x2A9A8eb5a722053AeF8E98A5E1f0dfDC9CaE5f50';
const DUAL_COIN_CONTRACT_ADDRESS = '0xfe1FbFd6d3d53617d1dd4664280900aCf9B16df4';

const MOCK_USDC_ABI = [
  {
    inputs: [],
    name: 'faucet',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
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

  // Check current balance
  const balance = await publicClient.readContract({
    address: MOCK_USDC_ADDRESS,
    abi: MOCK_USDC_ABI,
    functionName: 'balanceOf',
    args: [account.address]
  });
  console.log(`💰 Current MockUSDC balance: ${Number(balance) / 1e6} USDC`);

  // Check current allowance
  const allowance = await publicClient.readContract({
    address: MOCK_USDC_ADDRESS,
    abi: MOCK_USDC_ABI,
    functionName: 'allowance',
    args: [account.address, DUAL_COIN_CONTRACT_ADDRESS]
  });
  console.log(`✅ Current allowance for dual coin contract: ${Number(allowance) / 1e6} USDC`);

  // If balance is low, call faucet
  if (Number(balance) < 100 * 1e6) { // Less than 100 USDC
    console.log(`\n🚰 Calling faucet to get more USDC...`);
    const faucetHash = await walletClient.writeContract({
      address: MOCK_USDC_ADDRESS,
      abi: MOCK_USDC_ABI,
      functionName: 'faucet',
      args: []
    });
    console.log(`⏳ Faucet transaction: ${faucetHash}`);
    await publicClient.waitForTransactionReceipt({ hash: faucetHash });
    console.log(`✅ Faucet success! Got 1000 USDC`);

    // Check new balance
    const newBalance = await publicClient.readContract({
      address: MOCK_USDC_ADDRESS,
      abi: MOCK_USDC_ABI,
      functionName: 'balanceOf',
      args: [account.address]
    });
    console.log(`💰 New MockUSDC balance: ${Number(newBalance) / 1e6} USDC`);
  }

  // Approve dual coin contract to spend USDC (approve a large amount)
  const approvalAmount = parseUnits('10000', 6); // 10,000 USDC
  console.log(`\n📝 Approving ${Number(approvalAmount) / 1e6} USDC for dual coin contract...`);
  
  const approveHash = await walletClient.writeContract({
    address: MOCK_USDC_ADDRESS,
    abi: MOCK_USDC_ABI,
    functionName: 'approve',
    args: [DUAL_COIN_CONTRACT_ADDRESS, approvalAmount]
  });
  console.log(`⏳ Approval transaction: ${approveHash}`);
  await publicClient.waitForTransactionReceipt({ hash: approveHash });
  console.log(`✅ Approval success!`);

  // Verify new allowance
  const newAllowance = await publicClient.readContract({
    address: MOCK_USDC_ADDRESS,
    abi: MOCK_USDC_ABI,
    functionName: 'allowance',
    args: [account.address, DUAL_COIN_CONTRACT_ADDRESS]
  });
  console.log(`✅ New allowance: ${Number(newAllowance) / 1e6} USDC`);

  console.log(`\n🎉 Done! Owner wallet is now funded and approved for market creation.`);
}

main().catch(console.error);
