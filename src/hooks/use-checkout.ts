import { useCallback, useEffect, useRef, useState } from 'react';
import { createCheckout, CheckoutError, type CheckoutErrorCode } from '../lib/checkout';
import { usePromoExpirada } from './use-promo';

/*
 * O checkout, fora da página que o dispara (spec 2026-10-07, §9): desde o
 * questionário de triagem, quem abre o pagamento é a tela de resumo, não a home.
 * A lógica é a que a home tinha, sem a noção de "origem" (um botão só).
 */

/**
 * Teto de espera do checkout. Acima disso a rede provavelmente morreu em
 * silêncio: sem este relógio, o botão fica travado em "Abrindo pagamento…"
 * indefinidamente e o usuário não tem como sair do estado.
 */
const TIMEOUT_CHECKOUT_MS = 15000;

/**
 * Uma frase por causa. Nenhuma delas mostra status HTTP, corpo de resposta ou
 * nome de variável: o técnico vai para o console, o usuário recebe o que
 * aconteceu e o que fazer.
 */
const MENSAGEM_POR_CAUSA: Record<CheckoutErrorCode, string> = {
  config: 'O pagamento está indisponível no momento.',
  offline: 'Parece que você está sem internet.',
  timeout: 'O pagamento demorou demais para responder.',
  server: 'O sistema de pagamento não respondeu como esperado.',
  response: 'O sistema de pagamento não devolveu o link de pagamento.',
  unknown: 'Algo deu errado no caminho.'
};

function mensagemDaFalha(erro: unknown): string {
  if (erro instanceof DOMException && erro.name === 'TimeoutError') {
    return MENSAGEM_POR_CAUSA.timeout;
  }
  if (erro instanceof CheckoutError) {
    return MENSAGEM_POR_CAUSA[erro.code] ?? MENSAGEM_POR_CAUSA.unknown;
  }
  return MENSAGEM_POR_CAUSA.unknown;
}

export type EstadoCheckout =
  | { fase: 'ocioso' }
  | { fase: 'enviando' }
  | { fase: 'erro'; mensagem: string; tentativas: number };

export function useCheckout(aoCriarCaso?: (caseId: string) => void) {
  const isPromoExpired = usePromoExpirada();
  const [estado, setEstado] = useState<EstadoCheckout>({ fase: 'ocioso' });
  const abortRef = useRef<AbortController | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const montadoRef = useRef(true);
  /**
   * Trava de reentrância. Precisa ser ref, não estado: os dois toques de um
   * duplo clique caem no mesmo tick, antes do React re-renderizar, e um teste
   * com o estado deixou as duas chamadas passarem — dois `case_id`, duas
   * sessões Stripe.
   */
  const emVooRef = useRef(false);
  // Falhas seguidas. Zera no sucesso; a partir da segunda, oferecemos suporte.
  const tentativasRef = useRef(0);

  // Requisição pendente não sobrevive à saída da página: aborta o fetch e mata o relógio.
  useEffect(() => {
    montadoRef.current = true;
    return () => {
      montadoRef.current = false;
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
      abortRef.current?.abort();
    };
  }, []);

  const iniciar = useCallback(async () => {
    // O `disabled` do botão barra o segundo toque só depois do render; esta
    // trava barra no mesmo tick. Cada chamada que passa cria um `case_id` e
    // uma sessão Stripe a mais.
    if (emVooRef.current) return;
    emVooRef.current = true;

    setEstado({ fase: 'enviando' });

    const controller = new AbortController();
    abortRef.current = controller;

    // O relógio vale para a operação inteira, não só para o `fetch`: antes
    // dele `createCheckout` ainda espera os headers do Supabase, que o `signal`
    // não alcança. Sem esta corrida, um Auth pendurado trava o botão em
    // "Abrindo pagamento…" para sempre.
    const expirou = new Promise<never>((_, reject) => {
      timeoutRef.current = window.setTimeout(() => {
        controller.abort(new DOMException('Tempo esgotado', 'TimeoutError'));
        reject(new DOMException('Tempo esgotado', 'TimeoutError'));
      }, TIMEOUT_CHECKOUT_MS);
    });

    try {
      await Promise.race([
        createCheckout(isPromoExpired ? 'full' : 'promo', { signal: controller.signal, aoCriarCaso }),
        expirou
      ]);
      // Sucesso é sair da página. O botão fica em "Abrindo pagamento…" de
      // propósito até o navegador navegar: nada de voltar a "clicável".
      tentativasRef.current = 0;
    } catch (erro) {
      // Só a falha destrava: no sucesso o navegador está saindo da página, e
      // reabrir o botão nesse intervalo é convidar uma segunda sessão Stripe.
      emVooRef.current = false;

      // Abortado pela desmontagem: não há mais interface para avisar.
      if (!montadoRef.current) return;
      if (erro instanceof DOMException && erro.name === 'AbortError') return;

      tentativasRef.current += 1;
      setEstado({ fase: 'erro', mensagem: mensagemDaFalha(erro), tentativas: tentativasRef.current });
    } finally {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      abortRef.current = null;
    }
  }, [isPromoExpired, aoCriarCaso]);

  return { estado, enviando: estado.fase === 'enviando', iniciar };
}
