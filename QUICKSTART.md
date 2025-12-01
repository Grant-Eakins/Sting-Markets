# 🚀 Quick Start Guide

## Prerequisites Checklist

Before starting, make sure you have:
- ✅ Node.js 18+ installed
- ✅ npm installed
- ✅ Git installed
- ✅ A WalletConnect Project ID ([Get one here](https://cloud.walletconnect.com/))
- ✅ Clanker API credentials (Contact Clanker team)

## Step-by-Step Setup

### 1. Install Dependencies

```bash
npm install --legacy-peer-deps
```

### 2. Configure Environment Variables

#### Frontend Configuration

Create/Edit `.env` file in the root directory:

```env
VITE_API_URL=http://localhost:3001
VITE_WALLETCONNECT_PROJECT_ID=YOUR_WALLETCONNECT_PROJECT_ID
```

#### Backend Configuration

Create/Edit `server/.env` file:

```env
PORT=3001
CLANKER_API_URL=https://api.clanker.world/v1/deploy
CLANKER_API_KEY=YOUR_CLANKER_API_KEY
BASE_RPC_URL=https://mainnet.base.org
```

### 3. Start the Application

#### Option A: Run Both (Frontend + Backend)

```bash
npm run start:all
```

#### Option B: Run Separately

Terminal 1 (Frontend):
```bash
npm run dev
```

Terminal 2 (Backend):
```bash
npm run server
```

### 4. Access the Application

- **Frontend:** http://localhost:5173
- **Backend API:** http://localhost:3001
- **Health Check:** http://localhost:3001/health

## 🧪 Testing the Setup

### Test Backend API

```bash
# Check server health
curl http://localhost:3001/health

# Get trends (will be empty initially until cron runs)
curl http://localhost:3001/api/trends

# Fetch live Google Trends
curl http://localhost:3001/api/trends/live/google
```

### Test Frontend

1. Open http://localhost:5173 in your browser
2. Click "Connect Wallet" button
3. Connect your Base-compatible wallet (MetaMask, Coinbase Wallet, etc.)
4. View the trends dashboard

## 🎯 How to Get API Keys

### WalletConnect Project ID

1. Go to https://cloud.walletconnect.com/
2. Sign up or log in
3. Create a new project
4. Copy the Project ID
5. Paste it in `.env` as `VITE_WALLETCONNECT_PROJECT_ID`

### Clanker API Key

Clanker is a Farcaster frame for deploying tokens. To get access:

1. Visit https://www.clanker.world/
2. Join their Farcaster channel
3. Request API access from the team
4. Once approved, add the key to `server/.env`

**Alternative:** For testing, you can use the direct contract deployment method (see SETUP.md)

## 🔧 Troubleshooting

### Port Already in Use

If port 3001 or 5173 is already in use:

```bash
# Change backend port in server/.env
PORT=3002

# Update frontend .env accordingly
VITE_API_URL=http://localhost:3002
```

### Wallet Connection Issues

- Make sure you're on Base or Base Sepolia network
- Check that your WalletConnect Project ID is correct
- Try clearing browser cache and reconnecting

### Google Trends API Errors

The Google Trends API is unofficial and may have rate limits:
- Wait a few minutes between requests
- Use a VPN if blocked
- Consider implementing caching

### CORS Issues

If you see CORS errors, make sure:
- Backend is running on port 3001
- Frontend `.env` has correct `VITE_API_URL`
- CORS is enabled in `server/index.ts` (already configured)

## 📚 Next Steps

1. **Get Real API Keys** - Replace placeholder keys with real credentials
2. **Test Token Creation** - Try creating a token manually via API
3. **Monitor Cron Job** - Check console logs for hourly trend syncs
4. **Deploy to Production** - See SETUP.md for deployment instructions

## 🆘 Need Help?

- Check the detailed SETUP.md file
- Review server console logs for errors
- Open a GitHub issue with error details

## 🎉 You're Ready!

Once everything is running:
- Trends will auto-sync every hour
- New trends will automatically create tokens via Clanker
- Users can connect wallets and trade on Base chain

**Happy Building! 🚀**
