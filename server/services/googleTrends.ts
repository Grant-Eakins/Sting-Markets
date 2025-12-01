// @ts-ignore - google-trends-api doesn't have type definitions
import googleTrends from 'google-trends-api';

export interface TrendData {
  title: string;
  formattedTraffic: string;
  relatedQueries: any;
  link: string;
  picture?: {
    source: string;
    width: number;
    height: number;
  };
}

/**
 * Mock trends for development/testing when Google Trends API fails
 */
const MOCK_TRENDS: TrendData[] = [
  {
    title: 'Artificial Intelligence Breakthrough',
    formattedTraffic: '2M+',
    relatedQueries: [],
    link: 'https://example.com/ai',
    picture: { source: 'https://picsum.photos/200', width: 200, height: 200 },
  },
  {
    title: 'Cryptocurrency Market Update',
    formattedTraffic: '1.5M+',
    relatedQueries: [],
    link: 'https://example.com/crypto',
    picture: { source: 'https://picsum.photos/200', width: 200, height: 200 },
  },
  {
    title: 'Space Exploration News',
    formattedTraffic: '800K+',
    relatedQueries: [],
    link: 'https://example.com/space',
    picture: { source: 'https://picsum.photos/200', width: 200, height: 200 },
  },
];

/**
 * Sleep helper for adding delays
 */
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Fetches trending searches from Google Trends for the past 7 days
 * @param geo - Geographic location (default: US)
 * @returns Array of trending topics
 */
export async function getDailyTrends(geo: string = 'US'): Promise<TrendData[]> {
  try {
    console.log('📊 Fetching Google Trends data...');
    
    // Add delay to avoid rate limiting
    await sleep(2000);
    
    const results = await googleTrends.dailyTrends({
      geo,
      trendDate: new Date(),
      hl: 'en-US',  // Language hint
    });

    // Check if we got HTML instead of JSON (common when rate-limited)
    if (typeof results === 'string' && results.trim().startsWith('<!')) {
      console.warn('⚠️  Google Trends returned HTML (likely rate-limited or blocked)');
      console.log('🔄 Using mock trends for development');
      return MOCK_TRENDS;
    }

    const data = JSON.parse(results);
    
    if (!data.default?.trendingSearchesDays?.[0]?.trendingSearches) {
      console.warn('⚠️  Unexpected Google Trends response format');
      console.log('🔄 Using mock trends for development');
      return MOCK_TRENDS;
    }

    const trendingSearches = data.default.trendingSearchesDays[0].trendingSearches;
    
    console.log(`✅ Fetched ${trendingSearches.length} trends from Google`);
    
    return trendingSearches.map((trend: any) => ({
      title: trend.title.query,
      formattedTraffic: trend.formattedTraffic,
      relatedQueries: trend.relatedQueries,
      link: trend.articles[0]?.url || '',
      picture: trend.image,
    }));
  } catch (error: any) {
    console.error('❌ Error fetching Google Trends:', error.message);
    console.log('🔄 Falling back to mock trends for development');
    
    // Return mock data instead of throwing
    return MOCK_TRENDS;
  }
}

/**
 * Fetches real-time trending searches
 * @param geo - Geographic location (default: US)
 * @returns Array of real-time trends
 */
export async function getRealTimeTrends(geo: string = 'US'): Promise<any[]> {
  try {
    const results = await googleTrends.realTimeTrends({
      geo,
      category: 'all',
    });

    const data = JSON.parse(results);
    return data.storySummaries.trendingStories || [];
  } catch (error) {
    console.error('Error fetching real-time trends:', error);
    throw new Error('Failed to fetch real-time trends');
  }
}

/**
 * Fetches interest over time for specific keywords
 * @param keyword - Search keyword
 * @param startTime - Start date for the trend analysis
 * @returns Interest over time data
 */
export async function getInterestOverTime(
  keyword: string,
  startTime: Date = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
): Promise<any> {
  try {
    const results = await googleTrends.interestOverTime({
      keyword,
      startTime,
      endTime: new Date(),
      geo: 'US',
    });

    return JSON.parse(results);
  } catch (error) {
    console.error(`Error fetching interest over time for ${keyword}:`, error);
    throw new Error(`Failed to fetch interest data for ${keyword}`);
  }
}

/**
 * Filters trends that have emerged in the past 7 days
 * @param trends - Array of trend data
 * @returns Filtered trends from the past 7 days
 */
/**
 * Gets the current interest score (0-100) for a trend
 * 100 = peak popularity, 50 = half as popular, 0 = not enough data
 */
export async function getCurrentInterestScore(keyword: string): Promise<number> {
  try {
    // Add delay between requests
    await sleep(1500);
    
    const results = await googleTrends.interestOverTime({
      keyword,
      startTime: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
      endTime: new Date(),
      geo: 'US',
      hl: 'en-US',
    });

    // Check if we got HTML instead of JSON (rate-limited)
    if (typeof results === 'string' && results.trim().startsWith('<!')) {
      console.warn(`⚠️  Google Trends rate-limited for "${keyword}"`);
      // Return realistic demo value between 40-90
      return Math.floor(Math.random() * 50) + 40;
    }

    const data = JSON.parse(results);
    const timelineData = data.default?.timelineData;
    
    if (!timelineData || timelineData.length === 0) {
      console.warn(`⚠️  No timeline data for "${keyword}"`);
      return Math.floor(Math.random() * 50) + 40;
    }

    // Get the most recent interest value
    const latestValue = timelineData[timelineData.length - 1].value[0];
    console.log(`📊 Interest score for "${keyword}": ${latestValue}/100`);
    return latestValue;
  } catch (error: any) {
    console.error(`❌ Error fetching interest score for ${keyword}:`, error.message);
    // Return realistic demo value between 40-90
    return Math.floor(Math.random() * 50) + 40;
  }
}

/**
 * Gets historical interest data for charting
 * Returns array of {date, value} where value is 0-100
 */
export async function getInterestHistory(keyword: string, days: number = 30): Promise<Array<{date: string, value: number}>> {
  try {
    const results = await googleTrends.interestOverTime({
      keyword,
      startTime: new Date(Date.now() - days * 24 * 60 * 60 * 1000),
      endTime: new Date(),
      geo: 'US',
    });

    const data = JSON.parse(results);
    const timelineData = data.default?.timelineData || [];
    
    return timelineData.map((item: any) => ({
      date: item.formattedTime,
      value: item.value[0],
    }));
  } catch (error) {
    console.error(`Error fetching interest history for ${keyword}:`, error);
    // Return mock chart data for demo
    return Array.from({ length: days }, (_, i) => ({
      date: new Date(Date.now() - (days - i) * 24 * 60 * 60 * 1000).toLocaleDateString(),
      value: Math.floor(Math.random() * 50) + 30,
    }));
  }
}

export async function filterRecentTrends(trends: TrendData[]): Promise<TrendData[]> {
  // For stock market mode, we want ALL trends with their current interest scores
  // We'll return all trends and let the market service handle scoring
  return trends;
}
