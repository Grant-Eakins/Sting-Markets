import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react';
import sdk from '@farcaster/frame-sdk';
import { FarcasterUser, FARCASTER_CONFIG } from '@/config/farcaster';

interface FarcasterAuthContextType {
  user: FarcasterUser | null;
  isConnected: boolean;
  isLoading: boolean;
  isInFarcasterClient: boolean;
  signIn: () => Promise<void>;
  signOut: () => void;
  error: string | null;
}

const FarcasterAuthContext = createContext<FarcasterAuthContextType | null>(null);

export function useFarcasterAuth() {
  const context = useContext(FarcasterAuthContext);
  if (!context) {
    throw new Error('useFarcasterAuth must be used within FarcasterAuthProvider');
  }
  return context;
}

interface FarcasterAuthProviderProps {
  children: ReactNode;
}

export function FarcasterAuthProvider({ children }: FarcasterAuthProviderProps) {
  const [user, setUser] = useState<FarcasterUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isInFarcasterClient, setIsInFarcasterClient] = useState(false);
  const [sdkInitialized, setSdkInitialized] = useState(false);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, []);

  // Initialize Farcaster SDK on mount
  useEffect(() => {
    const initFarcaster = async () => {
      try {
        // Get context from the Farcaster client
        const context = await sdk.context;
        
        if (context?.user) {
          // We're in a Farcaster client with user context
          setIsInFarcasterClient(true);
          
          const farcasterUser: FarcasterUser = {
            fid: context.user.fid,
            username: context.user.username || '',
            displayName: context.user.displayName || '',
            pfpUrl: context.user.pfpUrl || '',
            custody: undefined,
            verifications: [],
          };
          
          setUser(farcasterUser);
          localStorage.setItem('farcaster_user', JSON.stringify(farcasterUser));
        } else {
          // Not in Farcaster client or no user, check localStorage
          const saved = localStorage.getItem('farcaster_user');
          if (saved) {
            try {
              setUser(JSON.parse(saved));
            } catch {
              localStorage.removeItem('farcaster_user');
            }
          }
        }
        
        // Signal that the app is ready (dismisses splash screen)
        await sdk.actions.ready();
        setSdkInitialized(true);
        
      } catch (err) {
        console.log('Not in Farcaster client, using fallback auth');
        // Not in Farcaster frame, load from localStorage
        const saved = localStorage.getItem('farcaster_user');
        if (saved) {
          try {
            setUser(JSON.parse(saved));
          } catch {
            localStorage.removeItem('farcaster_user');
          }
        }
        setSdkInitialized(true);
      }
      
      setIsLoading(false);
    };
    
    initFarcaster();
  }, []);

  const signIn = useCallback(async () => {
    if (isLoading) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      // If in Farcaster client, use SDK sign-in
      if (isInFarcasterClient) {
        const result = await sdk.actions.signIn({
          nonce: crypto.randomUUID(),
        });
        
        if (result) {
          // Re-fetch context after sign-in
          const context = await sdk.context;
          if (context?.user) {
            const farcasterUser: FarcasterUser = {
              fid: context.user.fid,
              username: context.user.username || '',
              displayName: context.user.displayName || '',
              pfpUrl: context.user.pfpUrl || '',
              custody: undefined,
              verifications: [],
            };
            setUser(farcasterUser);
            localStorage.setItem('farcaster_user', JSON.stringify(farcasterUser));
          }
        }
        setIsLoading(false);
        return;
      }
      
      // Fallback: Use relay for web auth
      const channelResponse = await fetch(`${FARCASTER_CONFIG.relay}/v1/channel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siweUri: FARCASTER_CONFIG.siweUri,
          domain: FARCASTER_CONFIG.domain,
        }),
      });
      
      if (!channelResponse.ok) {
        throw new Error('Failed to create auth channel');
      }
      
      const channel = await channelResponse.json();
      const channelToken = channel.channelToken;
      const connectUrl = channel.url;
      
      // Open Warpcast for authentication
      window.open(connectUrl, '_blank', 'width=400,height=700');
      
      // Clear any existing polling
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      
      // Poll for auth completion
      pollIntervalRef.current = setInterval(async () => {
        try {
          const statusResponse = await fetch(
            `${FARCASTER_CONFIG.relay}/v1/channel/status?channelToken=${channelToken}`
          );
          
          if (!statusResponse.ok) return;
          
          const status = await statusResponse.json();
          
          if (status.state === 'completed') {
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
            
            const farcasterUser: FarcasterUser = {
              fid: status.fid,
              username: status.username,
              displayName: status.displayName,
              pfpUrl: status.pfpUrl,
              custody: status.custody,
              verifications: status.verifications || [],
            };
            
            setUser(farcasterUser);
            localStorage.setItem('farcaster_user', JSON.stringify(farcasterUser));
            setIsLoading(false);
          } else if (status.state === 'error') {
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
            setError('Authentication failed');
            setIsLoading(false);
          }
        } catch {
          // Continue polling
        }
      }, 1500);
      
      // Timeout after 5 minutes
      timeoutRef.current = setTimeout(() => {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        setIsLoading(false);
      }, 300000);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
      setIsLoading(false);
    }
  }, [isLoading, isInFarcasterClient]);

  const signOut = useCallback(() => {
    setUser(null);
    localStorage.removeItem('farcaster_user');
  }, []);

  return (
    <FarcasterAuthContext.Provider
      value={{
        user,
        isConnected: !!user,
        isLoading,
        isInFarcasterClient,
        signIn,
        signOut,
        error,
      }}
    >
      {children}
    </FarcasterAuthContext.Provider>
  );
}
