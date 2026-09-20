/**
 * O preço aparece em quatro lugares da home (hero, trilha, faixa de fechamento
 * e barra fixa). Antes, a trilha cravava "R$ 19,99" em texto fixo e continuava
 * afirmando isso depois da promoção expirar, contradizendo a oferta na mesma
 * tela. Uma constante só, um valor só.
 *
 * A faixa cobrada de fato é decidida pela Edge Function; estes literais são a
 * apresentação dela. Ao mexer em `STRIPE_PRICE_ID`/`STRIPE_PRICE_ID_FULL`,
 * mexa aqui junto.
 */
export const PRECO_PROMO = 'R$ 19,99';
export const PRECO_CHEIO = 'R$ 39,99';

/** O valor exibido para o estado atual da promoção. */
export function precoVigente(promoExpirada: boolean): string {
  return promoExpirada ? PRECO_CHEIO : PRECO_PROMO;
}
