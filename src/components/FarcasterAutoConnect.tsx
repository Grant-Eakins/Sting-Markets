import { useEffect, useState } from 'react';
import { useConnect, useAccount } from 'wagmi';

/**
 * Auto-connects to the Farcaster wallet when in a Farcaster client.
 * This component renders nothing but handles wallet connection automatically.
 */
export function FarcasterAutoConnect() {
  const { connect, connectors } = useConnect();
  const { isConnected } = useAccount();
  const [hasAttempted, setHasAttempted] = useState(false);

  useEffect(() => {
    // Only attempt once and if not connected
    if (hasAttempted || isConnected) return;

    const autoConnect = async () => {
      // Find the farcasterFrame connector
      const farcasterConnector = connectors.find(c => c.id === 'farcasterFrame');

      if (farcasterConnector) {
        console.log('🟣 Found Farcaster connector, auto-connecting...');
        try {
          connect({ connector: farcasterConnector });
        } catch (error) {
          console.log('Farcaster auto-connect failed:', error);
        }
      }
      
      setHasAttempted(true);
    };

    // Small delay to let everything initialize
    const timer = setTimeout(autoConnect, 500);
    return () => clearTimeout(timer);
  }, [connect, connectors, isConnected, hasAttempted]);

  return null;
}
