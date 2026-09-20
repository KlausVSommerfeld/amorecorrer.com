/**
 * Authentication utilities for managing Supabase sessions and bearer tokens
 * This module provides functions to handle session management, token refresh,
 * and bearer token extraction for API requests.
 *
 * **O cliente do Supabase é carregado sob demanda, nunca no load.** Ele custa
 * ~496 KB de fonte (auth-js, realtime-js, storage-js, postgrest-js) e a landing
 * não usa nada disso: não existe `signIn` em lugar nenhum do projeto,
 * `ensureAnonymousSession()` devolve `null` por definição, e o cabeçalho que
 * sai para as Edge Functions é sempre `Bearer <anon key>` — uma variável de
 * ambiente. Enquanto a autenticação bearer estiver desligada (ver `CLAUDE.md`),
 * as funções abaixo que precisam de sessão importam o cliente dinamicamente, e
 * o Vite as separa num chunk que nunca é baixado.
 *
 * Para religar o token de usuário: `getAuthHeaders()` volta a ser assíncrona e
 * consulta `getAccessToken()` — o que traz o cliente de volta ao caminho
 * crítico, então vale medir de novo antes.
 */

import type { Session, SupabaseClient } from '@supabase/supabase-js';

/** Importa o cliente só quando alguma função realmente precisa de sessão. */
async function clienteSupabase(): Promise<SupabaseClient> {
  const { supabase } = await import('@/integrations/supabase/client');
  return supabase as unknown as SupabaseClient;
}

/**
 * Get the current Supabase session
 * @returns Promise<Session | null>
 */
export async function getSession(): Promise<Session | null> {
  try {
    const supabase = await clienteSupabase();
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
  // Just return null - we don't need sessions for this app
  // The Edge Functions will authenticate using the anon key in the Authorization header
  return null;
}

/**
 * Refresh the current session
 * @returns Promise<Session | null>
 */
export async function refreshSession(): Promise<Session | null> {
  try {
    const supabase = await clienteSupabase();
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
    const supabase = await clienteSupabase();
    const { error } = await supabase.auth.signOut();
    
    if (error) {
      console.error('Error signing out:', error);
    }
  } catch (error) {
    console.error('Exception signing out:', error);
  }
}

/**
 * Cabeçalhos das chamadas às Edge Functions.
 *
 * Síncrona de propósito: sem `signIn` em lugar nenhum, `getAccessToken()`
 * devolvia `null` em 100% das chamadas e o resultado era sempre
 * `Bearer <anon key>` — mas o `await` obrigava a carregar o cliente do Supabase
 * antes de qualquer requisição, inclusive no primeiro clique do checkout. Os
 * bytes que saem na rede são exatamente os mesmos de antes.
 */
export function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!anonKey) {
    console.error('VITE_SUPABASE_ANON_KEY not configured');
    return headers;
  }

  headers['apikey'] = anonKey;
  headers['Authorization'] = `Bearer ${anonKey}`;
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
  let cancelar: (() => void) | null = null;
  let cancelado = false;

  void clienteSupabase().then((supabase) => {
    if (cancelado) return;
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        callback(session);
      }
    );
    cancelar = () => subscription.unsubscribe();
  });

  return () => {
    cancelado = true;
    cancelar?.();
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
