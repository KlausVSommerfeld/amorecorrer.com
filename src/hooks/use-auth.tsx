/**
 * React hook for authentication state management
 * Provides session information and auth utilities to React components
 */

import { useState } from 'react';
import type { Session } from '@supabase/supabase-js';

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
  const [isLoading, setIsLoading] = useState(false);
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);

  const ensureSession = async (): Promise<Session | null> => {
    // No-op: we don't need sessions for this app
    // The API will use the anon key for authentication
    return null;
  };

  const refresh = async (): Promise<Session | null> => {
    // No-op: we don't need sessions for this app
    return null;
  };

  const logout = async (): Promise<void> => {
    setSession(null);
    setAccessToken(null);
    setUser(null);
  };

  const checkValidity = async (): Promise<boolean> => {
    // Always valid since we're not using sessions
    return true;
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
