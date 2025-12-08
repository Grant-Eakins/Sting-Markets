import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { createConfig, http } from 'wagmi';
import { base, baseSepolia } from 'wagmi/chains';
import { farcasterFrame } from '@farcaster/miniapp-wagmi-connector';

// WalletConnect Project ID from https://cloud.walletconnect.com/
const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || 'eb33070102c31c71949eeac977f28689';

// Check if we're likely in a Farcaster client
const isInFarcasterClient = typeof window !== 'undefined' && 
  (window.parent !== window || window.location.search.includes('fc_'));

// Use different config based on environment
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
