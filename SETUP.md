# 🚀 Mindshare Token - Web3 Trend-to-Token Platform

A Web3 platform built on **Base Chain** that automatically converts **Google Trends** data into tradeable tokens using **Clanker**.

## 🌟 Features

- 📊 **Real-time Google Trends Integration** - Monitors trending topics from the past 7 days
- 🪙 **Automatic Token Creation** - Uses Clanker API to deploy tokens on Base chain
- 💼 **Base Chain Integration** - Full Web3 wallet connectivity via RainbowKit
- ⚡ **Live Dashboard** - Real-time updates of trends and token creation status
- 🔄 **Auto-Sync** - Hourly cron job to sync new trends and create tokens
- 🎨 **Modern UI** - Built with React, TypeScript, and Tailwind CSS

## 🛠️ Tech Stack

### Frontend
- **React 18** with TypeScript
- **Vite** - Fast build tool
- **Tailwind CSS** - Styling
- **shadcn/ui** - UI components
- **wagmi & viem** - Ethereum interactions
- **RainbowKit** - Wallet connection
- **TanStack Query** - Data fetching

### Backend
- **Express.js** - API server
- **TypeScript** - Type safety
- **Google Trends API** - Trend data
- **Clanker API** - Token deployment
- **node-cron** - Scheduled tasks
- **Axios** - HTTP client

## 📦 Installation

### Prerequisites
- Node.js 18+ and npm
- Git

### Setup Steps

```bash
# 1. Clone the repository
git clone <YOUR_GIT_URL>
cd "Mindshare Token"

# 2. Install dependencies
npm install --legacy-peer-deps

# 3. Set up environment variables
# Copy example files
copy .env.example .env
copy server\.env.example server\.env

# 4. Configure your environment variables (see Configuration section)

# 5. Start both frontend and backend
npm run start:all
```

## ⚙️ Configuration

### Frontend Environment (`.env`)

```env
VITE_API_URL=http://localhost:3001
VITE_WALLETCONNECT_PROJECT_ID=your_walletconnect_project_id_here
```

**Get your WalletConnect Project ID:** https://cloud.walletconnect.com/

### Backend Environment (`server/.env`)

```env
PORT=3001
CLANKER_API_URL=https://api.clanker.world/v1/deploy
CLANKER_API_KEY=your_clanker_api_key_here
BASE_RPC_URL=https://mainnet.base.org
```

**Important:** Replace placeholder API keys with your actual credentials.

## 🚀 Running the Application

### Development Mode (Recommended)

Run both frontend and backend simultaneously:

```bash
npm run start:all
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:3001

### Run Separately

**Frontend only:**
```bash
npm run dev
```

**Backend only:**
```bash
npm run server
```

## 📡 API Endpoints

### Trends

- `GET /api/trends` - Get all trends from past 7 days
- `GET /api/trends/:name` - Get specific trend by name
- `GET /api/trends/live/google` - Fetch live Google Trends data

### Clanker (Token Creation)

- `POST /api/clanker/create` - Manually create a token
- `POST /api/clanker/retry/:name` - Retry failed token creation
- `GET /api/clanker/symbol/:name` - Generate token symbol

## 🔧 How It Works

1. **Trend Monitoring** - Backend fetches Google Trends data every hour via cron job
2. **Trend Filtering** - Identifies trends that emerged in the past 7 days
3. **Token Creation** - Calls Clanker API to deploy ERC-20 tokens on Base chain
4. **Data Storage** - Stores trend and token data in memory (can be upgraded to database)
5. **Frontend Display** - React dashboard shows live trends with token status
6. **Wallet Integration** - Users can connect Base wallet and trade tokens on DEXs

## 🎯 Key Components

### Frontend
- `WalletConnect.tsx` - RainbowKit wallet connection
- `TrendsDashboard.tsx` - Main trends display with live data
- `TrendCard.tsx` - Individual trend card with token info
- `config/wagmi.ts` - Base chain Web3 configuration

### Backend
- `server/index.ts` - Express server with cron scheduler
- `services/googleTrends.ts` - Google Trends API integration
- `services/clanker.ts` - Clanker token deployment
- `services/trendSync.ts` - Automatic trend-to-token pipeline
- `services/database.ts` - In-memory data storage

## 🔐 Security Notes

- Never commit `.env` files with real API keys
- Use environment variables for all sensitive data
- Consider using a proper database (PostgreSQL/MongoDB) for production
- Implement rate limiting on API endpoints
- Add authentication for admin endpoints

## 🚢 Deployment

### Frontend (Vercel/Netlify)
```bash
npm run build
# Deploy the dist/ folder
```

### Backend (Railway/Render/Heroku)
- Set environment variables in hosting platform
- Deploy from the repository root
- Start command: `npm run server:dev`

## 📝 Future Enhancements

- [ ] Add PostgreSQL database
- [ ] Implement user authentication
- [ ] Add token analytics and charts
- [ ] Create admin dashboard
- [ ] Add webhook notifications
- [ ] Implement token liquidity management
- [ ] Add social sharing features
- [ ] Create mobile app

## 🤝 Contributing

Pull requests are welcome! For major changes, please open an issue first.

## 📄 License

MIT

## 🔗 Links

- [Base Chain Docs](https://docs.base.org/)
- [Clanker](https://www.clanker.world/)
- [RainbowKit Docs](https://www.rainbowkit.com/)
- [Google Trends API](https://www.npmjs.com/package/google-trends-api)

## 💬 Support

For issues or questions, please open a GitHub issue.

---

**Built with ❤️ for the Base ecosystem**
