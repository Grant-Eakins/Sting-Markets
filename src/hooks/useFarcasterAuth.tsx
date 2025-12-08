import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { FarcasterUser, FARCASTER_CONFIG } from '@/config/farcaster';

interface FarcasterAuthContextType {
  user: FarcasterUser | null;
  isConnected: boolean;
  isLoading: boolean;
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
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load saved user from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('farcaster_user');
    if (saved) {
      try {
        setUser(JSON.parse(saved));
      } catch {
        localStorage.removeItem('farcaster_user');
      }
    }
  }, []);

  const signIn = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Create a channel for the auth request
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
      
      // Poll for auth completion
      const pollInterval = setInterval(async () => {
        try {
          const statusResponse = await fetch(
            `${FARCASTER_CONFIG.relay}/v1/channel/status?channelToken=${channelToken}`
          );
          
          if (!statusResponse.ok) return;
          
          const status = await statusResponse.json();
          
          if (status.state === 'completed') {
            clearInterval(pollInterval);
            
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
            clearInterval(pollInterval);
            setError('Authentication failed');
            setIsLoading(false);
          }
        } catch {
          // Continue polling
        }
      }, 1500);
      
      // Timeout after 5 minutes
      setTimeout(() => {
        clearInterval(pollInterval);
        if (isLoading) {
          setError('Authentication timed out');
          setIsLoading(false);
        }
      }, 300000);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
      setIsLoading(false);
    }
  };

  const signOut = () => {
    setUser(null);
    localStorage.removeItem('farcaster_user');
  };

  return (
    <FarcasterAuthContext.Provider
      value={{
        user,
        isConnected: !!user,
        isLoading,
        signIn,
        signOut,
        error,
      }}
    >
      {children}
    </FarcasterAuthContext.Provider>
  );
}
