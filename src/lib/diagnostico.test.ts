import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { diagnostico, enquadramento218, situacaoDaVelocidade } from './diagnostico.ts'

type Caso = {
  amparo_legal: string
  velocidade_permitida: number | null
  velocidade_aferida: number | null
  velocidade_considerada: number | null
  enquadramento_218: string | null
  situacao: 'sem_infracao' | 'desclassificacao' | null
  inciso_da_conta: string | null
}

const CASOS: Caso[] = JSON.parse(
  readFileSync(new URL('../../tests/compartilhados/velocidade.json', import.meta.url), 'utf8')
)

test('paridade com o pipeline: enquadramento, situação e inciso da conta', () => {
  for (const c of CASOS) {
    const rotulo = `${c.amparo_legal} ${c.velocidade_permitida}/${c.velocidade_considerada}`
    assert.equal(enquadramento218(c.amparo_legal), c.enquadramento_218, rotulo)
    const r = situacaoDaVelocidade(c)
    assert.equal(r.situacao, c.situacao, rotulo)
    assert.equal(r.inciso_da_conta, c.inciso_da_conta, rotulo)
  }
})

test('velocidades como texto do formulário valem o mesmo que números', () => {
  const r = situacaoDaVelocidade({ amparo_legal: 'Art 218, II, CTB', velocidade_permitida: '80', velocidade_aferida: '91', velocidade_considerada: '84' })
  assert.deepEqual(r, { situacao: 'desclassificacao', inciso_do_auto: 'II', inciso_da_conta: 'I' })
  assert.equal(situacaoDaVelocidade({ amparo_legal: 'Art 218, II', velocidade_permitida: '', velocidade_aferida: '', velocidade_considerada: '84' }).situacao, null)
})

const base = { velocidade_aferida: '', cliente_conduzia: 'sim' as const }

test('arquivamento: destaca o arquivamento', () => {
  const d = diagnostico({ ...base, amparo_legal: 'Art. 218, I', velocidade_permitida: '80', velocidade_considerada: '80' })
  assert.equal(d.tipo, 'arquivamento')
  assert.equal(d.texto, 'A defesa pede o arquivamento do auto: a velocidade considerada no próprio auto não passa da permitida.')
  assert.equal(d.destaque, 'Pelos números do seu auto, este é o pedido com mais chance de ser aceito.')
  assert.equal(d.complemento, null)
})

test('desclassificação para o I: três pedidos, destaque e complemento da advertência', () => {
  const d = diagnostico({ ...base, amparo_legal: 'Art 218, II, CTB', velocidade_permitida: '80', velocidade_considerada: '84' })
  assert.equal(d.tipo, 'desclassificacao')
  assert.equal(d.texto, 'A defesa pede, em ordem: (a) o arquivamento do auto; (b) se ele for negado, a desclassificação para o inciso I do art. 218; (c) a advertência no lugar da multa.')
  assert.equal(d.destaque, 'Pelos números do seu auto, o pedido com mais chance de ser aceito é a desclassificação — os outros continuam no pedido e podem ser acolhidos.')
  assert.equal(d.complemento, 'Se você não teve outra infração nos últimos 12 meses, depois da desclassificação cabe ainda a advertência (art. 267).')
})

test('desclassificação para o II: sem advertência', () => {
  const d = diagnostico({ ...base, amparo_legal: 'Art. 218, III', velocidade_permitida: '80', velocidade_considerada: '120' })
  assert.equal(d.tipo, 'desclassificacao')
  assert.equal(d.texto, 'A defesa pede, em ordem: (a) o arquivamento do auto; (b) se ele for negado, a desclassificação para o inciso II do art. 218.')
  assert.equal(d.complemento, null)
})

test('neutro no inciso I: a advertência é o destaque', () => {
  const d = diagnostico({ ...base, amparo_legal: 'Art. 218, I', velocidade_permitida: '80', velocidade_considerada: '84' })
  assert.equal(d.tipo, 'neutro_advertencia')
  assert.equal(d.texto, 'A defesa pede, em ordem: (a) o arquivamento do auto; (b) a advertência no lugar da multa.')
  assert.equal(d.destaque, 'Se você não teve outra infração nos últimos 12 meses, a advertência é o pedido com mais chance de ser aceito — a lei diz que ela deverá ser aplicada nesse caso (art. 267) —, e o arquivamento continua no pedido.')
})

test('neutro sem destaque: grave, fora do 218 ou sem enquadramento', () => {
  for (const amparo_legal of ['Art. 218, II', 'Art. 230, V', '', 'Art. 218 do CTB']) {
    const d = diagnostico({ ...base, amparo_legal, velocidade_permitida: '80', velocidade_considerada: '97' })
    assert.equal(d.tipo, 'neutro', amparo_legal)
    assert.equal(d.texto, 'A defesa pede o arquivamento do auto, com base na consistência do auto e nos requisitos que a lei exige dele.')
    assert.equal(d.destaque, null)
  }
})

test('com outra pessoa dirigindo, a advertência vem condicionada', () => {
  const d = diagnostico({ ...base, cliente_conduzia: 'nao', amparo_legal: 'Art. 218, I', velocidade_permitida: '80', velocidade_considerada: '84' })
  assert.equal(d.texto, 'A defesa pede, em ordem: (a) o arquivamento do auto; (b) a advertência no lugar da multa, caso você venha a ser considerado responsável.')
})
