/*
 * Normalização dos três campos do medidor de velocidade (Fase 4 do
 * PLANO-verificacao-radar-inmetro.md). O que sai daqui é o que a RPC
 * `verificar_medidor` vai comparar por igualdade com a base do INMETRO, então
 * cada regra foi conferida contra as 3.346 faixas do RJ em 24/09/2026.
 *
 * `supabase/functions/form-submit/index.ts` repete estas regras — a Edge não
 * importa de `src/`. Mudou aqui, mude lá.
 */

/*
 * Nº de série: só caixa alta e sem espaços. Hífen, barra e zero à esquerda
 * FAZEM PARTE do número — a base tem `0001/2019`, `0272` e, como aparelhos
 * distintos, `FSC-S3924` e `FSCS3924`. Tirar o hífen colidiria os dois.
 */
export function normalizarNumeroSerie(valor: string | null | undefined): string | null {
  return (valor ?? '').toUpperCase().replace(/\s+/g, '') || null
}

/* Nº INMETRO e nº do certificado: na base são só dígitos (6 a 8). */
export function normalizarNumeroDigitos(valor: string | null | undefined): string | null {
  return (valor ?? '').replace(/\D/g, '') || null
}
