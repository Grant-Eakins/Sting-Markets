# 📊 Google Trends → Stock Price Markets Migration Guide

## ✅ What's Been Changed

### 1. Smart Contract (`contracts/PredictionMarket.sol`)
**Before:**
```solidity
struct Market {
    string trendName;
    uint256 initialInterest;  // 0-100 score
    ...
}

function createMarket(string trendName, uint256 initialInterest, ...)
function settleMarket(uint256 marketId, uint256 finalInterest)
```

**After:**
```solidity
struct Market {
    string stockSymbol;      // "AAPL", "TSLA", etc.
    uint256 openingPrice;    // Price in cents (17525 = $175.25)
    bool isAfterHours;       // True for after-hours markets
    ...
}

function createMarket(string stockSymbol, uint256 openingPrice, uint256 lockTime, uint256 settleTime, bool isAfterHours)
function settleMarket(uint256 marketId, uint256 closingPrice)  // Price in cents
```

### 2. New Stock API Service (`server/services/stockApi.ts`)
- **Replaces:** `googleTrends.ts`
- **API:** Alpha Vantage (free tier: 25 calls/day)
- **Functions:**
  - `getStockQuote(symbol)` - Get current price, open, high, low, volume
  - `getIntradayData(symbol)` - Get 5-min candles for charts
  - `getBatchQuotes(symbols[])` - Get multiple quotes
  - `isTradingHours()` - Check if market is open (9:30AM-4PM ET)
  - `getMarketType()` - Returns 'trading', 'afterHours', or 'preMarket'
- **Mock Data:** Works with `demo` API key for development
- **Popular Stocks:** AAPL, TSLA, NVDA, MSFT, GOOGL, AMZN, META, SPY, QQQ, AMD

### 3. Market Types Updated (`server/types/market.ts`)
**Key Changes:**
```typescript
interface Market {
  // Old: trendName, initialInterest, currentInterest, finalInterest
  // New:
  stockSymbol: string;        // "AAPL"
  stockName?: string;         // "Apple Inc."
  openingPrice: number;       // Opening price in cents
  currentPrice?: number;      // Current price
  closingPrice?: number;      // Final closing price
  isAfterHours: boolean;      // Market type flag
  priceChange?: number;       // Change in cents
  priceChangePercent?: number;
  // ... rest stays same
}

interface CreateMarketRequest {
  stockSymbol: string;
  openingPrice: number;       // In cents
  isAfterHours: boolean;
  lockHours?: number;         // Default: 2 (trading) or 8 (after-hours)
  settleHours?: number;       // Default: 3 (trading) or 16 (after-hours)
  // ...
}
```

### 4. Stock Sync Service (`server/services/stockSync.ts`)
**Replaces:** `trendSync.ts`

**Logic:**
- Checks if trading hours or after-hours
- **Trading Hours (9:30AM-4PM):** 
  - Creates markets for individual stocks (AAPL, TSLA, NVDA, etc.)
  - 2-hour lock, 3-hour settlement
  - Focus on big movers
- **After-Hours (4PM-9:30AM):**
  - Creates markets for liquid stocks/ETFs (SPY, QQQ, AAPL, TSLA, NVDA)
  - 8-hour lock, 16-hour settlement
  - Overnight/pre-market betting
- Creates 4 markets per sync cycle
- Avoids duplicates (checks last 24h)

### 5. Market Service Updates (`server/services/marketService.ts`)
- `createMarket()` - Uses stock symbol, opening price, isAfterHours
- `settleMarket()` - Uses closing price instead of interest score
- `updateMarketPrice()` - Renamed from `updateMarketInterest()`
- All console logs updated with price formatting

### 6. Blockchain Sync Updates (`server/services/blockchainSync.ts`)
- `createOnChainMarket()` - Takes stockSymbol, openingPrice, isAfterHours
- `settleOnChainMarket()` - Takes closingPrice
- ABI updated for new contract structure
- Contract address: `0xb80950545A057bF00E37dA2D459351AFe78c1193` (needs redeployment with new code)

## 🚀 What You Need To Do Next

### Step 1: Deploy New Smart Contract
```bash
# You need to redeploy PredictionMarket.sol with the new structure
# Use your deployment script or Remix
# Update CONTRACT_ADDRESS in:
# - server/services/blockchainSync.ts
# - src/config/contract.ts
```

### Step 2: Get Alpha Vantage API Key
1. Visit https://www.alphavantage.co/support/#api-key
2. Enter your email
3. Add to `.env`:
   ```
   ALPHA_VANTAGE_API_KEY=YOUR_KEY_HERE
   ```
4. Or use `ALPHA_VANTAGE_API_KEY=demo` for testing with mock data

### Step 3: Update Frontend Files (Not Done Yet)
These files still reference Google Trends and need updating:

**Priority Files to Update:**
- `src/lib/marketApi.ts` - Change trendName → stockSymbol, initialInterest → openingPrice
- `src/pages/Markets.tsx` - Update UI text from "Trends" to "Stocks"
- `src/pages/MyBets.tsx` - Update display to show stock symbols
- `src/pages/Admin.tsx` - Update form for stock creation
- `src/components/MarketCard.tsx` - Display stock info instead of trend
- `src/pages/HowItWorks.tsx` - Explain stock betting mechanics
- `src/config/contract.ts` - Update ABI to match new contract

**Search & Replace Needed:**
- "trend" → "stock" (contextual)
- "interest" → "price" (contextual)
- "Google Trends" → "Stock Market"
- Update all form fields and validation

### Step 4: Update Server Initialization
In `server/index.ts`, replace trend sync with stock sync:

```typescript
// Old:
import { syncTrends } from './services/trendSync';
cron.schedule('0 * * * *', syncTrends); // Every hour

// New:
import { syncStockMarkets } from './services/stockSync';
cron.schedule('*/30 * * * *', syncStockMarkets); // Every 30 minutes
```

### Step 5: Test The Flow
1. Start backend: `npm run server`
2. Wait for stock sync to create markets
3. Check markets are created with stock symbols
4. Verify prices are in cents (17525 = $175.25)
5. Test betting through frontend
6. Test settlement with closing price

## 📋 Checklist

Backend:
- [x] Smart contract updated for stock prices
- [x] Stock API service created (Alpha Vantage)
- [x] Market types updated (stockSymbol, openingPrice, etc.)
- [x] Stock sync service created
- [x] Market service updated for prices
- [x] Blockchain sync updated
- [x] README updated
- [x] .env.example updated with API key
- [ ] Server index.ts updated (replace trend sync with stock sync)

Frontend (Still TODO):
- [ ] Update src/lib/marketApi.ts interface
- [ ] Update src/pages/Markets.tsx UI
- [ ] Update src/pages/MyBets.tsx display
- [ ] Update src/pages/Admin.tsx form
- [ ] Update src/components/MarketCard.tsx
- [ ] Update src/pages/HowItWorks.tsx
- [ ] Update src/config/contract.ts ABI
- [ ] Search/replace trend terminology

Deployment:
- [ ] Redeploy smart contract with new structure
- [ ] Update contract address in code
- [ ] Add Alpha Vantage API key to .env
- [ ] Test full flow end-to-end

## 🎯 Market Mechanics

### After-Hours Markets
- **When:** 4:00 PM - 9:30 AM ET
- **Stocks:** SPY, QQQ, AAPL, TSLA, NVDA (liquid only)
- **Timeframe:** Lock in 8h, settle in 16h
- **Movement:** Smaller price changes expected
- **Use Case:** Bet on overnight news, earnings, macro events

### Trading Hours Markets
- **When:** 9:30 AM - 4:00 PM ET
- **Stocks:** AAPL, TSLA, NVDA, MSFT, GOOGL, AMZN, META, AMD
- **Timeframe:** Lock in 2h, settle in 3h
- **Movement:** Larger intraday swings
- **Use Case:** Bet on real-time momentum, day trading style

## 💡 Tips

1. **API Rate Limits:** Alpha Vantage free tier = 25 calls/day. Sync creates 4 markets/cycle = 4 calls. Run sync every 30min = 48 calls/day. Consider spacing or caching.

2. **Price Precision:** Prices stored in cents (multiply by 100). Display as dollars (divide by 100).

3. **Market Selection:** After-hours focuses on liquid ETFs (SPY, QQQ) because individual stocks have thin liquidity overnight.

4. **Settlement:** You'll need to manually fetch closing prices and call settlement. Could automate with another cron job.

5. **Mock Data:** With `ALPHA_VANTAGE_API_KEY=demo`, the system uses realistic mock data for all stocks.

## 🔄 Alternative APIs

If you want more API calls:
- **Twelve Data:** 800 calls/day free - https://twelvedata.com/
- **Finnhub:** 60 calls/minute free - https://finnhub.io/
- **Yahoo Finance (unofficial):** Unlimited but unstable - via `yfinance` or scraping

To switch APIs, just modify `server/services/stockApi.ts`.
