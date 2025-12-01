// @ts-ignore - node-fetch doesn't have types in this context
import fetch from 'node-fetch';

/**
 * Discord Bot Service for Sting Markets
 * 
 * Sends ready-to-copy tweets to Discord when prices update
 * 
 * Setup:
 * 1. Go to your Discord server settings
 * 2. Go to Integrations > Webhooks
 * 3. Create a new webhook, copy the URL
 * 4. Set DISCORD_WEBHOOK_URL in your .env file
 */

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const SITE_URL = 'https://stingmarkets.com';

interface MarketData {
  stockSymbol: string;  // Using stockSymbol for compatibility (will be crypto symbol)
  stockName?: string;
  currentPrice: number; // in cents
  openingPrice: number; // in cents
  priceChangePercent: number;
}

// Format price based on value - more decimals for lower-priced cryptos
function formatPrice(priceInCents: number, symbol: string): string {
  const price = priceInCents / 100;
  
  // High-value cryptos (BTC, ETH) - show with commas, 2 decimals
  if (price >= 100) {
    return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  
  // Mid-range ($1-$100) - 2 decimals
  if (price >= 1) {
    return price.toFixed(2);
  }
  
  // Sub-dollar ($0.01-$0.99) - 4 decimals
  if (price >= 0.01) {
    return price.toFixed(4);
  }
  
  // Very low price (memecoins) - 6 decimals
  return price.toFixed(6);
}

async function sendDiscordMessage(content: string) {
  if (!DISCORD_WEBHOOK_URL) {
    console.log('⚠️ Discord webhook not configured. Set DISCORD_WEBHOOK_URL in .env');
    return false;
  }

  try {
    const response = await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content,
        username: 'Sting Markets',
      }),
    });

    if (!response.ok) {
      console.error('❌ Discord webhook failed:', response.status, await response.text());
      return false;
    }

    console.log('✅ Discord tweet sent');
    return true;
  } catch (error) {
    console.error('❌ Discord webhook error:', error);
    return false;
  }
}

// Add delay between messages to avoid rate limiting
function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Send individual tweets for market OPENING prices
 */
export async function sendOpeningPriceTweets(markets: MarketData[]) {
  if (markets.length === 0) return;

  for (const market of markets) {
    const openPrice = formatPrice(market.openingPrice, market.stockSymbol);

    const tweet = `🔔 $${market.stockSymbol} Market Now Open!

Starting Price: $${openPrice}

Predict the price at next settlement 🎯

Pick your bucket and bet now 👇
${SITE_URL}

#StingMarkets #${market.stockSymbol} #Crypto #PredictionMarket`;

    const message = `**📋 COPY THIS TWEET:**
\`\`\`
${tweet}
\`\`\``;

    await sendDiscordMessage(message);
    await delay(1000); // 1 second delay between messages
  }
}

/**
 * Send individual tweets for MIDDAY price updates (every 3 hours)
 */
export async function sendPriceUpdateTweets(markets: MarketData[]) {
  if (markets.length === 0) return;

  for (const market of markets) {
    // Debug logging to verify data
    console.log(`📊 Discord tweet data for ${market.stockSymbol}:`);
    console.log(`   - currentPrice (cents): ${market.currentPrice}`);
    console.log(`   - openingPrice (cents): ${market.openingPrice}`);
    console.log(`   - priceChangePercent: ${market.priceChangePercent}`);
    
    const currentPrice = formatPrice(market.currentPrice, market.stockSymbol);
    const openPrice = formatPrice(market.openingPrice, market.stockSymbol);
    const change = market.priceChangePercent;
    const emoji = change >= 0 ? '📈' : '📉';
    const sign = change >= 0 ? '+' : '';

    const tweet = `${emoji} $${market.stockSymbol} Price Update

Session Start: $${openPrice}
Now: $${currentPrice} (${sign}${change.toFixed(1)}%)

Think you know where it settles? Pick your bucket! 🎯

${SITE_URL}

#StingMarkets #${market.stockSymbol} #Crypto #Trading`;

    const message = `**📋 COPY THIS TWEET:**
\`\`\`
${tweet}
\`\`\``;

    await sendDiscordMessage(message);
    await delay(1000);
  }
}

/**
 * Send individual tweets for CLOSING prices (settlement)
 */
export async function sendClosingPriceTweets(markets: MarketData[]) {
  if (markets.length === 0) return;

  for (const market of markets) {
    const closingPrice = formatPrice(market.currentPrice, market.stockSymbol);
    const openPrice = formatPrice(market.openingPrice, market.stockSymbol);
    const change = market.priceChangePercent;
    const emoji = change >= 0 ? '🟢' : '🔴';
    const sign = change >= 0 ? '+' : '';
    const direction = change >= 0 ? 'UP' : 'DOWN';

    const tweet = `🏁 $${market.stockSymbol} Session Settled!

Start: $${openPrice}
End: $${closingPrice}
Result: ${emoji} ${direction} ${sign}${change.toFixed(1)}%

Winners have been paid out! 💰

New session starting now 👇
${SITE_URL}

#StingMarkets #${market.stockSymbol} #Crypto #DeFi`;

    const message = `**📋 COPY THIS TWEET:**
\`\`\`
${tweet}
\`\`\``;

    await sendDiscordMessage(message);
    await delay(1000);
  }
}

/**
 * Legacy function - sends all prices in one tweet (kept for compatibility)
 */
export async function sendTweetAlert(markets: MarketData[]) {
  // Use the price update tweets instead
  await sendPriceUpdateTweets(markets);
}

/**
 * Test the Discord webhook
 */
export async function testDiscordWebhook() {
  const testTweet = `🔔 $BTC 12-Hour Session Open!

Opening Price: $68,420.00

Will it go UP or DOWN by settlement? 🤔

Pick your bucket now 👇
${SITE_URL}

#StingMarkets #BTC #Crypto #DeFi`;

  const message = `**📋 TEST TWEET (copy this):**
\`\`\`
${testTweet}
\`\`\``;

  return sendDiscordMessage(message);
}
