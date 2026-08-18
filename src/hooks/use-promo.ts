import { useEffect, useState } from 'react';

/**
 * Estado da promoção de lançamento.
 *
 * O prazo é gravado na sessão no primeiro carregamento e compartilhado por
 * todos os consumidores — antes, `Countdown` e `Home` mantinham dois
 * intervalos independentes lendo a mesma chave e podiam discordar por um
 * segundo. Expirar **não** encerra a venda: o preço deixa de ser promocional
 * e o CTA continua ativo (ver `Home`).
 */
const PROMO_DURATION_MS = 30 * 60 * 1000;
const STORAGE_KEY = 'promo_expires_at';

function resolveExpiration(): number {
  const fallback = Date.now() + PROMO_DURATION_MS;

  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = parseInt(stored, 10);
      if (Number.isFinite(parsed)) return parsed;
    }
    sessionStorage.setItem(STORAGE_KEY, fallback.toString());
  } catch {
    // sessionStorage bloqueado (modo privado): a promoção vale só nesta página.
  }

  return fallback;
}

export function usePromo() {
  const [expiresAt] = useState(resolveExpiration);
  const [msLeft, setMsLeft] = useState(() => Math.max(0, expiresAt - Date.now()));

  useEffect(() => {
    if (Date.now() >= expiresAt) {
      setMsLeft(0);
      return;
    }

    const interval = setInterval(() => {
      const remaining = Math.max(0, expiresAt - Date.now());
      setMsLeft(remaining);
      if (remaining === 0) clearInterval(interval);
    }, 1000);

    return () => clearInterval(interval);
  }, [expiresAt]);

  return { msLeft, isExpired: msLeft <= 0 };
}

export default usePromo;
