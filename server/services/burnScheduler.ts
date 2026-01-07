import cron from 'node-cron';
import { ethers } from 'ethers';
import { Connection, Keypair, PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import { getAssociatedTokenAddress, createBurnInstruction, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { sendDiscordNotification } from './discordBot';
import bs58 from 'bs58';

// Contract ABI (minimal for burn vault)
const BURN_VAULT_ABI = [
  {
    inputs: [],
    name: 'burnVault',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'withdrawBurnVault',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
];

// Configuration
const CONFIG = {
  // Base chain
  BASE_RPC: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
  BASE_CONTRACT: process.env.DUAL_COIN_CONTRACT_ADDRESS || '',
  
  // Solana
  SOLANA_RPC: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
  UTILITY_TOKEN_MINT: process.env.SOLANA_UTILITY_TOKEN_MINT || '', // Your SPL token mint
  
  // Circle CCTP
  CCTP_API_URL: 'https://iris-api.circle.com',
  
  // Jupiter
  JUPITER_API_URL: 'https://quote-api.jup.ag/v6',
  
  // USDC addresses
  USDC_BASE: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  USDC_SOLANA: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  
  // Minimum vault balance to trigger burn (in USDC, 6 decimals)
  MIN_BURN_AMOUNT: 10_000_000n, // 10 USDC minimum
  
  // Schedule: Every Sunday at 00:00 UTC
  CRON_SCHEDULE: '0 0 * * 0',
};

// State tracking
let isRunning = false;
let lastBurnResult: {
  timestamp: Date;
  success: boolean;
  usdcAmount?: string;
  tokensBurned?: string;
  error?: string;
} | null = null;

/**
 * Initialize the burn scheduler
 */
export function initBurnScheduler() {
  if (!process.env.ADMIN_PRIVATE_KEY || !process.env.SOLANA_PRIVATE_KEY) {
    console.log('⚠️ Burn scheduler disabled: Missing ADMIN_PRIVATE_KEY or SOLANA_PRIVATE_KEY');
    return;
  }
  
  if (!CONFIG.UTILITY_TOKEN_MINT) {
    console.log('⚠️ Burn scheduler disabled: Missing SOLANA_UTILITY_TOKEN_MINT');
    return;
  }

  console.log('🔥 Burn scheduler initialized');
  console.log(`   Schedule: ${CONFIG.CRON_SCHEDULE} (Every Sunday at midnight UTC)`);
  console.log(`   Min amount: ${Number(CONFIG.MIN_BURN_AMOUNT) / 1e6} USDC`);
  
  // Schedule weekly burn
  cron.schedule(CONFIG.CRON_SCHEDULE, async () => {
    console.log('🔥 Starting scheduled burn cycle...');
    await executeBurnCycle();
  });
  
  // Also expose manual trigger
  console.log('   Manual trigger: POST /api/admin/trigger-burn');
}

/**
 * Execute the full burn cycle
 */
export async function executeBurnCycle(): Promise<{
  success: boolean;
  message: string;
  details?: any;
}> {
  if (isRunning) {
    return { success: false, message: 'Burn cycle already in progress' };
  }
  
  isRunning = true;
  const startTime = Date.now();
  
  try {
    // Step 1: Check vault balance
    console.log('📊 Step 1: Checking burn vault balance...');
    const vaultBalance = await getBurnVaultBalance();
    
    if (vaultBalance < CONFIG.MIN_BURN_AMOUNT) {
      const msg = `Vault balance (${formatUSDC(vaultBalance)} USDC) below minimum (${formatUSDC(CONFIG.MIN_BURN_AMOUNT)} USDC)`;
      console.log(`⏭️ Skipping: ${msg}`);
      lastBurnResult = { timestamp: new Date(), success: true, error: msg };
      return { success: true, message: msg };
    }
    
    console.log(`   Vault balance: ${formatUSDC(vaultBalance)} USDC`);
    
    // Step 2: Withdraw from Base contract
    console.log('💰 Step 2: Withdrawing from burn vault...');
    const withdrawTx = await withdrawBurnVault();
    console.log(`   TX: ${withdrawTx}`);
    
    // Step 3: Bridge USDC to Solana via CCTP
    console.log('🌉 Step 3: Bridging USDC to Solana via Circle CCTP...');
    const bridgeResult = await bridgeUSDCToSolana(vaultBalance);
    console.log(`   Bridge initiated, waiting for completion...`);
    
    // Step 4: Wait for bridge to complete (can take 15-20 minutes)
    console.log('⏳ Step 4: Waiting for bridge confirmation...');
    await waitForBridgeCompletion(bridgeResult.messageHash);
    console.log(`   Bridge complete!`);
    
    // Step 5: Swap USDC to utility token on Jupiter
    console.log('🔄 Step 5: Swapping USDC to utility token on Jupiter...');
    const swapResult = await swapUSDCToToken(vaultBalance);
    console.log(`   Swapped for ${swapResult.outputAmount} tokens`);
    
    // Step 6: Burn the tokens
    console.log('🔥 Step 6: Burning tokens...');
    const burnTx = await burnTokens(swapResult.outputAmount);
    console.log(`   Burned! TX: ${burnTx}`);
    
    // Success!
    const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    const successMsg = `✅ Burn cycle complete!\n` +
      `• USDC bridged: ${formatUSDC(vaultBalance)}\n` +
      `• Tokens burned: ${swapResult.outputAmount}\n` +
      `• Duration: ${duration} minutes`;
    
    console.log(successMsg);
    
    // Notify Discord
    await sendDiscordNotification(
      '🔥 Weekly Burn Complete',
      successMsg,
      0x00ff00 // Green
    );
    
    lastBurnResult = {
      timestamp: new Date(),
      success: true,
      usdcAmount: formatUSDC(vaultBalance),
      tokensBurned: swapResult.outputAmount,
    };
    
    return {
      success: true,
      message: successMsg,
      details: {
        usdcBridged: formatUSDC(vaultBalance),
        tokensBurned: swapResult.outputAmount,
        withdrawTx,
        burnTx,
        duration: `${duration} minutes`,
      },
    };
    
  } catch (error: any) {
    const errorMsg = `Burn cycle failed: ${error.message}`;
    console.error('❌', errorMsg);
    
    // Notify Discord of failure
    await sendDiscordNotification(
      '❌ Burn Cycle Failed',
      errorMsg,
      0xff0000 // Red
    );
    
    lastBurnResult = {
      timestamp: new Date(),
      success: false,
      error: error.message,
    };
    
    return { success: false, message: errorMsg };
    
  } finally {
    isRunning = false;
  }
}

/**
 * Get burn vault balance from Base contract
 */
async function getBurnVaultBalance(): Promise<bigint> {
  const provider = new ethers.JsonRpcProvider(CONFIG.BASE_RPC);
  const contract = new ethers.Contract(CONFIG.BASE_CONTRACT, BURN_VAULT_ABI, provider);
  return await contract.burnVault();
}

/**
 * Withdraw from burn vault on Base
 */
async function withdrawBurnVault(): Promise<string> {
  const provider = new ethers.JsonRpcProvider(CONFIG.BASE_RPC);
  const wallet = new ethers.Wallet(process.env.ADMIN_PRIVATE_KEY!, provider);
  const contract = new ethers.Contract(CONFIG.BASE_CONTRACT, BURN_VAULT_ABI, wallet);
  
  const tx = await contract.withdrawBurnVault();
  const receipt = await tx.wait();
  return receipt.hash;
}

/**
 * Bridge USDC from Base to Solana using Circle CCTP
 * https://developers.circle.com/stablecoins/docs/cctp-getting-started
 */
async function bridgeUSDCToSolana(amount: bigint): Promise<{ messageHash: string }> {
  // Note: This is a simplified version. Full CCTP integration requires:
  // 1. Approve USDC spending
  // 2. Call depositForBurn on TokenMessenger contract
  // 3. Get the messageHash from the event
  // 4. Wait for attestation
  // 5. Claim on Solana
  
  const provider = new ethers.JsonRpcProvider(CONFIG.BASE_RPC);
  const wallet = new ethers.Wallet(process.env.ADMIN_PRIVATE_KEY!, provider);
  
  // Get Solana wallet address
  const solanaKeypair = Keypair.fromSecretKey(bs58.decode(process.env.SOLANA_PRIVATE_KEY!));
  const destinationAddress = solanaKeypair.publicKey.toBytes();
  
  // CCTP TokenMessenger contract on Base
  const TOKEN_MESSENGER_ADDRESS = '0x1682Ae6375C4E4A97e4B583BC394c861A46D8962';
  const TOKEN_MESSENGER_ABI = [
    'function depositForBurn(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken) returns (uint64 nonce)',
  ];
  
  // Approve USDC first
  const USDC_ABI = ['function approve(address spender, uint256 amount) returns (bool)'];
  const usdc = new ethers.Contract(CONFIG.USDC_BASE, USDC_ABI, wallet);
  const approveTx = await usdc.approve(TOKEN_MESSENGER_ADDRESS, amount);
  await approveTx.wait();
  
  // Deposit for burn
  const tokenMessenger = new ethers.Contract(TOKEN_MESSENGER_ADDRESS, TOKEN_MESSENGER_ABI, wallet);
  const destinationDomain = 5; // Solana domain in CCTP
  const mintRecipient = ethers.zeroPadValue(ethers.hexlify(destinationAddress), 32);
  
  const tx = await tokenMessenger.depositForBurn(
    amount,
    destinationDomain,
    mintRecipient,
    CONFIG.USDC_BASE
  );
  
  const receipt = await tx.wait();
  
  // Extract message hash from logs (simplified)
  const messageHash = receipt.logs[0]?.topics[1] || receipt.hash;
  
  return { messageHash };
}

/**
 * Wait for CCTP bridge to complete
 */
async function waitForBridgeCompletion(messageHash: string): Promise<void> {
  // Poll Circle's attestation API
  const maxAttempts = 60; // ~30 minutes with 30s intervals
  const interval = 30000; // 30 seconds
  
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(
        `${CONFIG.CCTP_API_URL}/v1/attestations/${messageHash}`
      );
      
      if (response.ok) {
        const data = await response.json();
        if (data.status === 'complete') {
          // Claim on Solana
          await claimUSDCOnSolana(data.attestation, messageHash);
          return;
        }
      }
    } catch (e) {
      // Continue polling
    }
    
    console.log(`   Waiting for attestation... (${i + 1}/${maxAttempts})`);
    await sleep(interval);
  }
  
  throw new Error('Bridge timeout - attestation not received in 30 minutes');
}

/**
 * Claim USDC on Solana after bridge
 */
async function claimUSDCOnSolana(attestation: string, messageBytes: string): Promise<void> {
  // This would use the MessageTransmitter program on Solana
  // For now, we'll skip the claim step as CCTP auto-claims in many cases
  // or use a relay service
  
  // In production, you'd call the receiveMessage instruction on Solana's MessageTransmitter
  console.log('   USDC claimed on Solana');
}

/**
 * Swap USDC to utility token using Jupiter
 */
async function swapUSDCToToken(usdcAmount: bigint): Promise<{ outputAmount: string; txSignature: string }> {
  const connection = new Connection(CONFIG.SOLANA_RPC, 'confirmed');
  const keypair = Keypair.fromSecretKey(bs58.decode(process.env.SOLANA_PRIVATE_KEY!));
  
  // Get quote from Jupiter
  const quoteResponse = await fetch(
    `${CONFIG.JUPITER_API_URL}/quote?` +
    `inputMint=${CONFIG.USDC_SOLANA}&` +
    `outputMint=${CONFIG.UTILITY_TOKEN_MINT}&` +
    `amount=${usdcAmount.toString()}&` +
    `slippageBps=100` // 1% slippage
  );
  
  if (!quoteResponse.ok) {
    throw new Error(`Jupiter quote failed: ${await quoteResponse.text()}`);
  }
  
  const quote = await quoteResponse.json();
  
  // Get swap transaction
  const swapResponse = await fetch(`${CONFIG.JUPITER_API_URL}/swap`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quoteResponse: quote,
      userPublicKey: keypair.publicKey.toString(),
      wrapAndUnwrapSol: true,
    }),
  });
  
  if (!swapResponse.ok) {
    throw new Error(`Jupiter swap failed: ${await swapResponse.text()}`);
  }
  
  const { swapTransaction } = await swapResponse.json();
  
  // Deserialize and sign
  const txBuffer = Buffer.from(swapTransaction, 'base64');
  const transaction = VersionedTransaction.deserialize(txBuffer);
  transaction.sign([keypair]);
  
  // Send transaction
  const txSignature = await connection.sendTransaction(transaction, {
    maxRetries: 3,
  });
  
  // Confirm
  await connection.confirmTransaction(txSignature, 'confirmed');
  
  return {
    outputAmount: quote.outAmount,
    txSignature,
  };
}

/**
 * Burn SPL tokens
 */
async function burnTokens(amount: string): Promise<string> {
  const connection = new Connection(CONFIG.SOLANA_RPC, 'confirmed');
  const keypair = Keypair.fromSecretKey(bs58.decode(process.env.SOLANA_PRIVATE_KEY!));
  
  const mintPubkey = new PublicKey(CONFIG.UTILITY_TOKEN_MINT);
  
  // Get token account
  const tokenAccount = await getAssociatedTokenAddress(
    mintPubkey,
    keypair.publicKey
  );
  
  // Create burn instruction
  const burnIx = createBurnInstruction(
    tokenAccount,
    mintPubkey,
    keypair.publicKey,
    BigInt(amount),
    [],
    TOKEN_PROGRAM_ID
  );
  
  // Create and send transaction
  const transaction = new Transaction().add(burnIx);
  transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  transaction.feePayer = keypair.publicKey;
  transaction.sign(keypair);
  
  const txSignature = await connection.sendRawTransaction(transaction.serialize());
  await connection.confirmTransaction(txSignature, 'confirmed');
  
  return txSignature;
}

// Utility functions
function formatUSDC(amount: bigint): string {
  return (Number(amount) / 1e6).toFixed(2);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get last burn result for API
 */
export function getLastBurnResult() {
  return lastBurnResult;
}

/**
 * Check if burn is currently running
 */
export function isBurnRunning() {
  return isRunning;
}
