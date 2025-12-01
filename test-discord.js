// Test Discord webhook
import dotenv from 'dotenv';
dotenv.config();

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

if (!DISCORD_WEBHOOK_URL) {
  console.log('❌ DISCORD_WEBHOOK_URL not set in .env');
  process.exit(1);
}

const testTweet = `🔔 $AAPL Market Now Open!

Opening Price: $234.56

Will it go UP or DOWN by market close? 🤔

Place your bet now 👇
https://stingmarkets.com

#StingMarkets #AAPL #Stocks #PredictionMarket`;

const message = `**📋 TEST TWEET (copy this):**
\`\`\`
${testTweet}
\`\`\``;

fetch(DISCORD_WEBHOOK_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    content: message,
    username: 'Sting Markets',
  }),
})
  .then(r => {
    console.log('Status:', r.status);
    if (r.ok) {
      console.log('✅ Test tweet sent to Discord! Check your channel.');
    } else {
      console.log('❌ Failed:', r.statusText);
    }
  })
  .catch(e => console.error('Error:', e));
