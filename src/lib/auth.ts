/**
 * Authentication utilities for managing Supabase sessions and bearer tokens
 * This module provides functions to handle session management, token refresh,
 * and bearer token extraction for API requests.
 */

import { supabase } from '@/integrations/supabase/client';
import type { Session } from '@supabase/supabase-js';

/**
 * Get the current Supabase session
 * @returns Promise<Session | null>
 */
export async function getSession(): Promise<Session | null> {
  try {
    const { data, error } = await supabase.auth.getSession();
    
    if (error) {
      console.error('Error getting session:', error);
      return null;
    }
    
    return data.session;
  } catch (error) {
    console.error('Exception getting session:', error);
    return null;
  }
}

/**
 * Get the current access token (bearer token)
 * @returns Promise<string | null>
 */
export async function getAccessToken(): Promise<string | null> {
  const session = await getSession();
  return session?.access_token ?? null;
}

/**
 * Get the current refresh token
 * @returns Promise<string | null>
 */
export async function getRefreshToken(): Promise<string | null> {
  const session = await getSession();
  return session?.refresh_token ?? null;
}

/**
 * Create or retrieve an anonymous session
 * This is useful for apps that don't require user registration
 * but still need authenticated API calls
 * 
 * NOTE: This function currently returns existing sessions only.
 * Anonymous sign-ins are disabled to avoid 422 errors.
 * The app works with just the anon key (no session needed).
 * @returns Promise<Session | null>
 */
export async function ensureAnonymousSession(): Promise<Session | null> {
  // Check if we already have a session
  const session = await getSession();
  
  if (session) {
    // Check if session is still valid (not expired)
    const expiresAt = session.expires_at ? session.expires_at * 1000 : 0;
    const now = Date.now();
    
    if (expiresAt > now + 60000) { // Valid for at least 1 more minute
      return session;
    }
    
    // Try to refresh the session
    const refreshed = await refreshSession();
    if (refreshed) {
      return refreshed;
    }
  }
  
  // Don't attempt to create anonymous session as it may not be enabled
  // The app will function correctly using just the anon key
  return null;
}

/**
 * Refresh the current session
 * @returns Promise<Session | null>
 */
export async function refreshSession(): Promise<Session | null> {
  try {
    const { data, error } = await supabase.auth.refreshSession();
    
    if (error) {
      console.error('Error refreshing session:', error);
      return null;
    }
    
    return data.session;
  } catch (error) {
    console.error('Exception refreshing session:', error);
    return null;
  }
}

/**
 * Sign out and clear the session
 * @returns Promise<void>
 */
export async function signOut(): Promise<void> {
  try {
    const { error } = await supabase.auth.signOut();
    
    if (error) {
      console.error('Error signing out:', error);
    }
  } catch (error) {
    console.error('Exception signing out:', error);
  }
}

/**
 * Get authorization headers with bearer token
 * Falls back to just anon key if no session exists
 * @returns Promise<Record<string, string>>
 */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  
  // Add Supabase anon key (required)
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (anonKey) {
    headers['apikey'] = anonKey;
    
    // Try to get access token for Authorization header
    const token = await getAccessToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    } else {
      // If no session token, use anon key as bearer token
      // This allows the Edge Functions to work without auth
      headers['Authorization'] = `Bearer ${anonKey}`;
    }
  } else {
    console.error('VITE_SUPABASE_ANON_KEY not configured');
  }
  
  return headers;
}

/**
 * Listen to auth state changes
 * @param callback Function to call when auth state changes
 * @returns Unsubscribe function
 */
export function onAuthStateChange(
  callback: (session: Session | null) => void
): () => void {
  const { data: { subscription } } = supabase.auth.onAuthStateChange(
    (_event, session) => {
      callback(session);
    }
  );
  
  return () => {
    subscription.unsubscribe();
  };
}

/**
 * Check if the current session is valid
 * @returns Promise<boolean>
 */
export async function isSessionValid(): Promise<boolean> {
  const session = await getSession();
  
  if (!session) {
    return false;
  }
  
  const expiresAt = session.expires_at ? session.expires_at * 1000 : 0;
  const now = Date.now();
  
  return expiresAt > now;
}

/**
 * Get user information from the current session
 * @returns Promise<{ id: string; email?: string } | null>
 */
export async function getCurrentUser(): Promise<{ id: string; email?: string } | null> {
  const session = await getSession();
  
  if (!session || !session.user) {
    return null;
  }
  
  return {
    id: session.user.id,
    email: session.user.email,
  };
}
