// Núcleo de parsing do PSIE/INMETRO — puro, sem I/O.
// Mora em scripts/lib/ e não em supabase/functions/_shared/ porque nenhuma
// Edge Function o consome: a Edge de ingestão foi descartada pela §5.1.2 do
// PLANO-verificacao-radar-inmetro.md (o RBMLQ recusa o IP de saída da Supabase).
// Escrito só com APIs que Node e Deno compartilham, para que mover seja barato.

export const UF_ALVO = 'RJ'

/** "12/07/2024" -> "2024-07-12". Qualquer outra coisa -> null. */
export function parseBrDate(s?: string | null): string | null {
  if (typeof s !== 'string') return null
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s.trim())
  if (!m) return null
  const dia = Number(m[1])
  const mes = Number(m[2])
  const ano = Number(m[3])
  // Date normaliza 31/02 para 03/03; comparar de volta é o que rejeita data impossível.
  const d = new Date(Date.UTC(ano, mes - 1, dia))
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) {
    return null
  }
  return `${m[3]}-${m[2]}-${m[1]}`
}

/** Inteiro, ou null. "0" vira null: a origem usa 0 para "não informado". */
export function parseIntOrNull(s?: string | null): number | null {
  if (typeof s !== 'string') return null
  const t = s.trim()
  if (t === '') return null
  if (!/^-?\d+$/.test(t)) return null
  const n = Number(t)
  return n === 0 ? null : n
}

/**
 * Mapa de resultado da §5.4 do plano.
 * REGRA INVIOLÁVEL: qualquer valor desconhecido é `indeterminado`, nunca
 * `nao_conforme`. Afirmar "não conforme" sem base é o erro que cria problema
 * numa peça protocolada.
 */
export function classificarResultado(
  r?: string | null,
): 'conforme' | 'nao_conforme' | 'indeterminado' {
  const t = (r ?? '').trim().toLowerCase()
  if (t === 'aprovado') return 'conforme'
  if (t === 'reprovado') return 'nao_conforme'
  return 'indeterminado'
}
