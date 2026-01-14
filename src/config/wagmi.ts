import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { createConfig, http, fallback } from 'wagmi';
import { base } from 'wagmi/chains';
import { farcasterFrame } from '@farcaster/miniapp-wagmi-connector';

// WalletConnect Project ID from https://cloud.walletconnect.com/
const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || 'eb33070102c31c71949eeac977f28689';

// RPC endpoints with fallbacks for reliability
const BASE_MAINNET_RPC_URLS = [
  'https://base-rpc.publicnode.com',
  'https://base.blockpi.network/v1/rpc/public', 
  'https://mainnet.base.org',
];

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
// Base mainnet only
export const config = isInFarcasterClient
  ? createConfig({
      chains: [base],
      connectors: [farcasterFrame()],
      transports: {
        [base.id]: fallback(BASE_MAINNET_RPC_URLS.map(url => http(url))),
      },
    })
  : getDefaultConfig({
      appName: 'Sting Markets',
      projectId,
      chains: [base],
      ssr: false,
      transports: {
        [base.id]: fallback(BASE_MAINNET_RPC_URLS.map(url => http(url))),
      },
    });

export const BASE_CHAIN_ID = base.id;

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
