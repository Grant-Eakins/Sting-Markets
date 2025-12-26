/**
 * Utility functions for scheduled market timing
 * Markets activate at noon or midnight for 12-hour trading periods
 */

/**
 * Calculate the next noon (12:00 PM) or midnight (12:00 AM) boundary
 * @returns Date object set to the next noon or midnight
 */
export function getNextMarketStartTime(): Date {
  const now = new Date();
  const nextStart = new Date(now);
  
  // Get current hour
  const currentHour = now.getHours();
  
  if (currentHour < 12) {
    // Before noon - next start is today at noon
    nextStart.setHours(12, 0, 0, 0);
  } else {
    // After noon - next start is tomorrow at midnight
    nextStart.setDate(nextStart.getDate() + 1);
    nextStart.setHours(0, 0, 0, 0);
  }
  
  return nextStart;
}

/**
 * Calculate lock time (same as start time for now - markets lock when they activate)
 * In future, could add grace period after activation
 */
export function calculateLockTime(startTime: Date): Date {
  return new Date(startTime);
}

/**
 * Calculate settle time (12 hours after start time)
 * Markets run for exactly 12 hours: noon-midnight or midnight-noon
 */
export function calculateSettleTime(startTime: Date): Date {
  const settleTime = new Date(startTime);
  settleTime.setHours(settleTime.getHours() + 12);
  return settleTime;
}

/**
 * Get time remaining until a scheduled market starts
 * @returns Object with hours, minutes, seconds remaining
 */
export function getTimeUntilStart(startTime: Date): { hours: number; minutes: number; seconds: number; total: number } {
  const now = new Date();
  const diff = startTime.getTime() - now.getTime();
  
  if (diff <= 0) {
    return { hours: 0, minutes: 0, seconds: 0, total: 0 };
  }
  
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);
  
  return { hours, minutes, seconds, total: diff };
}

/**
 * Format time remaining as HH:MM:SS
 */
export function formatTimeRemaining(startTime: Date): string {
  const { hours, minutes, seconds } = getTimeUntilStart(startTime);
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}
