import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format crypto price with appropriate decimal places based on value
 * - $100+ (BTC, ETH): 2 decimals with commas
 * - $1-$100: 2 decimals
 * - $0.01-$0.99 (DOGE): 4 decimals
 * - Below $0.01: 6 decimals
 */
export function formatCryptoPrice(price: number): string {
  if (price >= 100) {
    return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (price >= 1) {
    return price.toFixed(2);
  }
  if (price >= 0.01) {
    return price.toFixed(4);
  }
  return price.toFixed(6);
}

/**
 * Format price in cents to display string
 */
export function formatPriceFromCents(priceInCents: number): string {
  return formatCryptoPrice(priceInCents / 100);
}
