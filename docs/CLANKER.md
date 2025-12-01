# 🪙 Clanker Integration Guide

## What is Clanker?

Clanker is a Farcaster frame that allows you to deploy ERC-20 tokens on Base chain directly through Farcaster. It simplifies token creation without needing to write or deploy smart contracts yourself.

**Website:** https://www.clanker.world/

## How This Integration Works

Our platform automatically:
1. Monitors Google Trends for viral topics
2. Generates appropriate token names and symbols
3. Calls Clanker API to deploy tokens on Base
4. Tracks token addresses and transaction hashes
5. Displays tokens in the dashboard for trading

## API Integration

### Endpoint Structure

```typescript
POST https://api.clanker.world/v1/deploy
Headers:
  Authorization: Bearer YOUR_API_KEY
  Content-Type: application/json

Body:
{
  "name": "AI Agents 2024",
  "symbol": "AIAG",
  "description": "Token for trending topic: AI Agents 2024",
  "image": "https://example.com/image.png",
  "network": "base"
}
```

### Response

```json
{
  "success": true,
  "tokenAddress": "0x1234567890abcdef1234567890abcdef12345678",
  "transactionHash": "0xabcdef...",
  "deployer": "0x...",
  "network": "base"
}
```

## Getting API Access

### Method 1: Official Clanker API (Recommended)

1. **Join Farcaster** - Clanker is integrated with Farcaster
2. **Visit Clanker** - Go to https://www.clanker.world/
3. **Request Access** - Contact the Clanker team via their Farcaster channel
4. **Get API Key** - Once approved, you'll receive API credentials
5. **Add to Environment** - Update `server/.env` with your key

### Method 2: Use Clanker Frame Directly

If API access is not available yet, you can:
1. Use Clanker's Farcaster frame manually
2. Integrate with their frame API
3. Monitor frame responses for token addresses

### Method 3: Direct Smart Contract Deployment (Fallback)

Our code includes a fallback option to deploy tokens directly using Ethereum contracts:

```typescript
// In server/services/clanker.ts
export async function deployTokenDirectly(
  tokenData: TokenCreationRequest
): Promise<TokenCreationResponse> {
  // Deploy ERC-20 contract directly to Base
  // Requires: private key, contract bytecode, and gas
}
```

This requires:
- Base chain RPC connection
- Private key for deployment wallet
- ETH for gas fees
- ERC-20 contract bytecode

## Token Creation Flow

```
Google Trend Detected
        ↓
Generate Token Name & Symbol
        ↓
Check if Token Already Exists
        ↓
Call Clanker API
        ↓
Receive Token Address
        ↓
Save to Database
        ↓
Display in Dashboard
```

## Symbol Generation

Tokens are automatically assigned symbols based on trend names:

```typescript
// Examples:
"AI Agents 2024" → "AIAG"
"Base Chain DeFi" → "BCD"
"Web3 Gaming" → "W3G"
"Cryptocurrency Market" → "CRYPTO"
```

Algorithm:
1. Remove special characters
2. Take first letter of each word
3. Maximum 6 characters
4. Uppercase

## Token Standards

All tokens created are:
- **Standard:** ERC-20
- **Network:** Base (Chain ID: 8453)
- **Decimals:** 18 (standard)
- **Initial Supply:** Determined by Clanker
- **Liquidity:** Added via Clanker's DEX integration

## Testing Without Clanker API

For development/testing without real Clanker API:

### Option 1: Use Mock Data

The backend will continue to work with mock data stored in memory.

### Option 2: Deploy to Base Sepolia Testnet

```env
# In server/.env
BASE_RPC_URL=https://sepolia.base.org
NETWORK=base-sepolia
```

Then use test ETH from Base Sepolia faucet.

### Option 3: Simulate Token Creation

Modify `server/services/clanker.ts`:

```typescript
export async function createTokenWithClanker(
  tokenData: TokenCreationRequest
): Promise<TokenCreationResponse> {
  // For testing: return fake success
  return {
    success: true,
    tokenAddress: `0x${Math.random().toString(16).substr(2, 40)}`,
    transactionHash: `0x${Math.random().toString(16).substr(2, 64)}`,
    message: 'Token created successfully (TEST MODE)',
  };
}
```

## Monitoring Token Creation

### Check Logs

```bash
npm run server
# Watch for:
# "🪙 Creating token for..."
# "✅ Token created successfully!"
# "Token Address: 0x..."
```

### API Endpoints

```bash
# Get all created tokens
curl http://localhost:3001/api/trends

# Get specific token
curl http://localhost:3001/api/trends/AI%20Agents%202024

# Manually create token
curl -X POST http://localhost:3001/api/clanker/create \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Trend", "symbol": "TEST"}'
```

## Troubleshooting

### "CLANKER_API_KEY is not configured"

Add your API key to `server/.env`:
```env
CLANKER_API_KEY=your_actual_key_here
```

### "Failed to create token"

Possible causes:
- Invalid API key
- Rate limit exceeded
- Network connectivity issues
- Clanker service downtime

Solution: Check logs and retry with `POST /api/clanker/retry/:name`

### Token Already Exists

The system prevents duplicate token creation. If you need to create again:
1. Clear the in-memory database (restart server)
2. Or deploy a database and modify the logic

## Advanced Configuration

### Custom Token Parameters

Modify token creation in `server/services/trendSync.ts`:

```typescript
const tokenResult = await createTokenWithClanker({
  name: trendName,
  symbol,
  description: `Custom description`,
  imageUrl: customImageUrl,
  initialSupply: '1000000', // Add custom supply
  decimals: 18, // Standard decimals
});
```

### Auto-Liquidity Addition

If using Clanker's liquidity features:

```typescript
// Add liquidity parameters
const tokenResult = await createTokenWithClanker({
  ...tokenData,
  addLiquidity: true,
  liquidityETH: '1.0', // ETH amount
});
```

## Security Best Practices

1. **Never expose API keys** - Keep in `.env` files only
2. **Rate limiting** - Implement on your API endpoints
3. **Validate inputs** - Sanitize trend names before token creation
4. **Monitor costs** - Track gas fees and token deployments
5. **Backup data** - Save token addresses to persistent database

## Production Checklist

- [ ] Real Clanker API key configured
- [ ] Base mainnet RPC configured
- [ ] Database for persistent storage
- [ ] Rate limiting implemented
- [ ] Error monitoring (Sentry, etc.)
- [ ] Backup mechanism for token data
- [ ] Admin dashboard for manual control

## Resources

- [Clanker Website](https://www.clanker.world/)
- [Base Chain Docs](https://docs.base.org/)
- [ERC-20 Standard](https://eips.ethereum.org/EIPS/eip-20)
- [Farcaster Protocol](https://docs.farcaster.xyz/)

## Support

For Clanker-specific issues:
- Check Clanker's Farcaster channel
- Review their documentation
- Contact their support team

For integration issues:
- Check this guide
- Review `server/services/clanker.ts`
- Open a GitHub issue
