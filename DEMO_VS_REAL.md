# 🔴 Important: Demo vs Real Data

## Current Status: DEMO MODE

The tokens you're seeing are **SAMPLE/FAKE tokens** for demonstration purposes only.

### What You're Seeing Now:
- ❌ NOT real blockchain tokens
- ❌ NOT from actual Google Trends
- ❌ NOT tradeable on DEXs
- ✅ Sample data for UI/UX demonstration
- ✅ Shows how the platform will work

### How to Tell It's Demo Data:
- Token addresses start with `0xDEMO...`
- Transaction hashes contain "DEMO"
- Yellow banner at top: "Demo Mode"
- "Demo" badge on cards

## How to Get REAL Data

### Step 1: Start the Backend Server

```bash
npm run server
```

This starts the Express server that connects to Google Trends API.

### Step 2: Configure API Keys

Edit `server/.env`:

```env
# Required for token creation
CLANKER_API_KEY=your_actual_clanker_api_key

# Optional: For better trends data
GOOGLE_API_KEY=your_google_api_key
```

### Step 3: Backend Will Automatically:
1. ✅ Fetch real trending topics from Google Trends
2. ✅ Filter for trends from past 7 days
3. ✅ Create real ERC-20 tokens on Base chain via Clanker
4. ✅ Store token addresses and transaction hashes
5. ✅ Update frontend with live data

### Step 4: Frontend Will Show:
- ✅ Real trending topics (from Google)
- ✅ Actual Base chain token addresses
- ✅ Real transaction hashes (viewable on BaseScan)
- ✅ Tradeable tokens on Uniswap
- ✅ Live market data

## Why Mock Data?

Mock data allows you to:
- 👀 See the full UI/UX without backend setup
- 🚀 Demo the platform quickly
- 🎨 Test responsive design
- 📱 Show clients/investors the concept
- 🔧 Develop frontend features independently

## Getting API Keys

### Clanker API Key (Required for Token Creation)
1. Visit: https://www.clanker.world/
2. Join Farcaster community
3. Request API access
4. Add key to `server/.env`

**OR use direct contract deployment** (see `docs/CLANKER.md`)

### Google Trends API (Optional)
The `google-trends-api` package we use is unofficial and works without a key, but has rate limits.

For better reliability:
1. Get Google Cloud API key
2. Enable Trends API
3. Add to `server/.env`

## Testing Without Real Keys

You can test the backend connection without real API keys:

1. Start server: `npm run server`
2. Backend will use Google Trends (unofficial API)
3. Token creation will fail (no Clanker key)
4. But you'll see real trending topics!

To simulate token creation, see `server/services/clanker.ts` and enable test mode.

## When Backend is Running

The frontend automatically detects if backend is available:

```typescript
// In src/lib/api.ts
try {
  // Try to fetch from backend
  const response = await fetch(`${API_BASE_URL}/api/trends`);
  return data.trends; // Real data ✅
} catch (error) {
  // Fallback to mock data
  return MOCK_TRENDS; // Demo data ⚠️
}
```

## Verification Checklist

### Is My Data Real?

Check these:

1. **No "Demo Mode" banner** - Real data won't show warning
2. **Token addresses** - Real ones won't start with `0xDEMO`
3. **No "Demo" badge** - Won't appear on real tokens
4. **BaseScan works** - Real addresses link to actual contracts
5. **Uniswap works** - Can actually swap real tokens
6. **Different data** - Not the same 8 coins every time
7. **Server running** - Backend console shows "✅ Token created"

### Backend Console Output (Real Data):
```
🚀 Server running on port 3001
📊 Fetching Google Trends data...
Found 15 trending topics
🔍 Filtering for trends from past 7 days...
Identified 8 recent trends

🎯 Processing trend: Actual Trending Topic
📝 Generated symbol: ATT
🪙 Creating token for "Actual Trending Topic"...
✅ Token created successfully!
   Address: 0x1234567890abcdef... (real address)
   TX Hash: 0xabcdef... (real hash)
💾 Trend and token data saved to database
```

## Production Deployment

For production, you MUST:
- ✅ Configure real API keys
- ✅ Use proper database (PostgreSQL/MongoDB)
- ✅ Add rate limiting
- ✅ Implement authentication
- ✅ Remove mock data fallback
- ✅ Add monitoring/alerts

## Quick Commands

```bash
# Frontend only (demo data)
npm run dev

# Backend only (real trends)
npm run server

# Both together (real data)
npm run start:all
```

## Need Help?

- Check `SETUP.md` for detailed setup
- Check `QUICKSTART.md` for quick start
- Check `docs/CLANKER.md` for Clanker integration
- Check server console logs for errors
- Open GitHub issue with error details

---

**Remember: Demo data is for demonstration only. Start the backend for real functionality!** 🚀
