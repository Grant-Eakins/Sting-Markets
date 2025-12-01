# StockBet - Prediction Markets for Stock Prices

Bet on whether stock prices will go UP or DOWN. Win based on real market movement.

## 🎯 What is StockBet?

StockBet is a decentralized prediction market platform where users can:
- Bet on stock price movements (UP/DOWN positions)
- Win payouts based on actual closing prices
- Trade on Base blockchain with ETH
- Different market types: After-Hours (small moves) & Trading Hours (big swings)
- Track positions and claim winnings

## 🚀 Features

- **Two Market Types**: 
  - **After-Hours** (4PM-9:30AM ET): Bet on small overnight moves, longer timeframes (8-16h)
  - **Trading Hours** (9:30AM-4PM ET): Bet on intraday swings, shorter timeframes (2-3h)
- **Simple Betting**: Bet UP if price will increase, DOWN if it decreases
- **Fair Odds**: Dynamic odds based on pool distribution
- **Popular Stocks**: AAPL, TSLA, NVDA, MSFT, GOOGL, AMZN, META, SPY, QQQ, AMD
- **Real Stock Data**: Alpha Vantage API integration for live prices
- **Web3 Native**: Built on Base chain with RainbowKit wallet integration

## 🛠️ Tech Stack

### Frontend
- React 18 + TypeScript + Vite
- shadcn/ui components
- Tailwind CSS
- RainbowKit + wagmi for Web3
- TanStack Query for data fetching

### Backend
- Express.js + TypeScript
- Alpha Vantage API for stock data (free tier: 25 calls/day)
- node-cron for automated market creation/settlement
- In-memory database (Map-based)

### Blockchain
- Base chain (mainnet: 8453, sepolia: 84532)
- Smart contract integration ready

## 📦 Installation

```sh
# Install dependencies
npm install

# Start backend server
npm run server

# Start frontend (in another terminal)
npm run dev
```

## 🔧 Configuration

Create a `.env` file (see `.env.example`):

```env
# Frontend
VITE_API_URL=http://localhost:3001
VITE_WALLETCONNECT_PROJECT_ID=your_project_id
VITE_BASE_CHAIN_ID=84532

# Backend
PORT=3001
ALPHA_VANTAGE_API_KEY=your_api_key  # Get free at https://www.alphavantage.co/support/#api-key

# Blockchain (optional)
DEPLOYER_PRIVATE_KEY=your_private_key
```

**Getting an Alpha Vantage API Key:**
1. Visit https://www.alphavantage.co/support/#api-key
2. Enter your email
3. Free tier gives you 25 API calls per day (sufficient for testing)
4. Or use `ALPHA_VANTAGE_API_KEY=demo` to use mock data

## 📖 How It Works

### Trading Hours Markets (9:30AM-4PM ET)
1. **Market Creation**: Popular stocks get markets with current price as opening
2. **Place Bets**: Users bet UP or DOWN on bigger price swings
3. **Lock Period**: Betting locks after **2 hours**
4. **Settlement**: Markets settle after **3 hours** based on closing price
5. **Claim Winnings**: Winners claim payouts based on final price

### After-Hours Markets (4PM-9:30AM ET)
1. **Market Creation**: Focus on liquid stocks/ETFs (SPY, QQQ, AAPL, etc.)
2. **Place Bets**: Bet on overnight/pre-market price movement
3. **Lock Period**: Betting locks after **8 hours**
4. **Settlement**: Markets settle after **16 hours** at next open
5. **Claim Winnings**: Winners claim based on how price moved overnight

## 🎮 Usage

1. Connect your wallet (MetaMask, Coinbase Wallet, etc.)
2. Browse active markets on the homepage
3. Click UP or DOWN to place a bet
4. View your positions in "My Bets"
5. Claim winnings after markets settle

## 🚧 Demo Mode

Currently running with mock data. For production:
- Deploy smart contracts on Base
- Integrate with real on-chain betting pools
- Add persistent database (PostgreSQL/MongoDB)
- Implement proper authentication

## 📁 Project Structure

```
├── server/
│   ├── services/
│   │   ├── marketService.ts       # Market creation, betting, settlement
│   │   ├── marketSettlement.ts    # Automated settlement logic
│   │   ├── stockApi.ts            # Alpha Vantage API integration
│   │   ├── stockSync.ts           # Automated stock market creation
│   │   └── blockchainSync.ts      # On-chain market management
│   ├── routes/
│   │   ├── markets.ts             # Market API endpoints
│   │   └── trends.ts              # Trends data endpoints
│   └── types/
│       └── market.ts              # TypeScript interfaces
├── src/
│   ├── pages/
│   │   ├── Markets.tsx            # Main markets page
│   │   ├── MyBets.tsx             # User positions dashboard
│   │   └── HowItWorks.tsx         # Information page
│   ├── components/
│   │   ├── MarketCard.tsx         # Market display with betting
│   │   └── BetDialog.tsx          # Betting interface
│   └── lib/
│       └── marketApi.ts           # API client
└── README.md
```

## 📄 License

MIT
