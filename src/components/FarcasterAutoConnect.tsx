import { useEffect } from 'react';
import { useConnect, useAccount } from 'wagmi';
import { useFarcasterAuth } from '@/hooks/useFarcasterAuth';
import sdk from '@farcaster/frame-sdk';

/**
 * Auto-connects to the Farcaster wallet when in a Farcaster client.
 * This component renders nothing but handles wallet connection automatically.
 */
export function FarcasterAutoConnect() {
  const { connect, connectors } = useConnect();
  const { isConnected } = useAccount();
  const { isInFarcasterClient } = useFarcasterAuth();

  useEffect(() => {
    // Only auto-connect if in Farcaster client and not already connected
    if (!isInFarcasterClient || isConnected) return;

    const autoConnect = async () => {
      try {
        // Get the Farcaster wallet provider
        const provider = await sdk.wallet.ethProvider;
        
        if (provider) {
          // Find an injected connector to use with the Farcaster provider
          const injectedConnector = connectors.find(
            (connector) => connector.id === 'injected' || connector.id === 'metaMask'
          );

          if (injectedConnector) {
            connect({ connector: injectedConnector });
          }
        }
      } catch (error) {
        console.log('Farcaster auto-connect failed:', error);
      }
    };

    // Small delay to let the SDK initialize
    setTimeout(autoConnect, 500);
  }, [connect, connectors, isConnected, isInFarcasterClient]);

  return null;
}
