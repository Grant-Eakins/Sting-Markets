# Smart Contract Integration Summary

## What We Built

### 1. **Smart Contract** (`contracts/PredictionMarket.sol`)
A Solidity contract that:
- Creates prediction markets with UP/DOWN positions
- Handles ETH bets with minimum 0.001 ETH, maximum 100 ETH
- Calculates dynamic odds based on pool distribution (1.01x - 10x)
- Locks markets at specified time, settles based on Google Trends data
- Distributes winnings with 2% platform fee
- Allows claims and refunds

### 2. **Contract ABI & Configuration** (`src/config/contract.ts`)
- Full ABI for all contract functions
- Contract addresses for Base Mainnet (8453) and Base Sepolia (84532)
- Ready for deployment - just update addresses after deploying

### 3. **React Hooks** (`src/hooks/useContract.ts`)
wagmi-based hooks for:
- `usePlaceBet()` - Place bets with ETH
- `useClaimWinnings()` - Claim won bets
- `useMarket()` - Read market data from chain
- `useMarketOdds()` - Get current odds
- `useUserBets()` - Get user's bet IDs
- `useBet()` - Get bet details

### 4. **Updated BetDialog** (`src/components/BetDialog.tsx`)
- Detects if contract is deployed
- Shows "Demo Mode" if contract not deployed
- Uses real blockchain transactions when available
- Shows transaction states: Confirm → Processing → Success
- Falls back to off-chain API for demo

### 5. **Deployment Guide** (`DEPLOYMENT.md`)
Complete instructions for:
- Installing Foundry (Solidity toolchain)
- Deploying to Base Sepolia testnet
- Verifying contract on Basescan
- Testing contract with cast commands
- Deploying to mainnet

## Current State

✅ **Backend** - Fully functional
- Creating markets from Google Trends
- Tracking bets in memory
- Settlement logic working
- API endpoints ready

✅ **Frontend** - Wallet-ready
- RainbowKit wallet connection
- Base chain configured
- Contract hooks implemented
- BetDialog supports both modes

⚠️ **Smart Contract** - Not yet deployed
- Contract code complete
- Needs deployment to Base Sepolia
- After deployment: Update `CONTRACT_ADDRESSES` in `src/config/contract.ts`

## How It Works

### Demo Mode (Current)
```
User → BetDialog → Off-chain API → In-memory storage
```
- No real money
- Instant transactions
- Great for testing

### Blockchain Mode (After Deployment)
```
User → Wallet (sign tx) → Smart Contract → Base blockchain
       ↓
   BetDialog shows: Confirm → Processing → Success
```
- Real ETH transactions
- Wallet signatures required
- On-chain transparency
- 2% platform fee

## Next Steps to Enable Blockchain

1. **Get testnet ETH**:
   - Go to https://www.coinbase.com/faucets
   - Claim Base Sepolia ETH

2. **Install Foundry**:
   ```bash
   curl -L https://foundry.paradigm.xyz | bash
   foundryup
   ```

3. **Deploy contract**:
   ```bash
   cd contracts
   forge create --rpc-url https://sepolia.base.org \
     --private-key $YOUR_PRIVATE_KEY \
     src/PredictionMarket.sol:PredictionMarket
   ```

4. **Update address** in `src/config/contract.ts`:
   ```typescript
   84532: '0xYOUR_DEPLOYED_ADDRESS', // Base Sepolia
   ```

5. **Restart frontend** - Blockchain mode enabled!

## Key Files

```
contracts/
  └── PredictionMarket.sol          ✅ Smart contract
  └── package.json                  ✅ Deployment scripts

src/
  ├── config/
  │   ├── contract.ts               ✅ ABI & addresses
  │   └── wagmi.ts                  ✅ Already configured
  ├── hooks/
  │   └── useContract.ts            ✅ Contract interaction hooks
  └── components/
      └── BetDialog.tsx             ✅ Updated for blockchain

server/
  └── services/
      ├── marketService.ts          ✅ Core logic
      ├── trendSync.ts              ✅ Market creation
      └── marketSettlement.ts       ✅ Settlement logic

DEPLOYMENT.md                       ✅ Full deployment guide
```

## Testing

**Test Demo Mode** (works now):
1. Start backend: `npm run server`
2. Start frontend: `npm run dev`
3. Connect wallet (RainbowKit)
4. Place bets → Uses off-chain API

**Test Blockchain Mode** (after deployment):
1. Deploy contract to Base Sepolia
2. Update contract address
3. Restart frontend
4. Connect wallet → Switch to Base Sepolia
5. Place bet → Sign transaction in wallet
6. Watch transaction on Basescan

## Benefits of Smart Contract

- **Trustless**: No one can manipulate bets or payouts
- **Transparent**: All bets visible on blockchain
- **Permissionless**: Anyone can participate
- **Composable**: Other contracts can interact
- **Auditable**: Code is public and verified

## Current Implementation

The platform works in **hybrid mode**:
- Markets created by backend (Google Trends sync)
- Bets can be on-chain (if contract deployed) or off-chain (demo)
- Settlement calculated off-chain, can trigger on-chain settlements
- Best of both worlds: Centralized data + decentralized money
