# Smart Contract Deployment Guide

## Prerequisites

1. **Install Foundry** (Solidity development framework):
```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

2. **Get Base Sepolia ETH**:
   - Go to https://www.coinbase.com/faucets/base-ethereum-goerli-faucet
   - Connect wallet and claim testnet ETH
   - Bridge to Base Sepolia: https://bridge.base.org/

3. **Set up environment variables**:
Create `.env` file with:
```
PRIVATE_KEY=your_wallet_private_key
BASESCAN_API_KEY=your_basescan_api_key  # Get from https://basescan.org/apis
```

## Deployment Steps

### Option 1: Using Foundry (Recommended)

1. Initialize Foundry project:
```bash
cd contracts
forge init --no-commit
```

2. Move contract:
```bash
mv PredictionMarket.sol src/
```

3. Compile:
```bash
forge build
```

4. Deploy to Base Sepolia:
```bash
forge create --rpc-url https://sepolia.base.org \
  --private-key $PRIVATE_KEY \
  --verify \
  --verifier-url https://api-sepolia.basescan.org/api \
  --etherscan-api-key $BASESCAN_API_KEY \
  src/PredictionMarket.sol:PredictionMarket
```

5. **Copy the deployed contract address** and update `src/config/contract.ts`:
```typescript
export const CONTRACT_ADDRESSES = {
  8453: '0x0000000000000000000000000000000000000000', // Base Mainnet (deploy later)
  84532: '0xYOUR_DEPLOYED_ADDRESS_HERE', // Base Sepolia
} as const;
```

### Option 2: Using Hardhat

1. Install dependencies:
```bash
npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox
```

2. Initialize Hardhat:
```bash
npx hardhat init
```

3. Create deployment script `scripts/deploy.ts`:
```typescript
import { ethers } from "hardhat";

async function main() {
  const PredictionMarket = await ethers.getContractFactory("PredictionMarket");
  const market = await PredictionMarket.deploy();
  await market.waitForDeployment();
  
  console.log("PredictionMarket deployed to:", await market.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

4. Update `hardhat.config.ts`:
```typescript
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config();

const config: HardhatUserConfig = {
  solidity: "0.8.20",
  networks: {
    baseSepolia: {
      url: "https://sepolia.base.org",
      accounts: [process.env.PRIVATE_KEY!],
      chainId: 84532,
    },
  },
  etherscan: {
    apiKey: {
      baseSepolia: process.env.BASESCAN_API_KEY!,
    },
  },
};

export default config;
```

5. Deploy:
```bash
npx hardhat run scripts/deploy.ts --network baseSepolia
```

## After Deployment

1. **Update contract address** in `src/config/contract.ts`

2. **Update backend** to create markets on-chain:
   - Modify `server/services/trendSync.ts` to call contract's `createMarket()` function
   - Track blockchain marketId mapping

3. **Test the contract**:
```bash
# Get market info
cast call $CONTRACT_ADDRESS "getMarket(uint256)" 0 --rpc-url https://sepolia.base.org

# Place a test bet
cast send $CONTRACT_ADDRESS "placeBet(uint256,uint8)" 0 0 \
  --value 0.01ether \
  --private-key $PRIVATE_KEY \
  --rpc-url https://sepolia.base.org
```

## Deploy to Base Mainnet

Once tested on Sepolia:

```bash
forge create --rpc-url https://mainnet.base.org \
  --private-key $PRIVATE_KEY \
  --verify \
  --verifier-url https://api.basescan.org/api \
  --etherscan-api-key $BASESCAN_API_KEY \
  src/PredictionMarket.sol:PredictionMarket
```

Update `CONTRACT_ADDRESSES[8453]` with mainnet address.

## Verify Contract Manually

If auto-verification fails:

```bash
forge verify-contract \
  --chain-id 84532 \
  --num-of-optimizations 200 \
  --watch \
  $CONTRACT_ADDRESS \
  src/PredictionMarket.sol:PredictionMarket \
  --etherscan-api-key $BASESCAN_API_KEY
```

## Frontend Integration

The frontend already has:
- ✅ `useContract.ts` hooks for reading/writing contract
- ✅ `BetDialog.tsx` updated to use smart contract
- ✅ `WalletConnect` with RainbowKit
- ✅ Base Sepolia configuration

Just deploy the contract and update the address!
