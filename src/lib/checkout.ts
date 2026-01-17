import { getAuthHeaders, ensureAnonymousSession } from './auth';

/**
 * Create a Stripe checkout session and redirect to payment
 * @returns Promise<string | null> The checkout URL
 */
export async function createCheckout(): Promise<string | null> {
  if (!import.meta.env.VITE_CREATE_CHECKOUT_URL) {
    throw new Error('VITE_CREATE_CHECKOUT_URL is not defined in environment');
  }

  try {
    // Ensure we have a valid session (create anonymous if needed)
    const session = await ensureAnonymousSession();
    
    if (!session) {
      console.warn('No session available, proceeding without auth token');
    }

    // Get authorization headers with bearer token
    const headers = await getAuthHeaders();

    // Make the checkout request
    const res = await fetch(import.meta.env.VITE_CREATE_CHECKOUT_URL as string, {
      method: 'POST',
      headers,
      body: JSON.stringify({})
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Create checkout failed: ${res.status} ${text}`);
    }

    const data = await res.json();
    const caseId: string | null =
      data?.case_id ??
      data?.checkout_session?.metadata?.case_id ??
      null;

    const stripeSessionId: string | null = data?.stripe_session_id ?? null;

    if (caseId) {
      try {
        localStorage.setItem('case_id', caseId);
      } catch (err) {
        console.warn('Failed to persist case_id locally:', err);
      }
    }

    if (stripeSessionId) {
      try {
        localStorage.setItem('stripe_session_id', stripeSessionId);
      } catch (err) {
        console.warn('Failed to persist stripe_session_id locally:', err);
      }
    }

    const url = data?.checkout_session?.url ?? data?.url ?? null;

    if (url) {
      // Redirect to Stripe checkout
      window.location.href = url;
      return url;
    }

    throw new Error('No checkout URL returned from create-checkout-session');
  } catch (error) {
    console.error('Checkout error:', error);
    throw error;
  }
}
