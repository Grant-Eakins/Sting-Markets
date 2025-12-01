# 🚀 Quick Reference - TrendCoin Platform

## Start the App
```bash
npm run dev
```
Then open: http://localhost:5173

## Pages

### 1. Home (`/`)
- Hero with animated gradient background
- "View Trending Coins" → Smooth scroll to dashboard
- "How It Works" → Navigate to explanation
- Live trending dashboard (card/chart view toggle)
- Process explanation section

### 2. Trending Coins (`/trending-coins`)
- Full coin market view
- Search bar (filter by name/symbol)
- Filter dropdown (All/Live/Pending)
- Stats: Total Coins, Live Trading, Creating
- Trade on Uniswap + View on BaseScan

### 3. How It Works (`/how-it-works`)
- 3-step process flow
- Technical architecture (4 sections)
- User guide
- Back to coins CTA

## Key Features

### 📊 Data Display
- **Mock data** automatically loads (8 sample coins)
- **Auto-refresh** every 60 seconds
- **No backend required** for demo

### 🎨 View Modes
- **Card View**: Detailed coin info with actions
- **Chart View**: Visual growth trends with SVG charts

### 🔍 Search & Filter
- Search by coin name or symbol
- Filter: All Coins / Live Only / Pending

### 💼 Wallet Integration
- RainbowKit connect button (top right)
- Base chain configured
- Ready for real transactions

### 🔗 External Links
- **Trade Now** → Uniswap with token pre-filled
- **Token Address** → BaseScan explorer
- One-click access to DEXs

## Sample Coins Available

| Name | Symbol | Status | Growth |
|------|--------|--------|--------|
| AI Agents 2024 | AIAG | 🟢 Live | +245% |
| Base Chain DeFi | BCD | 🟢 Live | +189% |
| Web3 Gaming | W3G | 🟡 Pending | +167% |
| NFT Renaissance | NFTR | 🟢 Live | +203% |
| Crypto Regulations | CRYREG | 🟢 Live | +312% |
| Metaverse Updates | METAV | 🟡 Pending | +124% |
| Quantum Computing | QCOMP | 🟢 Live | +278% |
| Social Media Trends | SOCIAL | 🟢 Live | +345% |

## Interactive Elements

### Navigation
- Logo → Home
- Home / Trending Coins / How It Works menu
- Responsive on mobile

### Buttons
- **Connect Wallet** (top right) - RainbowKit modal
- **View Trending Coins** (hero) - Scroll to dashboard
- **How It Works** (hero) - Navigate to page
- **Refresh** - Reload trend data
- **Toggle View** - Switch card/chart
- **Search** - Real-time filter
- **Filter dropdown** - Status filter
- **Trade Now** - Open Uniswap
- **Token link** - Open BaseScan

### Charts (Chart View)
- 30-point line graph
- Gradient area fill
- Green = positive growth
- Red = negative growth
- Smooth SVG animation

## Tech Stack Reminder

- **React 18** + TypeScript
- **Vite** - Fast HMR
- **Tailwind CSS** - Styling
- **shadcn/ui** - Components
- **TanStack Query** - Data fetching
- **React Router** - Routing
- **RainbowKit** - Wallet
- **wagmi** - Base chain

## Customization

### Change Mock Data
Edit: `src/lib/api.ts` → `MOCK_TRENDS` array

### Add More Coins
Copy existing object in MOCK_TRENDS and modify

### Change Colors
Edit: Tailwind config or use CSS variables

### Modify Charts
Edit: `src/components/CoinChart.tsx`

## Troubleshooting

### No data showing?
- Check browser console
- Mock data should load automatically
- Try refreshing the page

### Navigation not working?
- Check React Router setup in App.tsx
- Verify page imports

### Wallet not connecting?
- Check `.env` for VITE_WALLETCONNECT_PROJECT_ID
- Get free ID from https://cloud.walletconnect.com/

### Charts not displaying?
- Clear browser cache
- Check SVG rendering in CoinChart.tsx

## Production Deployment

### Build for Production
```bash
npm run build
```

### Deploy Frontend
- **Vercel**: Connect GitHub repo
- **Netlify**: Deploy `dist/` folder
- **Any static host**: Upload `dist/`

### Environment Variables
```
VITE_API_URL=https://your-backend.com
VITE_WALLETCONNECT_PROJECT_ID=your_project_id
```

## What's Working vs What Needs Backend

### ✅ Working Now (No Backend)
- All pages and navigation
- Mock data display
- Search and filters
- Chart visualization
- Wallet connection UI
- External links (Uniswap, BaseScan)

### 🔌 Needs Backend for Real Data
- Live Google Trends fetching
- Actual token creation via Clanker
- Real-time updates from blockchain
- Token transaction history
- User portfolio tracking

---

**The platform is fully functional for demo/presentation purposes!** 🎉

To add real functionality, follow SETUP.md to configure the backend.
