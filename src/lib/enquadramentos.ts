/*
 * Lista de enquadramentos do campo de escolha (spec 2026-10-15, §4). Os itens vêm
 * de src/data/enquadramentos.json, gerado por enquadramentos/enquadramentos_parser.py
 * a partir do Anexo IV da Portaria SENATRAN 354/2022. A leitura de código é a mesma
 * de pipeline/tabela_enquadramentos.py, garantida por tests/compartilhados/codigos.json.
 */

export type Enquadramento = {
  codigo: string
  descricao: string
  dispositivo: string
  gravidade: string
}

// Ordem importa: "7455-0" antes de "745-50", e os dois antes dos cinco dígitos
// colados. As bordas impedem ler código dentro de data ou número maior.
const CODIGO = [
  /(?<!\d)(\d{4})\s?-\s?(\d)(?!\d)/,
  /(?<!\d)(\d{3})\s?-\s?(\d)(\d)(?!\d)/,
  /(?<!\d)(\d{4})(\d)(?!\d)/,
]

/** O primeiro código de enquadramento no texto, como "7455-0", ou null. */
export function lerCodigo(texto: string): string | null {
  for (const padrao of CODIGO) {
    const m = padrao.exec(texto)
    if (m) return m.length === 4 ? `${m[1]}${m[2]}-${m[3]}` : `${m[1]}-${m[2]}`
  }
  return null
}

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const palavras = (s: string) => semAcento(s).split(/[^a-z0-9]+/).filter(Boolean)

/** "art. 165-A, § 1º" → "165-A". */
export const artigoDe = (dispositivo: string) => /^art\.\s*([\dA-Z-]+)/.exec(dispositivo)?.[1] ?? ''

// "218", "165-A", "165a", "art. 218, I", "Artigo 218 inciso II do CTB".
const REFERENCIA =
  /^(?:art(?:igo)?\.?\s*)?(\d{1,3})(?:-?([a-z])(?![a-z]))?(?:\s*,?\s*(?:inciso\s+|inc\.\s*)?([ivxlc]+))?(?:\s*,?\s*do\s+ctb)?\s*$/i
const SO_CODIGO = /^[\d\s.-]+$/

export const LIMITE_DE_RESULTADOS = 30

/** "art. 218, I" é do inciso I; "art. 218, II" não. */
function doInciso(dispositivo: string, artigo: string, inciso: string): boolean {
  const prefixo = `art. ${artigo}, ${inciso}`
  return dispositivo.startsWith(prefixo) && !/^[IVXLC]/.test(dispositivo.slice(prefixo.length))
}

/**
 * Busca por código ("7455-0", "745-50", "74550", "7455"), por artigo ("218", "165-A",
 * "art. 218, I") ou por palavras da descrição, sem acento ("velocidade 20"). Ordem
 * pelo código; no máximo LIMITE_DE_RESULTADOS.
 */
export function buscarEnquadramentos(termo: string, itens: readonly Enquadramento[]): Enquadramento[] {
  const t = termo.trim()
  if (!t) return []
  const digitos = t.replace(/\D/g, '')
  const ref = REFERENCIA.exec(t)
  let achados: Enquadramento[]
  if (ref) {
    const artigo = ref[1] + (ref[2] ? `-${ref[2].toUpperCase()}` : '')
    const inciso = ref[3]?.toUpperCase()
    achados = itens.filter(
      (i) => artigoDe(i.dispositivo) === artigo && (!inciso || doInciso(i.dispositivo, artigo, inciso)),
    )
  } else if (SO_CODIGO.test(t) && digitos.length === 5) {
    const codigo = lerCodigo(digitos)
    achados = itens.filter((i) => i.codigo === codigo)
  } else if (SO_CODIGO.test(t) && digitos.length === 4) {
    achados = itens.filter((i) => i.codigo.startsWith(`${digitos}-`))
  } else {
    const codigo = lerCodigo(t)
    const busca = palavras(t)
    achados = itens.filter((i) => {
      if (codigo && i.codigo === codigo) return true
      const desc = palavras(i.descricao)
      const artigo = artigoDe(i.dispositivo).toLowerCase()
      return busca.every((p) => p === artigo || desc.some((d) => d.startsWith(p)))
    })
  }
  return [...achados].sort((a, b) => a.codigo.localeCompare(b.codigo)).slice(0, LIMITE_DE_RESULTADOS)
}
