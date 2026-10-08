/*
 * Respostas do questionário de triagem (spec 2026-10-07, §6.1). Vivem no
 * navegador: `questionario_atual` enquanto o cliente responde, copiadas para
 * `questionario_<case_id>` no clique para pagar (duas compras seguidas nunca
 * trocam respostas) e apagadas depois do envio do formulário. Toda função recebe
 * o armazenamento por parâmetro: bloqueado ou cheio, nada lança, e o fluxo segue.
 */
import { consideradaMaiorQueAferida } from './velocidade.ts'

export type Armazenamento = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export type RespostasQuestionario = {
  versao_formato: 1
  estagio: string
  data_limite: string
  cliente_conduzia: '' | 'sim' | 'nao'
  multa_de_radar: '' | 'sim' | 'nao'
  amparo_legal: string
  velocidade_permitida: string
  velocidade_aferida: string
  velocidade_considerada: string
  versao: '' | 'propria' | 'sem_versao'
  justificativa: string
}

export const RESPOSTAS_VAZIAS: RespostasQuestionario = {
  versao_formato: 1, estagio: '', data_limite: '', cliente_conduzia: '', multa_de_radar: '',
  amparo_legal: '', velocidade_permitida: '', velocidade_aferida: '', velocidade_considerada: '',
  versao: '', justificativa: '',
}

export const CHAVE_ATUAL = 'questionario_atual'
export const chaveDoCaso = (caseId: string) => `questionario_${caseId}`

export function armazenamentoDoNavegador(): Armazenamento | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

const OPCOES: Partial<Record<keyof RespostasQuestionario, readonly string[]>> = {
  cliente_conduzia: ['', 'sim', 'nao'],
  multa_de_radar: ['', 'sim', 'nao'],
  versao: ['', 'propria', 'sem_versao'],
}

function valido(o: unknown): o is RespostasQuestionario {
  if (!o || typeof o !== 'object') return false
  const r = o as Record<string, unknown>
  if (r.versao_formato !== 1) return false
  for (const chave of Object.keys(RESPOSTAS_VAZIAS) as (keyof RespostasQuestionario)[]) {
    if (chave === 'versao_formato') continue
    if (typeof r[chave] !== 'string') return false
    const opcoes = OPCOES[chave]
    if (opcoes && !opcoes.includes(r[chave] as string)) return false
  }
  return true
}

export function lerRespostas(arm: Armazenamento | null, chave: string): RespostasQuestionario | null {
  if (!arm) return null
  try {
    const cru = arm.getItem(chave)
    if (!cru) return null
    const o = JSON.parse(cru)
    return valido(o) ? { ...RESPOSTAS_VAZIAS, ...o } : null
  } catch {
    return null
  }
}

export function gravarRespostas(arm: Armazenamento | null, chave: string, r: RespostasQuestionario): boolean {
  if (!arm) return false
  try {
    arm.setItem(chave, JSON.stringify(r))
    return true
  } catch {
    return false
  }
}

export function vincularAoCaso(arm: Armazenamento | null, caseId: string): boolean {
  const atual = lerRespostas(arm, CHAVE_ATUAL)
  return atual ? gravarRespostas(arm, chaveDoCaso(caseId), atual) : false
}

export function apagarRespostas(arm: Armazenamento | null, caseId: string): void {
  if (!arm) return
  for (const chave of [chaveDoCaso(caseId), CHAVE_ATUAL]) {
    try {
      arm.removeItem(chave)
    } catch {
      /* bloqueado: nada a apagar */
    }
  }
}

const dois = (n: number) => String(n).padStart(2, '0')

/** A data de hoje no relógio local — nunca `toISOString()`, que é UTC. */
export function hojeLocal(agora: Date): string {
  return `${agora.getFullYear()}-${dois(agora.getMonth() + 1)}-${dois(agora.getDate())}`
}

function diaUtc(data: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return null
  const [a, m, d] = data.split('-').map(Number)
  const t = Date.UTC(a, m - 1, d)
  const dt = new Date(t)
  return dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? t : null
}

/** Dias de hoje até a data-limite: 0 é hoje (ainda vale), negativo é vencido, null é inválida. */
export function diasAteDataLimite(dataLimite: string, agora: Date): number | null {
  const limite = diaUtc(dataLimite)
  const hoje = diaUtc(hojeLocal(agora))
  if (limite === null || hoje === null) return null
  return Math.round((limite - hoje) / 86_400_000)
}

export function erroDoPasso(passo: 1 | 2 | 3 | 4 | 5, r: RespostasQuestionario): string | null {
  switch (passo) {
    case 1:
      return r.estagio ? null : 'Escolha o estágio do seu caso.'
    case 2:
      return diaUtc(r.data_limite) !== null ? null : 'Informe a data que está impressa na notificação.'
    case 3:
      return r.cliente_conduzia ? null : 'Marque uma das opções.'
    case 4:
      if (!r.multa_de_radar) return 'Marque uma das opções.'
      if (r.multa_de_radar === 'sim' && consideradaMaiorQueAferida(r.velocidade_aferida, r.velocidade_considerada)) {
        return 'A velocidade considerada não pode ser maior que a aferida. Confira os números no auto.'
      }
      return null
    case 5:
      if (!r.versao) return 'Escolha uma das opções.'
      if (r.versao === 'propria' && !r.justificativa.trim()) {
        return 'Conte o que aconteceu ou escolha a defesa pelos dados do auto.'
      }
      return null
  }
}

export type CamposDoQuestionarioNoFormulario = {
  estagio: string; data_limite: string; cliente_conduzia: string; amparoLegal: string
  velocidade_permitida: string; velocidade_aferida: string; velocidade_considerada: string
  versao: string; justificativa: string
}

/** Os nomes são os do `FormData` de `Form.tsx`. */
export function paraCamposDoFormulario(r: RespostasQuestionario): CamposDoQuestionarioNoFormulario {
  return {
    estagio: r.estagio,
    data_limite: r.data_limite,
    cliente_conduzia: r.cliente_conduzia,
    amparoLegal: r.amparo_legal,
    velocidade_permitida: r.velocidade_permitida,
    velocidade_aferida: r.velocidade_aferida,
    velocidade_considerada: r.velocidade_considerada,
    versao: r.versao,
    justificativa: r.versao === 'propria' ? r.justificativa : '',
  }
}

/** O rascunho do formulário é mais recente e prevalece — mas só campo preenchido:
 *  um rascunho de antes do questionário não apaga as respostas com ''. */
export function mesclarComRascunho<T extends object>(base: T, rascunho: Partial<T> | null): T {
  if (!rascunho) return base
  const saida = { ...base }
  for (const [k, v] of Object.entries(rascunho)) {
    if (typeof v === 'string' && v !== '') (saida as Record<string, unknown>)[k] = v
  }
  return saida
}
