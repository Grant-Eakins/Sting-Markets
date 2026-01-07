/**
 * Check USDC balance and approve dual coin contract
 */
import { createPublicClient, createWalletClient, http, parseUnits } from 'viem';
import { baseSepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import dotenv from 'dotenv';

dotenv.config();

const USDC_ADDRESS = '0x2A9A8eb5a722053AeF8E98A5E1f0dfDC9CaE5f50'; // MockUSDC on Base Sepolia
const DUAL_COIN_CONTRACT = '0xfe1FbFd6d3d53617d1dd4664280900aCf9B16df4';

const ERC20_ABI = [
  {
    "inputs": [{"internalType": "address", "name": "account", "type": "address"}],
    "name": "balanceOf",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {"internalType": "address", "name": "spender", "type": "address"},
      {"internalType": "uint256", "name": "amount", "type": "uint256"}
    ],
    "name": "approve",
    "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {"internalType": "address", "name": "owner", "type": "address"},
      {"internalType": "address", "name": "spender", "type": "address"}
    ],
    "name": "allowance",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  }
];

async function main() {
  let privateKey = process.env.DEPLOYER_PRIVATE_KEY || process.env.ADMIN_PRIVATE_KEY;
  if (!privateKey) {
    console.error('❌ No DEPLOYER_PRIVATE_KEY found in .env');
    process.exit(1);
  }

  privateKey = privateKey.trim().replace(/['"]/g, '');
  if (!privateKey.startsWith('0x')) {
    privateKey = `0x${privateKey}`;
  }

  const account = privateKeyToAccount(privateKey);
  
  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http()
  });

  const walletClient = createWalletClient({
    account,
    chain: baseSepolia,
    transport: http()
  });

  console.log('👤 Wallet:', account.address);
  console.log('💰 Checking USDC balance...');

  // Check balance
  const balance = await publicClient.readContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [account.address]
  });

  console.log(`   Balance: ${Number(balance) / 1e6} USDC`);

  // Check allowance
  const allowance = await publicClient.readContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [account.address, DUAL_COIN_CONTRACT]
  });

  console.log(`   Allowance for dual coin contract: ${Number(allowance) / 1e6} USDC`);

  if (Number(balance) < 2 * 1e6) {
    console.error('❌ Insufficient USDC balance! Need at least 2 USDC for seed liquidity');
    console.log('💡 You can get testnet USDC from a faucet or mint MockUSDC');
    process.exit(1);
  }

  if (Number(allowance) < 1000 * 1e6) {
    console.log('📝 Approving dual coin contract to spend USDC...');
    const hash = await walletClient.writeContract({
      address: USDC_ADDRESS,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [DUAL_COIN_CONTRACT, parseUnits('1000', 6)] // Approve 1000 USDC
    });

    console.log('⏳ Transaction:', hash);
    await publicClient.waitForTransactionReceipt({ hash });
    console.log('✅ Approval complete!');
  } else {
    console.log('✅ Sufficient allowance already set');
  }
}

main().catch(console.error);
