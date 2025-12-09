import { useEffect, useState, useRef } from 'react';
import { useConnect, useAccount, useReconnect } from 'wagmi';

/**
 * Check if we're running inside a Farcaster client (mini-app context)
 */
function isInFarcasterClient(): boolean {
  if (typeof window === 'undefined') return false;
  
  // Check if we're in an iframe (typical for Farcaster mini-apps)
  const isIframe = window.parent !== window;
  
  // Check URL params that indicate Farcaster context
  const hasFrameParams = window.location.search.includes('fc_') || 
                         window.location.hash.includes('fc_');
  
  // Check if Farcaster SDK context is available
  const hasFarcasterContext = !!(window as any).farcasterContext || 
                               !!(window as any).fc;
  
  return isIframe || hasFrameParams || hasFarcasterContext;
}

/**
 * Auto-connects to the Farcaster wallet when in a Farcaster client.
 * This component renders nothing but handles wallet connection automatically.
 */
export function FarcasterAutoConnect() {
  const { connect, connectors, error: connectError, isPending } = useConnect();
  const { isConnected, isConnecting, isReconnecting } = useAccount();
  const { reconnect } = useReconnect();
  const [hasAttempted, setHasAttempted] = useState(false);
  const attemptCountRef = useRef(0);
  const maxAttempts = 3;

  // Handle connection errors
  useEffect(() => {
    if (connectError) {
      console.log('🔴 Wallet connection error:', connectError.message);
    }
  }, [connectError]);

  useEffect(() => {
    // Skip if already connected, currently connecting, or max attempts reached
    if (isConnected || isConnecting || isReconnecting || isPending) {
      return;
    }
    
    if (attemptCountRef.current >= maxAttempts) {
      if (!hasAttempted) {
        console.log('🔴 Max auto-connect attempts reached');
        setHasAttempted(true);
      }
      return;
    }

    const autoConnect = async () => {
      attemptCountRef.current++;
      
      // First try reconnecting to previously connected wallet
      if (attemptCountRef.current === 1) {
        try {
          console.log('🔄 Attempting to reconnect previous wallet...');
          reconnect();
          return;
        } catch (error) {
          console.log('Reconnect failed, will try Farcaster connector...');
        }
      }

      // Only auto-connect Farcaster connector if we're in a Farcaster client
      if (!isInFarcasterClient()) {
        console.log('📱 Not in Farcaster client, skipping auto-connect');
        setHasAttempted(true);
        return;
      }

      // Find the farcasterFrame connector
      const farcasterConnector = connectors.find(c => c.id === 'farcasterFrame');

      if (farcasterConnector) {
        console.log('🟣 Found Farcaster connector, auto-connecting (attempt', attemptCountRef.current, ')...');
        try {
          connect({ connector: farcasterConnector });
        } catch (error) {
          console.log('Farcaster auto-connect failed:', error);
        }
      } else {
        console.log('⚠️ Farcaster connector not found in connectors:', connectors.map(c => c.id));
      }
      
      setHasAttempted(true);
    };

    // Delay to let wagmi and SDK initialize
    const timer = setTimeout(autoConnect, 800);
    return () => clearTimeout(timer);
  }, [connect, connectors, isConnected, isConnecting, isReconnecting, isPending, hasAttempted, reconnect]);

  return null;
}
