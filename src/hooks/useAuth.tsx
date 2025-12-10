/**
 * React hook for authentication state management
 * Provides session information and auth utilities to React components
 */

import { useState, useEffect } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  getSession,
  getAccessToken,
  ensureAnonymousSession,
  onAuthStateChange,
  isSessionValid,
  getCurrentUser,
  refreshSession,
  signOut,
} from '@/lib/auth';

interface UseAuthReturn {
  session: Session | null;
  accessToken: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  user: { id: string; email?: string } | null;
  ensureSession: () => Promise<Session | null>;
  refresh: () => Promise<Session | null>;
  logout: () => Promise<void>;
  checkValidity: () => Promise<boolean>;
}

/**
 * Hook to manage authentication state
 * @returns UseAuthReturn
 */
export function useAuth(): UseAuthReturn {
  const [session, setSession] = useState<Session | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);

  // Initialize session on mount
  useEffect(() => {
    let mounted = true;

    const initSession = async () => {
      try {
        const currentSession = await getSession();
        
        if (mounted) {
          setSession(currentSession);
          setAccessToken(currentSession?.access_token ?? null);
          
          if (currentSession) {
            const currentUser = await getCurrentUser();
            setUser(currentUser);
          }
        }
      } catch (error) {
        console.error('Error initializing session:', error);
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    initSession();

    // Listen for auth state changes
    const unsubscribe = onAuthStateChange((newSession) => {
      if (mounted) {
        setSession(newSession);
        setAccessToken(newSession?.access_token ?? null);
        
        if (newSession) {
          getCurrentUser().then((currentUser) => {
            if (mounted) {
              setUser(currentUser);
            }
          });
        } else {
          setUser(null);
        }
      }
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const ensureSession = async (): Promise<Session | null> => {
    const newSession = await ensureAnonymousSession();
    setSession(newSession);
    setAccessToken(newSession?.access_token ?? null);
    
    if (newSession) {
      const currentUser = await getCurrentUser();
      setUser(currentUser);
    }
    
    return newSession;
  };

  const refresh = async (): Promise<Session | null> => {
    const newSession = await refreshSession();
    setSession(newSession);
    setAccessToken(newSession?.access_token ?? null);
    
    if (newSession) {
      const currentUser = await getCurrentUser();
      setUser(currentUser);
    }
    
    return newSession;
  };

  const logout = async (): Promise<void> => {
    await signOut();
    setSession(null);
    setAccessToken(null);
    setUser(null);
  };

  const checkValidity = async (): Promise<boolean> => {
    return await isSessionValid();
  };

  return {
    session,
    accessToken,
    isLoading,
    isAuthenticated: !!session,
    user,
    ensureSession,
    refresh,
    logout,
    checkValidity,
  };
}
