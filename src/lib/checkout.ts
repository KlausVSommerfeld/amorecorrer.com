import { getAuthHeaders } from './auth';

/** Faixa de preço pedida ao backend. Ver `create-checkout-session`. */
export type PricingTier = 'promo' | 'full';

/**
 * Causa da falha, para que a interface escolha a mensagem sem precisar ler
 * (nem exibir) o texto técnico. O usuário nunca vê `code` — vê a frase que a
 * Home mapeia a partir dele.
 */
export type CheckoutErrorCode =
  | 'config'   // falta VITE_CREATE_CHECKOUT_URL — erro nosso, não dele
  | 'offline'  // sem rede, ou fetch rejeitou antes de chegar ao servidor
  | 'timeout'  // a requisição foi abortada pelo relógio da UI
  | 'server'   // a Edge Function respondeu, mas não com 2xx
  | 'response' // respondeu 2xx sem devolver a URL do checkout
  | 'unknown';

export class CheckoutError extends Error {
  readonly code: CheckoutErrorCode;
  /** Erro original. Atribuído à mão: o `lib` deste projeto é anterior ao ES2022. */
  readonly cause?: unknown;

  constructor(code: CheckoutErrorCode, message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = 'CheckoutError';
    this.code = code;
    this.cause = options?.cause;
  }
}

export interface CreateCheckoutOptions {
  /**
   * Cancela a requisição em voo. A Home usa isto para dois casos: o relógio de
   * timeout e a desmontagem do componente — sem ele, um fetch pendurado deixa
   * o botão travado em "Abrindo pagamento…" para sempre.
   */
  signal?: AbortSignal;
}

/**
 * Create a Stripe checkout session and redirect to payment
 * @param pricing 'full' cobra o preço cheio (promoção expirada); o padrão é o
 *   promocional. Quem manda é o navegador — o backend confia neste campo.
 * @returns Promise<string | null> The checkout URL
 */
export async function createCheckout(
  pricing: PricingTier = 'promo',
  options: CreateCheckoutOptions = {}
): Promise<string | null> {
  const endpoint = import.meta.env.VITE_CREATE_CHECKOUT_URL as string | undefined;

  if (!endpoint) {
    throw new CheckoutError(
      'config',
      'VITE_CREATE_CHECKOUT_URL is not defined in environment'
    );
  }

  // Checagem barata antes de gastar uma ida ao Supabase Auth: se o navegador já
  // sabe que está sem rede, a mensagem certa é "sem internet", não "erro".
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new CheckoutError('offline', 'Navigator reports the client is offline');
  }

  try {
    // `getAuthHeaders()` é síncrona: a chave anônima é uma variável de ambiente,
    // e não havia sessão para consultar — o `await ensureAnonymousSession()` que
    // vinha antes daqui devolvia `null` por definição e só servia para arrastar
    // o SDK do Supabase para dentro do primeiro clique do checkout.
    const headers = getAuthHeaders();

    // Make the checkout request
    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ pricing }),
      signal: options.signal
    });

    if (!res.ok) {
      const text = await res.text();
      throw new CheckoutError(
        'server',
        `Create checkout failed: ${res.status} ${text}`
      );
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

    throw new CheckoutError(
      'response',
      'No checkout URL returned from create-checkout-session'
    );
  } catch (error) {
    // O abort é decisão de quem chamou (timeout ou desmontagem): sobe sem
    // reembrulhar e sem poluir o console, para a UI distinguir os dois casos.
    if (error instanceof DOMException && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
      throw error;
    }

    console.error('Checkout error:', error);

    if (error instanceof CheckoutError) {
      throw error;
    }

    // `fetch` rejeita com TypeError quando a requisição nem sai (DNS, CORS,
    // rede caindo no meio) — do ponto de vista do usuário, é falta de conexão.
    if (error instanceof TypeError) {
      throw new CheckoutError('offline', error.message, { cause: error });
    }

    throw new CheckoutError(
      'unknown',
      error instanceof Error ? error.message : String(error),
      { cause: error }
    );
  }
}
