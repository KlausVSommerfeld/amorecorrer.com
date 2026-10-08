/*
 * Diagnóstico do questionário (spec 2026-10-07, §7): o espelho, em TypeScript, da
 * decisão que o pipeline toma sobre a velocidade — `parse_ref`
 * (CTB-compilado_files/consulta.py) para ler o enquadramento e
 * `velocidade.bloco_velocidade` (pipeline/velocidade.py) para a situação. A
 * paridade é garantida por tests/compartilhados/velocidade.json, rodado aqui e em
 * pipeline/test_diagnostico_paridade.py: quem mudar um lado muda o outro.
 */

export type Inciso = 'I' | 'II' | 'III'
export type SituacaoVelocidade = 'sem_infracao' | 'desclassificacao' | null

export type EntradaVelocidade = {
  amparo_legal: string
  velocidade_permitida: string | number | null
  velocidade_aferida: string | number | null
  velocidade_considerada: string | number | null
}

export type Diagnostico = {
  tipo: 'arquivamento' | 'desclassificacao' | 'neutro_advertencia' | 'neutro'
  texto: string
  destaque: string | null
  complemento: string | null
}

const GRAVIDADE: Record<Inciso, number> = { I: 1, II: 2, III: 3 }

// Mesma gramática de parse_ref: o inciso é romano em maiúsculas (sem /i), a alínea
// é uma letra minúscula solta; parágrafo, alínea ou item no art. 218 não existem.
// O `\b` do JS só conhece ASCII ("m" de "máxima" vira palavra solta); o do Python
// é Unicode. Por isso os limites de palavra são lookarounds com \p{L} (revisão final).
const REF_RE = /^\s*(?:art(?:igo)?\.?\s*)?(\d+)\s*[ºo°]?\s*(?:-\s*([A-Z]))?\s*[.,;]?\s*(.*)$/i
const PARAGRAFO = /par[áa]grafo\s+[úu]nico|p\.\s*[úu]nico|(?:§|par[áa]grafo)\s*\d+/i
const INCISO = /(?:inciso\s+)?(?<![\p{L}\p{N}_])([IVXLC]+)(?![\p{L}\p{N}_])(?:-([A-Z])(?![\p{L}\p{N}_]))?/u
const ALINEA = /(?:al[íi]nea\s+)?["'“]?(?<![\p{L}\p{N}_])([a-z])(?![\p{L}\p{N}_])["'”)]?/u
const ITEM = /item\s+\d+/i

export function enquadramento218(amparo: string): string | null {
  const m = REF_RE.exec(amparo ?? '')
  if (!m || m[1] !== '218' || m[2]) return null
  let resto = m[3]
  if (PARAGRAFO.test(resto)) return null
  let inciso: string | null = null
  const im = INCISO.exec(resto)
  if (im) {
    if (im[2]) return null
    inciso = im[1]
    resto = resto.slice(im.index + im[0].length)
  }
  if (ALINEA.test(resto) || ITEM.test(resto)) return null
  if (inciso === null) return 'art. 218'
  return inciso === 'I' || inciso === 'II' || inciso === 'III' ? `art. 218, ${inciso}` : null
}

function inteiro(v: string | number | null | undefined): number | null {
  if (typeof v === 'number') return Number.isInteger(v) && v > 0 ? v : null
  if (typeof v === 'string' && /^\s*\d+\s*$/.test(v)) {
    const n = parseInt(v, 10)
    return n > 0 ? n : null
  }
  return null
}

/** Limites do art. 218, em aritmética exata: I até 20%; II acima de 20% até 50%; III acima de 50%. */
function incisoPelaVelocidade(permitida: number, considerada: number): Inciso | null {
  const d = 100 * (considerada - permitida)
  if (d <= 0) return null
  if (d <= 20 * permitida) return 'I'
  if (d <= 50 * permitida) return 'II'
  return 'III'
}

export function situacaoDaVelocidade(e: EntradaVelocidade): {
  situacao: SituacaoVelocidade
  inciso_do_auto: Inciso | null
  inciso_da_conta: Inciso | null
} {
  const enq = enquadramento218(e.amparo_legal)
  const doAuto = enq && enq !== 'art. 218' ? (enq.slice('art. 218, '.length) as Inciso) : null
  const nada = { situacao: null, inciso_do_auto: doAuto, inciso_da_conta: null }
  if (!enq) return nada
  const permitida = inteiro(e.velocidade_permitida)
  const considerada = inteiro(e.velocidade_considerada)
  if (permitida === null || considerada === null) return nada
  const aferida = inteiro(e.velocidade_aferida)
  if (aferida !== null && considerada > aferida) return nada
  const daConta = incisoPelaVelocidade(permitida, considerada)
  if (daConta === null) return { situacao: 'sem_infracao', inciso_do_auto: doAuto, inciso_da_conta: null }
  if (doAuto && GRAVIDADE[doAuto] > GRAVIDADE[daConta]) {
    return { situacao: 'desclassificacao', inciso_do_auto: doAuto, inciso_da_conta: daConta }
  }
  return nada
}

export function diagnostico(e: EntradaVelocidade & { cliente_conduzia: '' | 'sim' | 'nao' }): Diagnostico {
  const s = situacaoDaVelocidade(e)
  const advertencia =
    e.cliente_conduzia === 'nao'
      ? 'a advertência no lugar da multa, caso você venha a ser considerado responsável'
      : 'a advertência no lugar da multa'

  if (s.situacao === 'sem_infracao') {
    return {
      tipo: 'arquivamento',
      texto: 'A defesa pede o arquivamento do auto: a velocidade considerada no próprio auto não passa da permitida.',
      destaque: 'Pelos números do seu auto, este é o pedido com mais chance de ser aceito.',
      complemento: null,
    }
  }
  if (s.situacao === 'desclassificacao' && s.inciso_da_conta) {
    const comAdvertencia = s.inciso_da_conta === 'I'
    return {
      tipo: 'desclassificacao',
      texto:
        'A defesa pede, em ordem: (a) o arquivamento do auto; (b) se ele for negado, a desclassificação ' +
        `para o inciso ${s.inciso_da_conta} do art. 218${comAdvertencia ? `; (c) ${advertencia}` : ''}.`,
      destaque:
        'Pelos números do seu auto, o pedido com mais chance de ser aceito é a desclassificação — os outros ' +
        'continuam no pedido e podem ser acolhidos.',
      complemento: comAdvertencia
        ? 'Se você não teve outra infração nos últimos 12 meses, depois da desclassificação cabe ainda a advertência (art. 267).'
        : null,
    }
  }
  if (s.inciso_do_auto === 'I') {
    return {
      tipo: 'neutro_advertencia',
      texto: `A defesa pede, em ordem: (a) o arquivamento do auto; (b) ${advertencia}.`,
      destaque:
        'Se você não teve outra infração nos últimos 12 meses, a advertência é o pedido com mais chance de ser ' +
        'aceito — a lei diz que ela deverá ser aplicada nesse caso (art. 267) —, e o arquivamento continua no pedido.',
      complemento: null,
    }
  }
  return {
    tipo: 'neutro',
    texto: 'A defesa pede o arquivamento do auto, com base na consistência do auto e nos requisitos que a lei exige dele.',
    destaque: null,
    complemento: null,
  }
}
