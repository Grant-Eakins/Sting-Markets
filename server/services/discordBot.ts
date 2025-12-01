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
  stockSymbol: string;
  stockName?: string;
  currentPrice: number; // in cents
  openingPrice: number; // in cents
  priceChangePercent: number;
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
    const price = (market.openingPrice / 100).toFixed(2);

    const tweet = `🔔 $${market.stockSymbol} Market Now Open!

Opening Price: $${price}

Will it go UP or DOWN by market close? 🤔

Place your bet now 👇
${SITE_URL}

#StingMarkets #${market.stockSymbol} #Stocks #PredictionMarket`;

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
    const currentPrice = (market.currentPrice / 100).toFixed(2);
    const openPrice = (market.openingPrice / 100).toFixed(2);
    const change = market.priceChangePercent;
    const emoji = change >= 0 ? '📈' : '📉';
    const sign = change >= 0 ? '+' : '';

    const tweet = `${emoji} $${market.stockSymbol} Price Update

Open: $${openPrice}
Now: $${currentPrice} (${sign}${change.toFixed(1)}%)

Think you know where it closes? Bet on the closing price! 🎯

${SITE_URL}

#StingMarkets #${market.stockSymbol} #Stocks #Trading`;

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
    const closingPrice = (market.currentPrice / 100).toFixed(2);
    const openPrice = (market.openingPrice / 100).toFixed(2);
    const change = market.priceChangePercent;
    const emoji = change >= 0 ? '🟢' : '🔴';
    const sign = change >= 0 ? '+' : '';
    const direction = change >= 0 ? 'UP' : 'DOWN';

    const tweet = `🏁 $${market.stockSymbol} Market Closed!

Open: $${openPrice}
Close: $${closingPrice}
Result: ${emoji} ${direction} ${sign}${change.toFixed(1)}%

Winners have been paid out! 💰

New markets open tomorrow 👇
${SITE_URL}

#StingMarkets #${market.stockSymbol} #Stocks #Crypto`;

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
  const testTweet = `🔔 $AAPL Market Now Open!

Opening Price: $234.56

Will it go UP or DOWN by market close? 🤔

Place your bet now 👇
${SITE_URL}

#StingMarkets #AAPL #Stocks #PredictionMarket`;

  const message = `**📋 TEST TWEET (copy this):**
\`\`\`
${testTweet}
\`\`\``;

  return sendDiscordMessage(message);
}
