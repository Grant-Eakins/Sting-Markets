import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { createConfig, http } from 'wagmi';
import { base, baseSepolia } from 'wagmi/chains';
import { farcasterFrame } from '@farcaster/miniapp-wagmi-connector';

// WalletConnect Project ID from https://cloud.walletconnect.com/
const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || 'eb33070102c31c71949eeac977f28689';

/**
 * Check if we're likely running inside a Farcaster client/mini-app
 * This runs at module load time, so it needs to be robust
 */
function detectFarcasterClient(): boolean {
  if (typeof window === 'undefined') return false;
  
  try {
    // Check if we're in an iframe (common for Farcaster mini-apps)
    const isIframe = window.parent !== window;
    
    // Check URL params that indicate Farcaster context
    const urlParams = new URLSearchParams(window.location.search);
    const hasFrameParams = urlParams.has('fc') || 
                          urlParams.has('fc_') ||
                          window.location.search.includes('fc_') ||
                          window.location.hash.includes('fc_');
    
    // Check for Farcaster-specific context objects
    const hasFarcasterGlobals = !!(window as any).farcaster || 
                                !!(window as any).farcasterContext;
    
    // Check user agent for Warpcast
    const isWarpcast = navigator.userAgent.toLowerCase().includes('warpcast');
    
    const result = isIframe || hasFrameParams || hasFarcasterGlobals || isWarpcast;
    
    if (result) {
      console.log('🟣 Detected Farcaster client environment:', { 
        isIframe, hasFrameParams, hasFarcasterGlobals, isWarpcast 
      });
    }
    
    return result;
  } catch (e) {
    console.warn('Error detecting Farcaster client:', e);
    return false;
  }
}

const isInFarcasterClient = detectFarcasterClient();

// Use different config based on environment
// Always include farcasterFrame connector in both configs for flexibility
export const config = isInFarcasterClient
  ? createConfig({
      chains: [baseSepolia, base],
      connectors: [farcasterFrame()],
      transports: {
        [baseSepolia.id]: http(),
        [base.id]: http(),
      },
    })
  : getDefaultConfig({
      appName: 'Sting Markets',
      projectId,
      chains: [baseSepolia, base],
      ssr: false,
    });

export const BASE_CHAIN_ID = base.id;
export const BASE_SEPOLIA_CHAIN_ID = baseSepolia.id;

// Base chain configuration
export const BASE_CONFIG = {
  chainId: base.id,
  name: 'Base',
  rpcUrl: 'https://mainnet.base.org',
  blockExplorer: 'https://basescan.org',
  nativeCurrency: {
    name: 'Ethereum',
    symbol: 'ETH',
    decimals: 18,
  },
};

// Base Sepolia testnet configuration
export const BASE_SEPOLIA_CONFIG = {
  chainId: baseSepolia.id,
  name: 'Base Sepolia',
  rpcUrl: 'https://sepolia.base.org',
  blockExplorer: 'https://sepolia.basescan.org',
  nativeCurrency: {
    name: 'Ethereum',
    symbol: 'ETH',
    decimals: 18,
  },
};
