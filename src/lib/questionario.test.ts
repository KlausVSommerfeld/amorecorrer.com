import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CHAVE_ATUAL, RESPOSTAS_VAZIAS, apagarRespostas, chaveDoCaso, diasAteDataLimite, erroDoPasso, telaInicial, textoDoPrazo,
  gravarRespostas, hojeLocal, lerRespostas, mesclarComRascunho, paraCamposDoFormulario, vincularAoCaso,
  type Armazenamento, type RespostasQuestionario,
} from './questionario.ts'
import { DEFESA_PREVIA } from './estagios.ts'

class Memoria implements Armazenamento {
  m = new Map<string, string>()
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null }
  setItem(k: string, v: string) { this.m.set(k, v) }
  removeItem(k: string) { this.m.delete(k) }
}
class Quebrado implements Armazenamento {
  getItem(): string | null { throw new Error('bloqueado') }
  setItem(): void { throw new Error('bloqueado') }
  removeItem(): void { throw new Error('bloqueado') }
}

const R: RespostasQuestionario = {
  ...RESPOSTAS_VAZIAS, estagio: DEFESA_PREVIA, data_limite: '2026-10-30', cliente_conduzia: 'sim',
  multa_de_radar: 'sim', amparo_legal: 'Art. 218, II', velocidade_permitida: '80',
  velocidade_aferida: '91', velocidade_considerada: '84', versao: 'propria', justificativa: 'Não vi a placa.',
}

test('gravar e ler a resposta atual', () => {
  const a = new Memoria()
  assert.equal(gravarRespostas(a, CHAVE_ATUAL, R), true)
  assert.deepEqual(lerRespostas(a, CHAVE_ATUAL), R)
})

test('vincular copia para a chave do caso e mantém a atual (voltar do Stripe sem pagar)', () => {
  const a = new Memoria()
  gravarRespostas(a, CHAVE_ATUAL, R)
  assert.equal(vincularAoCaso(a, 'CASO_1', R), true)
  assert.deepEqual(lerRespostas(a, chaveDoCaso('CASO_1')), R)
  assert.deepEqual(lerRespostas(a, CHAVE_ATUAL), R)
})

test('duas compras seguidas não misturam respostas', () => {
  const a = new Memoria()
  gravarRespostas(a, CHAVE_ATUAL, R)
  vincularAoCaso(a, 'CASO_A', lerRespostas(a, CHAVE_ATUAL)!)
  gravarRespostas(a, CHAVE_ATUAL, { ...R, justificativa: 'Outra história.' })
  vincularAoCaso(a, 'CASO_B', lerRespostas(a, CHAVE_ATUAL)!)
  assert.equal(lerRespostas(a, chaveDoCaso('CASO_A'))!.justificativa, 'Não vi a placa.')
  assert.equal(lerRespostas(a, chaveDoCaso('CASO_B'))!.justificativa, 'Outra história.')
})

test('apagar remove a do caso e a atual', () => {
  const a = new Memoria()
  gravarRespostas(a, CHAVE_ATUAL, R)
  vincularAoCaso(a, 'CASO_1', R)
  apagarRespostas(a, 'CASO_1')
  assert.equal(lerRespostas(a, chaveDoCaso('CASO_1')), null)
  assert.equal(lerRespostas(a, CHAVE_ATUAL), null)
})

test('armazenamento bloqueado ou ausente nunca lança', () => {
  for (const a of [new Quebrado(), null]) {
    assert.equal(gravarRespostas(a, CHAVE_ATUAL, R), false)
    assert.equal(lerRespostas(a, CHAVE_ATUAL), null)
    assert.equal(vincularAoCaso(a, 'CASO_1', R), false)
    assert.doesNotThrow(() => apagarRespostas(a, 'CASO_1'))
  }
})

test('objeto de outra versão ou malformado é descartado', () => {
  const a = new Memoria()
  a.setItem(CHAVE_ATUAL, JSON.stringify({ ...R, versao_formato: 2 }))
  assert.equal(lerRespostas(a, CHAVE_ATUAL), null)
  a.setItem(CHAVE_ATUAL, '{quebrado')
  assert.equal(lerRespostas(a, CHAVE_ATUAL), null)
  a.setItem(CHAVE_ATUAL, JSON.stringify({ ...R, cliente_conduzia: 'talvez' }))
  assert.equal(lerRespostas(a, CHAVE_ATUAL), null)
})

test('hoje é a data local, não a UTC (23h30 em Brasília ainda é o mesmo dia)', () => {
  const noite = new Date(2026, 9, 30, 23, 30)
  assert.equal(hojeLocal(noite), '2026-10-30')
  assert.equal(diasAteDataLimite('2026-10-30', noite), 0)
})

test('dias até a data-limite: hoje vale, ontem venceu, inválida é null', () => {
  const agora = new Date(2026, 9, 8, 10, 0)
  assert.equal(diasAteDataLimite('2026-10-30', agora), 22)
  assert.equal(diasAteDataLimite('2026-10-08', agora), 0)
  assert.equal(diasAteDataLimite('2026-10-07', agora), -1)
  assert.equal(diasAteDataLimite('2026-02-30', agora), null)
  assert.equal(diasAteDataLimite('', agora), null)
})

test('erros de cada passo, com os textos da spec', () => {
  const v = RESPOSTAS_VAZIAS
  assert.equal(erroDoPasso(1, v), 'Escolha o estágio do seu caso.')
  assert.equal(erroDoPasso(2, v), 'Informe a data que está impressa na notificação.')
  assert.equal(erroDoPasso(2, { ...v, data_limite: '2026-02-30' }), 'Informe a data que está impressa na notificação.')
  assert.equal(erroDoPasso(3, v), 'Marque uma das opções.')
  assert.equal(erroDoPasso(4, v), 'Marque uma das opções.')
  assert.equal(erroDoPasso(4, { ...v, multa_de_radar: 'sim', velocidade_aferida: '80', velocidade_considerada: '90' }),
    'A velocidade considerada não pode ser maior que a aferida. Confira os números no auto.')
  assert.equal(erroDoPasso(5, v), 'Escolha uma das opções.')
  assert.equal(erroDoPasso(5, { ...v, versao: 'propria', justificativa: '  ' }),
    'Conte o que aconteceu ou escolha a defesa pelos dados do auto.')
  for (const p of [1, 2, 3, 4, 5] as const) assert.equal(erroDoPasso(p, R), null)
  assert.equal(erroDoPasso(5, { ...v, versao: 'sem_versao' }), null)
})

test('campos do formulário a partir das respostas', () => {
  assert.deepEqual(paraCamposDoFormulario(R), {
    estagio: DEFESA_PREVIA, data_limite: '2026-10-30', cliente_conduzia: 'sim', amparoLegal: 'Art. 218, II',
    velocidade_permitida: '80', velocidade_aferida: '91', velocidade_considerada: '84',
    versao: 'propria', justificativa: 'Não vi a placa.',
  })
  // Sem versão: o relato que tenha sobrado no rascunho do questionário não vai.
  assert.equal(paraCamposDoFormulario({ ...R, versao: 'sem_versao' }).justificativa, '')
})

test('rascunho antigo, sem os campos novos, não apaga as respostas', () => {
  const base = { estagio: DEFESA_PREVIA, data_limite: '2026-10-30', nome: '' }
  const rascunho = { nome: 'Fulana', data_limite: '' } as Partial<typeof base>
  assert.deepEqual(mesclarComRascunho(base, rascunho), { estagio: DEFESA_PREVIA, data_limite: '2026-10-30', nome: 'Fulana' })
  assert.deepEqual(mesclarComRascunho(base, null), base)
})

// Revisão final: duas abas — a aba A paga com o que mostra, não com o que a aba B gravou depois.
test('vincular grava as respostas da tela, não as que outra aba deixou no armazenamento', () => {
  const a = new Memoria()
  const B = { ...R, justificativa: 'Resposta da aba B.' }
  gravarRespostas(a, CHAVE_ATUAL, B)
  vincularAoCaso(a, 'CASO_A', R)
  assert.equal(lerRespostas(a, chaveDoCaso('CASO_A'))!.justificativa, 'Não vi a placa.')
})

// Revisão final: "ao voltar a /questionario, o cliente continua de onde parou" (spec §6.1).
test('tela inicial: sem respostas começa no passo 1', () => {
  assert.equal(telaInicial(RESPOSTAS_VAZIAS, new Date(2026, 9, 8)), 1)
})

test('tela inicial: o primeiro passo incompleto', () => {
  const agora = new Date(2026, 9, 8)
  assert.equal(telaInicial({ ...R, cliente_conduzia: '' }, agora), 3)
  assert.equal(telaInicial({ ...R, versao: '' }, agora), 5)
  assert.equal(telaInicial({ ...R, data_limite: '' }, agora), 2)
})

test('tela inicial: tudo respondido vai ao resumo, ou ao prazo vencido', () => {
  assert.equal(telaInicial(R, new Date(2026, 9, 8)), 'resumo')
  assert.equal(telaInicial(R, new Date(2026, 9, 31)), 'vencido')
  assert.equal(telaInicial({ ...R, cliente_conduzia: '' }, new Date(2026, 9, 31)), 'vencido')
})

// Revisão final: "faltam 1 dias".
test('texto do prazo, com singular e plural', () => {
  assert.equal(textoDoPrazo(0, '2026-10-30'), 'a data-limite é hoje')
  assert.equal(textoDoPrazo(1, '2026-10-30'), 'falta 1 dia para a data-limite (30/10/2026)')
  assert.equal(textoDoPrazo(22, '2026-10-30'), 'faltam 22 dias para a data-limite (30/10/2026)')
})
