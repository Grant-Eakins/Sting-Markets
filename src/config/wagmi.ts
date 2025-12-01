import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { base, baseSepolia } from 'wagmi/chains';

// Get WalletConnect project ID or use a default for development
const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || 'c3ab2e3e3b3e3e3e3e3e3e3e3e3e3e3e';

export const config = getDefaultConfig({
  appName: 'Mindshare Token',
  projectId,
  chains: [base, baseSepolia],
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
