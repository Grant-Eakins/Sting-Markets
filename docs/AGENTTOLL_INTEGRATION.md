# AgentToll Integration - stingmarkets.com

## Overview

StingMarkets.com uses the AgentToll SDK v1.3.1 (`@agenttoll/sdk`) to monetize API access for AI agents while keeping the site free for human users. Payments are supported on both **Solana** and **Base** networks. v1.3.1 adds Content Gate protection for HTML pages against agentic crawlers, auto-generated robots.txt with x402 payment signals, and Browser Gate for detecting headless browsers.

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
| `/api/markets/*` | $0.05 USDC | Market data and betting endpoints |
| `/api/auction/*` | $0.05 USDC | Auction status and bidding endpoints |
| HTML pages | $0.05 USDC | Content Gate blocks agentic crawlers |
| `/robots.txt` | — | Auto-generated with x402 payment signals |

## Configuration

### Environment Variables

```env
AGENTTOLL_KEY=pk_live_6a68156b123d4306b0f0a0785d019dc5
AGENTTOLL_SECRET=sk_live_634aa82f3b374ba8bdb64a7718ed7aa1
```

### Server Integration (server/index.ts)

```typescript
import tollbooth from '@agenttoll/sdk';
import { contentGate, generateRobotsTxt } from '@agenttoll/sdk/content-gate';

// AgentToll - Monetize API for AI agents (SDK v1.3.1)
// Free for humans (browser requests), agents pay $0.05 per request in USDC
// Supports payments on both Solana and Base networks
app.use('/api/markets', tollbooth.agentsOnly(process.env.AGENTTOLL_KEY!, {
  amount: 0.05,
}));

app.use('/api/auction', tollbooth.agentsOnly(process.env.AGENTTOLL_KEY!, {
  amount: 0.05,
}));

// Content Gate - Protect HTML pages from agentic crawlers (Perplexity, SearchGPT, etc.)
app.use(contentGate(process.env.AGENTTOLL_KEY!, { amount: 0.05 }));

// Auto-generate robots.txt with x402 payment signals for AI crawlers
app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(generateRobotsTxt({ publisherKey: process.env.AGENTTOLL_KEY! }));
});
```

### Convenience Methods (SDK v1.3.1)

```typescript
// Check if a request has a valid toll payment
tollbooth.hasPaid(req)   // boolean

// Check if a request is from an AI agent
tollbooth.isAgent(req)   // boolean

// Protect a single route inline
app.get('/premium', tollbooth.protect('pk_xxx', { amount: 0.05 }), handler)
```

## How Agent Detection Works

The SDK identifies AI agents by checking:

1. **User-Agent patterns** - `claude`, `anthropic`, `openai`, `gpt-4`, `chatgpt`, `gemini`, `google-ai`, `langchain`, `autogpt`, `agentgpt`, `babyagi`, `crewai`, `superagent`, `openclaw`, `clawd`, etc.
2. **Custom headers** - `x-agent-type`, `x-agenttoll-id`
3. **x402 capability** - `x-402-capable: true` header

## 402 Response Format

When an agent request is blocked, the response includes:

### HTTP Headers
```
X-402-Version: 1
X-402-Amount: 0.05
X-402-Currency: USDC
X-402-Supported-Networks: solana,base
X-402-Pay-URL: https://toll.agenttoll.io/pay?publisher=...
X-402-Onboarding: true
X-402-Setup-URL: https://toll.agenttoll.io/docs#agent-setup
```

### JSON Body
```json
{
  "status": 402,
  "message": "Payment Required",
  "agent_instructions": "To access this resource, pay 0.05 USDC on solana or base via the payment URL below. After payment, retry with the returned token in Authorization header.",
  "payment": {
    "amount": 0.05,
    "currency": "USDC",
    "supported_networks": ["solana", "base"],
    "pay_url": "https://toll.agenttoll.io/pay?publisher=pk_live_xxx&amount=0.05&resource=...",
    "api_endpoint": "https://toll.agenttoll.io/api/pay"
  },
  "x402": {
    "version": 1,
    "amount": 0.05,
    "currency": "USDC",
    "receiver": "pending",
    "supported_networks": ["solana", "base"],
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
3. Returns 402 with payment info, `pay_url`, and supported networks
4. Agent calls `pay_url` with USDC payment on **Solana** or **Base**
5. Agent receives payment token
6. Agent retries original request with `Authorization: Bearer <token>`
7. Request succeeds with 200 OK

## SDK Additional Features (v1.3.1)

- **Content Gate**: Protect HTML pages from agentic crawlers (Perplexity, SearchGPT, etc.) — real browsers pass, agents get 402
- **`generateRobotsTxt()`**: Auto-generate robots.txt with x402 payment signals so crawlers know how to pay
- **Browser Gate**: Client-side detection of headless/agentic browsers (Puppeteer, Playwright, Selenium)
- **MCP Payment Proxy**: Paywall any MCP server without modifying it
- **Cloudflare Workers / Edge**: `import { tollgate } from '@agenttoll/sdk/edge'` for edge deployments
- **Bypass header**: Use `bypassHeader` option to allow internal services to skip toll checks
- **Agent analytics**: SDK automatically reports agent-stopped events for dashboard analytics
- **`tollbooth.hasPaid(req)`**: Check if a request has a valid toll payment in downstream middleware
- **`tollbooth.isAgent(req)`**: Check if a request is from an AI agent

## Dashboard

View earnings and payment history at: https://toll.agenttoll.io/dashboard

## Support

- Documentation: https://toll.agenttoll.io/docs
- Email: support@agenttoll.io
