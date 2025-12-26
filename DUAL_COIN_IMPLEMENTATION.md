# Dual-Coin Head-to-Head Market Implementation

## Completed ✅
- Type definitions (Market, CreateMarketRequest)
- Database schema updates (saveMarket, dbMarketToMarket)
- `/api/markets/create-dual-coin` endpoint
- Blockchain support for 2-bucket markets

## Remaining Implementation

### 1. Settlement Logic (HIGH PRIORITY)
File: `server/services/marketSettlement.ts`

Add function before `settleMarketWithData`:
```typescript
async function settleDualCoinMarket(market: Market): Promise<any> {
  if (!market.isDualCoin || !market.coinAAddress || !market.coinBAddress) {
    throw new Error('Not a dual-coin market');
  }
  
  // Fetch closing prices
  const [tokenA, tokenB] = await Promise.all([
    getTokenByAddress(market.coinAAddress),
    getTokenByAddress(market.coinBAddress)
  ]);
  
  const coinAClosing = tokenA.price < 0.01 ? Math.round(tokenA.price * 100_000_000) : Math.round(tokenA.price * 100);
  const coinBClosing = tokenB.price < 0.01 ? Math.round(tokenB.price * 100_000_000) : Math.round(tokenB.price * 100);
  
  // Calculate percentage changes
  const coinAChange = ((coinAClosing - market.coinAOpeningPrice!) / market.coinAOpeningPrice!) * 100;
  const coinBChange = ((coinBClosing - market.coinBOpeningPrice!) / market.coinBOpeningPrice!) * 100;
  
  // Determine winner
  const winningPosition = coinAChange > coinBChange ? Position.UP : 
                         coinBChange > coinAChange ? Position.DOWN : 
                         null; // Tie = refund
  
  if (winningPosition === null) {
    console.log('🔄 Market ended in a TIE - will process refunds');
    // Handle refund logic
    return null;
  }
  
  // Update market with results
  market.coinAClosingPrice = coinAClosing;
  market.coinBClosingPrice = coinBClosing;
  market.coinAChangePercent = coinAChange;
  market.coinBChangePercent = coinBChange;
  market.winningPosition = winningPosition;
  market.status = MarketStatus.SETTLED;
  
  // Settle on blockchain (bucket 0 = Coin A, bucket 1 = Coin B)
  const winningBucket = winningPosition === Position.UP ? 0 : 1;
  if (market.blockchainMarketId !== undefined) {
    await settleOnChainMarket(market.blockchainMarketId, winningBucket);
  }
  
  await saveMarket(market);
  
  return {
    coinASymbol: market.coinASymbol,
    coinBSymbol: market.coinBSymbol,
    coinAChange,
    coinBChange,
    winner: winningPosition === Position.UP ? market.coinASymbol : market.coinBSymbol,
  };
}
```

Update `checkAndSettleMarkets` to detect dual-coin markets:
```typescript
for (const market of marketsToSettle) {
  if (market.isDualCoin) {
    const result = await settleDualCoinMarket(market);
    if (result) settledMarkets.push(result);
  } else {
    const result = await settleMarketWithData(market.id, market.stockSymbol, market.openingPrice);
    if (result) settledMarkets.push(result);
  }
}
```

### 2. Price Update Service
File: `server/services/marketSettlement.ts`

Update `updateActiveMarketPrices` to handle dual-coin:
```typescript
// Inside the loop, after regular price update:
if (market.isDualCoin && market.coinAAddress && market.coinBAddress) {
  const [tokenA, tokenB] = await Promise.all([
    getTokenByAddress(market.coinAAddress),
    getTokenByAddress(market.coinBAddress)
  ]);
  
  market.coinACurrentPrice = tokenA.price < 0.01 ? Math.round(tokenA.price * 100_000_000) : Math.round(tokenA.price * 100);
  market.coinBCurrentPrice = tokenB.price < 0.01 ? Math.round(tokenB.price * 100_000_000) : Math.round(tokenB.price * 100);
  
  await saveMarket(market);
}
```

### 3. Admin UI Component
File: `src/pages/Admin.tsx`

Add after the existing "Create Meme Coin Market" card:
```typescript
{/* Dual-Coin Market Card */}
<Card className="border-blue-500/50">
  <CardHeader>
    <CardTitle className="flex items-center gap-2">
      ⚔️ Create Head-to-Head Market
    </CardTitle>
    <CardDescription>
      Create a dual-coin comparison market
    </CardDescription>
  </CardHeader>
  <CardContent>
    <form onSubmit={handleDualCoinCreate} className="space-y-4">
      <div>
        <Label>Coin A Contract Address</Label>
        <Input
          value={dualCoinData.contractAddressA}
          onChange={(e) => setDualCoinData({...dualCoinData, contractAddressA: e.target.value})}
          placeholder="0x..."
        />
      </div>
      <div>
        <Label>Coin B Contract Address</Label>
        <Input
          value={dualCoinData.contractAddressB}
          onChange={(e) => setDualCoinData({...dualCoinData, contractAddressB: e.target.value})}
          placeholder="0x..."
        />
      </div>
      <Button type="submit" className="w-full">
        Create Head-to-Head Market
      </Button>
    </form>
  </CardContent>
</Card>
```

Add state and handler:
```typescript
const [dualCoinData, setDualCoinData] = useState({
  contractAddressA: '',
  contractAddressB: '',
});

const createDualCoin = useMutation({
  mutationFn: async (data: typeof dualCoinData) => {
    const response = await axios.post(`${API_BASE}/markets/create-dual-coin`, data);
    return response.data;
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['admin-markets'] });
    setDualCoinData({ contractAddressA: '', contractAddressB: '' });
    alert('✅ Dual-coin market created!');
  },
});

const handleDualCoinCreate = (e: React.FormEvent) => {
  e.preventDefault();
  createDualCoin.mutate(dualCoinData);
};
```

### 4. Frontend Market Display
File: `src/components/MarketCard.tsx`

Add at the top of the component:
```typescript
if (market.isDualCoin) {
  return <DualCoinMarketCard market={market} onBetPlaced={onBetPlaced} />;
}
```

### 5. New Component: DualCoinMarketCard
File: `src/components/DualCoinMarketCard.tsx`

```typescript
// Simplified dual-coin display
export function DualCoinMarketCard({ market, onBetPlaced }: { market: Market, onBetPlaced?: () => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-center gap-4">
          <div className="flex items-center gap-2">
            {market.coinAImageUrl && <img src={market.coinAImageUrl} className="w-8 h-8 rounded-full" />}
            <span>{market.coinASymbol}</span>
          </div>
          <span className="text-2xl">⚔️</span>
          <div className="flex items-center gap-2">
            <span>{market.coinBSymbol}</span>
            {market.coinBImageUrl && <img src={market.coinBImageUrl} className="w-8 h-8 rounded-full" />}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Side-by-side price display */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="text-center">
            <div className="text-sm text-muted-foreground">{market.coinASymbol}</div>
            <div className="text-lg font-bold">${formatPrice(market.coinACurrentPrice || market.coinAOpeningPrice!)}</div>
          </div>
          <div className="text-center">
            <div className="text-sm text-muted-foreground">{market.coinBSymbol}</div>
            <div className="text-lg font-bold">${formatPrice(market.coinBCurrentPrice || market.coinBOpeningPrice!)}</div>
          </div>
        </div>
        
        {/* Betting buttons */}
        <div className="grid grid-cols-2 gap-3">
          <Button onClick={() => placeBet(0)} className="bg-green-500">
            Bet on {market.coinASymbol}
          </Button>
          <Button onClick={() => placeBet(1)} className="bg-red-500">
            Bet on {market.coinBSymbol}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

## Quick Deploy Commands
```bash
# 1. Run SQL in Supabase (already provided above)
# 2. Commit and push
git add -A
git commit -m "Complete dual-coin head-to-head market implementation"
git push
```

## Testing
1. Go to Admin page
2. Enter two Base token contract addresses
3. Create dual-coin market
4. Market shows on main page with "vs" display
5. Users can bet on Coin A or Coin B
6. Settlement compares % changes and declares winner
