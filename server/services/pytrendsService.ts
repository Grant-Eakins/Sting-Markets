import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

export interface PyTrendData {
  term: string;
  rank: number;
  score: number;
  week: string;
}

interface PyTrendsResponse {
  success: boolean;
  trends: PyTrendData[];
  count: number;
  error?: string;
}

interface InterestResponse {
  success: boolean;
  term: string;
  score: number;
  error?: string;
}

/**
 * Get real-time trending topics from Google Trends using pytrends
 */
export async function getRealTimeTrends(geo: string = 'US', limit: number = 15): Promise<PyTrendData[]> {
  try {
    const scriptPath = path.join(process.cwd(), 'server', 'scripts', 'fetch_trends.py');
    const command = `python "${scriptPath}" trending ${geo} ${limit}`;
    
    console.log('🐍 Fetching real-time trends from Google via Python...');
    const { stdout, stderr } = await execAsync(command, { timeout: 30000 });
    
    if (stderr) {
      console.warn('⚠️ Python warnings:', stderr);
    }
    
    const response: PyTrendsResponse = JSON.parse(stdout);
    
    if (response.success) {
      console.log(`✅ Got ${response.count} real trending topics from Google`);
      return response.trends;
    } else {
      console.error('❌ Python script error:', response.error);
      return getFallbackTrends();
    }
  } catch (error: any) {
    console.error('❌ Error calling Python script:', error.message);
    return getFallbackTrends();
  }
}

/**
 * Get interest score for a specific term
 */
export async function getRealTimeInterestScore(term: string, geo: string = 'US'): Promise<number> {
  try {
    const scriptPath = path.join(process.cwd(), 'server', 'scripts', 'fetch_trends.py');
    const command = `python "${scriptPath}" interest "${term}" ${geo}`;
    
    const { stdout } = await execAsync(command, { timeout: 15000 });
    const response: InterestResponse = JSON.parse(stdout);
    
    if (response.success) {
      return response.score;
    } else {
      console.warn(`⚠️ Could not get interest for "${term}":`, response.error);
      return 60; // Fallback score
    }
  } catch (error: any) {
    console.error(`❌ Error getting interest for "${term}":`, error.message);
    return 60;
  }
}

/**
 * Fallback curated trends if Python fails
 */
function getFallbackTrends(): PyTrendData[] {
  console.log('📋 Using fallback curated trends...');
  return [
    { term: 'ChatGPT', rank: 1, score: 95, week: 'current' },
    { term: 'AI', rank: 2, score: 92, week: 'current' },
    { term: 'Bitcoin', rank: 3, score: 88, week: 'current' },
    { term: 'Ethereum', rank: 4, score: 85, week: 'current' },
    { term: 'Climate Change', rank: 5, score: 82, week: 'current' },
    { term: 'SpaceX', rank: 6, score: 80, week: 'current' },
    { term: 'Tesla', rank: 7, score: 78, week: 'current' },
    { term: 'NFL', rank: 8, score: 75, week: 'current' },
    { term: 'NBA', rank: 9, score: 72, week: 'current' },
    { term: 'Web3', rank: 10, score: 70, week: 'current' },
  ];
}
