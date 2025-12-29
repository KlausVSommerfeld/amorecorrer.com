/**
 * API utilities for making authenticated requests to Supabase Edge Functions
 * Provides helper functions for common API operations with automatic token handling
 */

import { getAuthHeaders, ensureAnonymousSession, isSessionValid, refreshSession } from './auth';

interface FetchOptions extends RequestInit {
  skipAuth?: boolean;
  retryOnUnauthorized?: boolean;
}

/**
 * Make an authenticated API request
 * Automatically handles bearer token injection and session refresh
 * 
 * @param url The URL to fetch
 * @param options Fetch options
 * @returns Promise<Response>
 */
export async function authenticatedFetch(
  url: string,
  options: FetchOptions = {}
): Promise<Response> {
  const { skipAuth = false, retryOnUnauthorized = true, ...fetchOptions } = options;

  // Get headers with bearer token (includes anon key as fallback)
  const authHeaders = skipAuth ? {} : await getAuthHeaders();

  // Merge headers
  const headers = {
    ...authHeaders,
    ...fetchOptions.headers,
  };

  // Make the request
  const response = await fetch(url, {
    ...fetchOptions,
    headers,
  });

  return response;
}

/**
 * POST request with automatic authentication
 * 
 * @param url The URL to post to
 * @param body The request body (will be JSON stringified)
 * @param options Additional fetch options
 * @returns Promise<Response>
 */
export async function authenticatedPost<T = unknown>(
  url: string,
  body: T,
  options: FetchOptions = {}
): Promise<Response> {
  return authenticatedFetch(url, {
    method: 'POST',
    body: JSON.stringify(body),
    ...options,
  });
}

/**
 * GET request with automatic authentication
 * 
 * @param url The URL to get from
 * @param options Additional fetch options
 * @returns Promise<Response>
 */
export async function authenticatedGet(
  url: string,
  options: FetchOptions = {}
): Promise<Response> {
  return authenticatedFetch(url, {
    method: 'GET',
    ...options,
  });
}

/**
 * Submit form data to the form-submit edge function
 * 
 * @param formData The form data to submit
 * @returns Promise<Response>
 */
export async function submitForm(formData: Record<string, unknown>): Promise<Response> {
  if (!import.meta.env.VITE_FORM_SUBMIT_URL) {
    throw new Error('VITE_FORM_SUBMIT_URL is not defined in environment');
  }

  return authenticatedPost(import.meta.env.VITE_FORM_SUBMIT_URL, formData);
}

/**
 * Create a checkout session
 * 
 * @returns Promise<{ url: string; id: string; case_id: string }>
 */
export async function createCheckoutSession(): Promise<{
  url: string;
  id: string;
  case_id: string;
}> {
  if (!import.meta.env.VITE_CREATE_CHECKOUT_URL) {
    throw new Error('VITE_CREATE_CHECKOUT_URL is not defined in environment');
  }

  const response = await authenticatedPost(
    import.meta.env.VITE_CREATE_CHECKOUT_URL,
    {}
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Create checkout failed: ${response.status} ${text}`);
  }

  return response.json();
}

/**
 * Helper to check if a response is ok and throw if not
 * 
 * @param response The response to check
 * @returns Promise<Response> The same response if ok
 * @throws Error if response is not ok
 */
export async function assertResponseOk(response: Response): Promise<Response> {
  if (!response.ok) {
    const text = await response.text().catch(() => 'No response body');
    throw new Error(`Request failed: ${response.status} ${response.statusText} - ${text}`);
  }
  
  return response;
}
