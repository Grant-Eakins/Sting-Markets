# Oracle Architecture - How Automatic Settlement Works

## Overview

Your backend server acts as the **trusted oracle** that fetches real stock prices and settles markets on-chain. The smart contract only accepts settlement calls from the authorized oracle address.

## Complete Flow

### 1. **Market Creation**
```
Backend → Fetch stock price from API (Alpha Vantage/Polygon)
Backend → Call contract.createMarket(symbol, sessionType, price, lockTime, settleTime)
Contract → Verify caller is owner
Contract → Create market with 23 or 42 buckets based on sessionType
Contract → Store referencePrice for later comparison
```

### 2. **Trading Period**
```
Users → Buy shares in specific buckets (e.g., "+3.0%", "-1.5%")
Contract → Use LMSR to calculate cost based on quantities
Contract → Update bucket quantities, collect payment
```

### 3. **Lock Time** (2 hours before close for trading, 8 hours for after-hours)
```
Contract → Block new trades when block.timestamp >= lockTime
Users → Can still view positions, but cannot trade
```

### 4. **Settlement Time** (market close: 4pm or 9:30am)
```
Cron Job → Runs every 15 minutes (server/index.ts)
         → Calls checkAndSettleMarkets()

checkAndSettleMarkets():
  1. Find markets where settleTime has passed
  2. For each market:
     - Fetch real stock price from API
     - Call settleOnChainMarket(marketId, finalPrice)

settleOnChainMarket():
  1. Backend wallet (oracle) calls contract.settleMarket(marketId, finalPrice)
  2. Contract verifies msg.sender == oracle address
  3. Contract calculates priceChange = (finalPrice - referencePrice) / referencePrice
  4. Contract calls getBucketIndex(priceChange, sessionType)
  5. Contract determines winning bucket
  6. Contract sets market.settled = true, market.winningOutcome = bucketIndex
  7. Transaction confirmed ✅

Users → Can now call claimPayout(marketId) to collect winnings
```

## Code Locations

### Backend Oracle Service
- **`server/services/marketSettlement.ts`** - Main settlement orchestrator
  - `checkAndSettleMarkets()` - Scans for markets ready to settle
  - `settleMarketWithData()` - Fetches price and settles
  
- **`server/services/blockchainSync.ts`** - Blockchain interaction
  - `settleOnChainMarket()` - Sends transaction to contract
  - Uses wallet with DEPLOYER_PRIVATE_KEY as oracle

- **`server/index.ts`** - Cron scheduler
  - Runs settlement check every 15 minutes
  - `cron.schedule('*/15 * * * *', ...)`

### Smart Contract
- **`contracts/MultiOutcomeMarket.sol`**
  - `settleMarket()` - Only callable by oracle address
  - `onlyOracle` modifier checks `msg.sender == oracle`
  - `getBucketIndex()` - Maps price change to bucket (23 or 42 buckets)

## Oracle Security

### Current Protection:
✅ **Access Control**: Only `oracle` address can call `settleMarket()`
✅ **One-Time Settlement**: Markets can only be settled once (`require(!market.settled)`)
✅ **Pausable**: Owner can pause contract in emergency
✅ **ReentrancyGuard**: Prevents reentrancy attacks on payouts

### Potential Issues:
⚠️ **Single Point of Failure**: If oracle wallet is compromised, attacker can settle markets with fake prices
⚠️ **No Dispute Period**: Settlement is immediate and irreversible
⚠️ **No Price Validation**: Contract trusts whatever price oracle provides

### Improvements for Production:

1. **Multi-Sig Oracle**
   ```solidity
   address[] public oracles;
   mapping(uint256 => mapping(address => uint256)) public priceSubmissions;
   
   function submitPrice(uint256 marketId, uint256 price) external onlyOracle {
       priceSubmissions[marketId][msg.sender] = price;
       // Settle when 2/3 oracles agree
   }
   ```

2. **Chainlink Price Feeds** (Best for mainnet)
   ```solidity
   import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
   
   function settleMarket(uint256 marketId) external {
       AggregatorV3Interface priceFeed = getFeedForSymbol(market.symbol);
       (, int256 price,,,) = priceFeed.latestRoundData();
       // Use Chainlink price automatically
   }
   ```

3. **Dispute Period**
   ```solidity
   uint256 constant DISPUTE_PERIOD = 1 hours;
   
   function settleMarket(...) {
       market.settlementProposedAt = block.timestamp;
       market.proposedFinalPrice = finalPrice;
   }
   
   function finalizeSettlement(uint256 marketId) external {
       require(block.timestamp >= market.settlementProposedAt + DISPUTE_PERIOD);
       // Finalize after 1 hour if no disputes
   }
   ```

## Environment Setup

### Required Environment Variable:
```bash
# .env file
DEPLOYER_PRIVATE_KEY="0x..." # Oracle wallet private key
```

### Contract Deployment:
When you deploy `MultiOutcomeMarket.sol`, you must pass the oracle address to the constructor:
```solidity
constructor(address _oracle) Ownable(msg.sender) {
    oracle = _oracle;
}
```

Deploy command:
```bash
# The deployer wallet address will be the oracle
forge create --rpc-url $BASE_SEPOLIA_RPC \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --constructor-args "0xYourOracleAddress" \
  contracts/MultiOutcomeMarket.sol:MultiOutcomeMarket
```

Then update `blockchainSync.ts`:
```typescript
const CONTRACT_ADDRESS = '0x...'; // New MultiOutcomeMarket address
```

## Testing the Oracle

### Manual Settlement Test:
```bash
# 1. Create a market with short settlement time (5 minutes)
POST /api/markets/create
{
  "stockSymbol": "AAPL",
  "settleHours": 0.083 // 5 minutes
}

# 2. Wait 5 minutes

# 3. Trigger settlement manually
POST /api/markets/:id/settle
{
  "closingPrice": 17500 // $175.00 in cents
}

# 4. Check logs for:
⛓️  Settling on-chain market #1
   Final price: $175.00
✅ Market #1 settled on-chain!
   Price change: +2.45%
   Winning bucket: #8
```

### Automated Settlement:
The cron job runs automatically every 15 minutes. Check server logs:
```
Running scheduled market settlement check...
⏰ Checking markets for settlement...
📊 Found 2 markets ready to settle

🏁 Settling market: AAPL
📈 Closing price: $175.43
⛓️  Settling on-chain market #1
✅ Market #1 settled on-chain!
```

## Current Status

- ✅ Backend cron job running every 15 minutes
- ✅ Settlement service fetches real stock prices
- ✅ Oracle wallet configured in .env
- ✅ Smart contract has oracle access control
- ⚠️ Need to deploy MultiOutcomeMarket.sol to Base Sepolia
- ⚠️ Need to update CONTRACT_ADDRESS in blockchainSync.ts

## Next Steps

1. **Deploy MultiOutcomeMarket.sol**:
   ```bash
   # Get your oracle address
   cast wallet address --private-key $DEPLOYER_PRIVATE_KEY
   
   # Deploy contract
   forge create contracts/MultiOutcomeMarket.sol:MultiOutcomeMarket \
     --rpc-url $BASE_SEPOLIA_RPC \
     --private-key $DEPLOYER_PRIVATE_KEY \
     --constructor-args "0xYourOracleAddress"
   ```

2. **Update blockchainSync.ts** with new contract address

3. **Test settlement** with a short-duration market

4. **Monitor logs** to verify automatic settlement works

5. **Consider upgrades** for mainnet (Chainlink, multi-sig, disputes)
