// Farcaster Auth Configuration
// Sign In With Farcaster (SIWF) for web apps

export const FARCASTER_CONFIG = {
  // Your app's domain (update for production)
  domain: typeof window !== 'undefined' ? window.location.host : 'localhost:5173',
  
  // App metadata shown in the auth popup
  siweUri: typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173',
  
  // Relay URL for Farcaster auth
  relay: 'https://relay.farcaster.xyz',
  
  // RPC URL for verification (Base mainnet recommended)
  rpcUrl: 'https://mainnet.base.org',
  
  // Optional: Your app's Farcaster channel
  // channel: 'mindshare-markets',
};

// Farcaster user profile type
export interface FarcasterUser {
  fid: number;                    // Farcaster ID
  username?: string;              // @username
  displayName?: string;           // Display name
  pfpUrl?: string;                // Profile picture URL
  custody?: `0x${string}`;        // Custody address (optional - may not be available from SDK)
  verifications: `0x${string}`[]; // Verified wallet addresses
}
