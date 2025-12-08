import { createConfig, http } from 'wagmi';
import { base, baseSepolia } from 'wagmi/chains';
import { coinbaseWallet, injected, walletConnect } from 'wagmi/connectors';
import { farcasterFrame } from '@farcaster/miniapp-wagmi-connector';

// WalletConnect Project ID from https://cloud.walletconnect.com/
const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || 'eb33070102c31c71949eeac977f28689';

// Check if we're in a Farcaster client
const isInFarcasterClient = typeof window !== 'undefined' && 
  (window.location.ancestorOrigins?.contains('https://warpcast.com') ||
   window.parent !== window ||
   navigator.userAgent.includes('Farcaster'));

// Create connectors - Farcaster connector first if in Farcaster client
const connectors = isInFarcasterClient 
  ? [
      farcasterFrame(),
      injected(),
      coinbaseWallet({ appName: 'Sting Markets' }),
      walletConnect({ projectId }),
    ]
  : [
      injected(),
      coinbaseWallet({ appName: 'Sting Markets' }),
      walletConnect({ projectId }),
    ];

export const config = createConfig({
  chains: [baseSepolia, base],
  connectors,
  transports: {
    [baseSepolia.id]: http(),
    [base.id]: http(),
  },
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
