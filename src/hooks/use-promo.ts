import { useSyncExternalStore } from 'react';

/**
 * Estado da promoção de lançamento.
 *
 * O prazo é gravado na sessão no primeiro carregamento e o relógio vive **fora
 * do React**, num único intervalo compartilhado. A versão anterior era um hook
 * com estado próprio: cada consumidor montava o seu `setInterval`, e a home
 * tinha três (`Home`, `ComoFunciona`, `Countdown`). Como `Home` lê um valor
 * derivado de `msLeft`, cada tique re-renderizava a página inteira — a réplica
 * do auto, a trilha, a prévia da peça, o FAQ e o rodapé, nenhum memoizado —
 * uma vez por segundo, durante trinta minutos.
 *
 * Agora há um relógio só, e `useSyncExternalStore` corta o re-render na
 * origem: quem chama `usePromoExpirada()` recebe um booleano que fica `false`
 * por trinta minutos, e o React descarta o re-render por igualdade. Só o
 * `Countdown`, que precisa do segundo, re-renderiza a cada segundo.
 *
 * Expirar **não** encerra a venda: o preço deixa de ser promocional e o CTA
 * continua ativo (ver `Home`).
 */
const PROMO_DURATION_MS = 30 * 60 * 1000;
const STORAGE_KEY = 'promo_expires_at';

let expiraEm: number | null = null;

function resolverExpiracao(): number {
  if (expiraEm !== null) return expiraEm;

  const padrao = Date.now() + PROMO_DURATION_MS;
  try {
    const guardado = sessionStorage.getItem(STORAGE_KEY);
    if (guardado) {
      const lido = parseInt(guardado, 10);
      if (Number.isFinite(lido)) {
        expiraEm = lido;
        return expiraEm;
      }
    }
    sessionStorage.setItem(STORAGE_KEY, padrao.toString());
  } catch {
    // sessionStorage bloqueado (modo privado): a promoção vale só nesta aba.
  }

  expiraEm = padrao;
  return expiraEm;
}

const ouvintes = new Set<() => void>();
let intervalo: ReturnType<typeof setInterval> | null = null;
let restante = 0;

function calcular(): number {
  return Math.max(0, resolverExpiracao() - Date.now());
}

function tique() {
  const novo = calcular();
  if (novo === restante) return;
  restante = novo;
  if (restante === 0 && intervalo !== null) {
    clearInterval(intervalo);
    intervalo = null;
  }
  for (const ouvinte of ouvintes) ouvinte();
}

/**
 * `getSnapshot` roda no primeiro render, antes de `assinar`, e precisa devolver
 * sempre o mesmo valor enquanto nada mudou — calcular na hora entregaria um
 * número novo a cada leitura e o React entraria em laço. Daí o primeiro cálculo
 * ficar aqui, uma vez só; depois disso quem escreve é o intervalo.
 */
let iniciado = false;
function garantirInicio() {
  if (iniciado) return;
  iniciado = true;
  restante = calcular();
}

function assinar(aoMudar: () => void): () => void {
  garantirInicio();
  if (ouvintes.size === 0 && restante > 0 && intervalo === null) {
    intervalo = setInterval(tique, 1000);
  }
  ouvintes.add(aoMudar);

  return () => {
    ouvintes.delete(aoMudar);
    // O último a sair apaga a luz: sem isto o relógio seguiria correndo depois
    // de o usuário navegar para o formulário.
    if (ouvintes.size === 0 && intervalo !== null) {
      clearInterval(intervalo);
      intervalo = null;
    }
  };
}

const lerRestante = () => {
  garantirInicio();
  return restante;
};
const lerExpirada = () => {
  garantirInicio();
  return restante <= 0;
};

/** Milissegundos restantes. Re-renderiza a cada segundo — use só no cronômetro. */
export function usePromo() {
  const msLeft = useSyncExternalStore(assinar, lerRestante, () => 0);
  return { msLeft, isExpired: msLeft <= 0 };
}

/**
 * Só se a promoção acabou. Re-renderiza **uma vez**, na virada: o snapshot é um
 * booleano, e o React descarta os outros 1799 tiques por igualdade.
 */
export function usePromoExpirada(): boolean {
  return useSyncExternalStore(assinar, lerExpirada, () => false);
}

export default usePromo;
