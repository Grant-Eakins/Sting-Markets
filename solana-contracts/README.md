# Solana Contracts - Sting Markets

Port of EVM contracts to Solana using Anchor framework.

## Contracts

### 1. Listing Auction (`listing_auction`)
Port of `ListingAuction.sol` - Auction system for coin listing bids.

**Features:**
- Users bid with SPL tokens (e.g., $STNG) to get their coin listed
- Admin starts/stops auctions with configurable duration
- Top 2 bids become the next Coin Battle market
- 20% of winning bids are burned, 80% goes to treasury
- Non-winners get full refunds

### 2. Dual Coin Market (`dual_coin_market`)
Port of `ProportionalMarketDualCoin.sol` - Head-to-head prediction market.

**Features:**
- Uses native SOL for betting (instead of USDC)
- Coin A vs Coin B - bet on which performs better
- Bonding curve pricing for shares
- 3% fee: 2% protocol + 1% burn
- Proportional payouts to winners
- Cancel market with refunds option

## Prerequisites

1. Install Rust:
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

2. Install Solana CLI:
```bash
sh -c "$(curl -sSfL https://release.solana.com/v1.17.0/install)"
```

3. Install Anchor:
```bash
cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
avm install latest
avm use latest
```

## Build

```bash
cd solana-contracts
anchor build
```

## Deploy to Devnet

1. Configure Solana for devnet:
```bash
solana config set --url devnet
```

2. Create/use a wallet:
```bash
solana-keygen new -o ~/.config/solana/id.json
# Or use existing: solana config set --keypair ~/.config/solana/id.json
```

3. Airdrop SOL for deployment:
```bash
solana airdrop 2
```

4. Deploy:
```bash
anchor deploy
```

## Deploy to Mainnet

1. Configure Solana for mainnet:
```bash
solana config set --url mainnet-beta
```

2. Update `Anchor.toml`:
```toml
[provider]
cluster = "mainnet"
```

3. Deploy (requires real SOL):
```bash
anchor deploy
```

## Testing with Solana Playground

1. Go to [https://beta.solpg.io/](https://beta.solpg.io/)
2. Create new project
3. Copy `lib.rs` contents into the editor
4. Build and deploy from browser

## Key Differences from EVM

| EVM (Solidity) | Solana (Anchor) |
|----------------|-----------------|
| Contract state stored in contract | State in separate PDA accounts |
| `msg.sender` | Signer passed in context |
| `mapping` | PDA accounts with seeds |
| USDC (ERC20) | Native SOL (lamports) |
| Single transaction | May need setup transactions |
| Reentrancy guards | Built-in (Anchor) |

## Program IDs

After deployment, update these in your frontend:

```typescript
// Devnet
export const LISTING_AUCTION_PROGRAM_ID = "YOUR_DEPLOYED_ID";
export const DUAL_COIN_MARKET_PROGRAM_ID = "YOUR_DEPLOYED_ID";
```

## Frontend Integration

Use `@coral-xyz/anchor` and `@solana/web3.js`:

```typescript
import { Program, AnchorProvider } from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import { DualCoinMarket } from "./idl/dual_coin_market";

const connection = new Connection("https://api.devnet.solana.com");
const provider = new AnchorProvider(connection, wallet, {});
const program = new Program<DualCoinMarket>(IDL, PROGRAM_ID, provider);

// Buy shares example
await program.methods
  .buyShares(0, new BN(100000000)) // 0.1 SOL on Coin A
  .accounts({
    config: configPDA,
    market: marketPDA,
    position: positionPDA,
    vault: vaultPDA,
    bettor: wallet.publicKey,
    systemProgram: SystemProgram.programId,
  })
  .rpc();
```

## Security Notes

1. All admin functions require authority signer
2. Market operations are time-locked
3. Funds held in PDAs (Program Derived Addresses)
4. No external calls (no reentrancy risk)
5. Overflow protection via Rust's checked math
