import axios from 'axios';

const BACKEND_URL = 'http://localhost:3001';

try {
  const response = await axios.get(`${BACKEND_URL}/api/markets?status=all`);
  const markets = response.data.markets || [];
  
  console.log('All Markets:\n');
  
  for (const market of markets) {
    if (market.blockchainMarketId) {
      console.log(`Market ID: ${market.id}`);
      console.log(`Blockchain Market ID: ${market.blockchainMarketId}`);
      console.log(`Stock Symbol: ${market.stockSymbol}`);
      console.log(`Is Dual Coin: ${market.isDualCoin}`);
      if (market.isDualCoin) {
        console.log(`  Coin A: ${market.coinASymbol} (${market.coinAName})`);
        console.log(`  Coin B: ${market.coinBSymbol} (${market.coinBName})`);
      }
      console.log('');
    }
  }
} catch (error) {
  console.error('Error:', error.message);
}
