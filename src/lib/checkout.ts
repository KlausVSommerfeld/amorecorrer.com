export async function createCheckout(caseId: string): Promise<string | null> {
  if (!import.meta.env.VITE_CREATE_CHECKOUT_URL) {
    throw new Error('VITE_CREATE_CHECKOUT_URL is not defined in environment');
  }

  const payload = { case_id: caseId };

  const res = await fetch(import.meta.env.VITE_CREATE_CHECKOUT_URL as string, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Create checkout failed: ${res.status} ${text}`);
  }

  const data = await res.json();

  // Expecting { checkout_session: { url: string } } or { url: string }
  const url = data?.checkout_session?.url ?? data?.url ?? null;

  if (url) {
    // Redirect the user to the Stripe Checkout page
    // Use location.href so it works in SPA context
    window.location.href = url;
    return url;
  }

  throw new Error('No checkout URL returned from create-checkout-session');
}
