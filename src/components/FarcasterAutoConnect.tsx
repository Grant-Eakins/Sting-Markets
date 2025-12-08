import { useEffect } from 'react';
import { useConnect, useAccount } from 'wagmi';

/**
 * Auto-connects to the Farcaster wallet when in a Farcaster client.
 * This component renders nothing but handles wallet connection automatically.
 */
export function FarcasterAutoConnect() {
  const { connect, connectors } = useConnect();
  const { isConnected } = useAccount();

  useEffect(() => {
    // If already connected, don't try to connect again
    if (isConnected) return;

    // Find the farcasterFrame connector
    const farcasterConnector = connectors.find(
      (connector) => connector.id === 'farcasterFrame'
    );

    if (farcasterConnector) {
      // Auto-connect to Farcaster wallet
      connect({ connector: farcasterConnector });
    }
  }, [connect, connectors, isConnected]);

  return null;
}
