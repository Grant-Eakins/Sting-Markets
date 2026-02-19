# AgentToll Integration - stingmarkets.com

## Overview

StingMarkets.com uses the AgentToll SDK (`@agenttoll/sdk`) to monetize API access for AI agents while keeping the site free for human users.

## Test Results

| Test | Result | Details |
|------|--------|---------|
| Site accessible | ✅ 200 OK | https://www.stingmarkets.com |
| API (human) | ✅ 200 OK | Browser/curl requests pass through |
| API (agent) | ✅ 402 Payment Required | Agent requests are toll-gated |
| x402 headers | ✅ Present | All standard headers included |

## Protected Routes

| Route | Price | Description |
|-------|-------|-------------|
| `/api/markets/*` | $0.001 USDC | Market data and betting endpoints |
| `/api/auction/*` | $0.001 USDC | Auction status and bidding endpoints |

## Configuration

### Environment Variables

```env
AGENTTOLL_KEY=pk_live_6a68156b123d4306b0f0a0785d019dc5
AGENTTOLL_SECRET=sk_live_634aa82f3b374ba8bdb64a7718ed7aa1
```

### Server Integration (server/index.ts)

```typescript
import tollbooth from '@agenttoll/sdk';

// AgentToll - Monetize API for AI agents
// Free for humans (browser requests), agents pay $0.001 per request in USDC
app.use('/api/markets', tollbooth(process.env.AGENTTOLL_KEY!, {
  amount: 0.001,
  freeForHumans: true
}));

app.use('/api/auction', tollbooth(process.env.AGENTTOLL_KEY!, {
  amount: 0.001,
  freeForHumans: true
}));
```

## How Agent Detection Works

The SDK identifies AI agents by checking:

1. **User-Agent patterns** - `claude`, `anthropic`, `openai`, `gpt-4`, `langchain`, `autogpt`, etc.
2. **Custom headers** - `x-agent-type`, `x-agenttoll-id`
3. **x402 capability** - `x-402-capable: true` header

## 402 Response Format

When an agent request is blocked, the response includes:

### HTTP Headers
```
X-402-Version: 1
X-402-Amount: 0.001
X-402-Currency: USDC
X-402-Network: solana
X-402-Pay-URL: https://toll.agenttoll.io/pay?publisher=...
X-402-Onboarding: true
X-402-Setup-URL: https://toll.agenttoll.io/docs#agent-setup
```

### JSON Body
```json
{
  "status": 402,
  "message": "Payment Required",
  "agent_instructions": "To access this resource, pay 0.001 USDC via the payment URL below. After payment, retry with the returned token in Authorization header.",
  "payment": {
    "amount": 0.001,
    "currency": "USDC",
    "network": "solana",
    "pay_url": "https://toll.agenttoll.io/pay?publisher=pk_live_xxx&amount=0.001&resource=...",
    "api_endpoint": "https://toll.agenttoll.io/api/pay"
  },
  "x402": {
    "version": 1,
    "amount": 0.001,
    "currency": "USDC",
    "receiver": "pending",
    "network": "solana-mainnet",
    "description": "Access to /"
  },
  "retry": {
    "method": "GET",
    "url": "https://www.stingmarkets.com/api/markets",
    "headers": {
      "Authorization": "Bearer <token_from_payment>"
    }
  },
  "x402_onboarding": {
    "message": "Your agent doesn't appear to have x402 payment capability configured...",
    "setup_steps": [...],
    "tool_schema": {...},
    "documentation": "https://toll.agenttoll.io/docs#agent-setup"
  }
}
```

## Testing Commands

### Test as Human (should return 200)
```powershell
Invoke-WebRequest -Uri "https://www.stingmarkets.com/api/markets" -Method GET
```

### Test as Agent (should return 402)
```powershell
Invoke-WebRequest -Uri "https://www.stingmarkets.com/api/markets" -Method GET -Headers @{"User-Agent"="claude-ai-agent/1.0"}
```

### Test with x402 Capable Header
```powershell
Invoke-WebRequest -Uri "https://www.stingmarkets.com/api/markets" -Method GET -Headers @{"x-402-capable"="true"}
```

## Agent Payment Flow

1. Agent makes request to `/api/markets`
2. Tollbooth detects agent via User-Agent or headers
3. Returns 402 with payment info and `pay_url`
4. Agent calls `pay_url` with USDC payment on Solana
5. Agent receives payment token
6. Agent retries original request with `Authorization: Bearer <token>`
7. Request succeeds with 200 OK

## Dashboard

View earnings and payment history at: https://toll.agenttoll.io/dashboard

## Support

- Documentation: https://toll.agenttoll.io/docs
- Email: support@agenttoll.io
