// Núcleo de parsing do PSIE/INMETRO — puro, sem I/O.
// Mora em scripts/lib/ e não em supabase/functions/_shared/ porque nenhuma
// Edge Function o consome: a Edge de ingestão foi descartada pela §5.1.2 do
// PLANO-verificacao-radar-inmetro.md (o RBMLQ recusa o IP de saída da Supabase).
// Escrito só com APIs que Node e Deno compartilham, para que mover seja barato.

export interface PsieFaixa {
  NumeroFaixa?: string | null
  NumeroInmetro?: string | null
  NumeroSerie?: string | null
  /** Vem `null` em registros reais (3 no fixture). Entra na PK, então nunca pode virar NULL no banco. */
  Sentido?: string | null
  VelocidadeNominal?: string | null
}

export interface PsieHistorico {
  NumeroCertificado?: string | null
  NumeroEnsaio?: string | null
  Ano?: string | null
  DataLaudo?: string | null
  DataValidade?: string | null
  TipoServico?: string | null
  Resultado?: string | null
}

export interface PsieRecord {
  SiglaUf?: string | null
  Estado?: string | null
  Municipio?: string | null
  LocalVerificacao?: string | null
  DataUltimaVerificacao?: string | null
  DataValidade?: string | null
  UltimoResultado?: string | null
  TipoMedidor?: string | null
  Faixas?: PsieFaixa[] | null
  Historico?: PsieHistorico[] | null
  Proprietario?: string | null
}

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

/**
 * Identidade derivada (§5.3 do plano). O dataset não tem chave primária.
 *
 * sha256( SiglaUf | Municipio | LocalVerificacao | série_1 | série_2 | … )[:32]
 * com as séries únicas, não vazias e ordenadas — a ordenação é o que torna o id
 * invariante à ordem do array Faixas.
 *
 * RISCO ACEITO: se o INMETRO corrigir a grafia de LocalVerificacao, o hash muda
 * e o instrumento entra como novo. Tolerável porque o histórico vive em
 * radar_verificacoes e a consulta casa por numero_serie / numero_inmetro.
 */
export async function instrumentId(r: PsieRecord): Promise<string> {
  const series = [
    ...new Set(
      (r.Faixas ?? [])
        .map((f) => (f.NumeroSerie ?? '').trim())
        .filter((s) => s !== ''),
    ),
  ].sort()

  const base = [r.SiglaUf ?? '', r.Municipio ?? '', r.LocalVerificacao ?? '', ...series].join('|')
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(base))
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32)
}
