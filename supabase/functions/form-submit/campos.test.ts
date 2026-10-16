import test from 'node:test'
import assert from 'node:assert/strict'
import { clienteConduzia, codigoEnquadramento, dataLimiteProtocolo } from './campos.ts'

test('booleano de verdade passa como está', () => {
  assert.equal(clienteConduzia(true), true)
  assert.equal(clienteConduzia(false), false)
})

test('qualquer outra coisa vira null, sem recusar o envio', () => {
  for (const valor of [undefined, null, 'true', 'false', 'sim', 'nao', '', 1, 0, {}, []]) {
    assert.equal(clienteConduzia(valor), null, `valor: ${JSON.stringify(valor)}`)
  }
})

// Relógio fixo: o teto da data-limite depende de hoje.
const HOJE = new Date('2026-10-15T15:00:00Z')

test('data-limite válida passa como está', () => {
  assert.equal(dataLimiteProtocolo('2026-10-30', '2026-09-20T08:15', HOJE), '2026-10-30')
  assert.equal(dataLimiteProtocolo('2028-02-29', null, new Date('2027-06-01T12:00:00Z')), '2028-02-29')
})

test('data-limite impossível, em outro formato ou de outro tipo vira null', () => {
  for (const valor of ['2026-02-30', '2027-02-29', '30/10/2026', '2026-10-30T00:00', '', ' ', 20261030, null, undefined, {}]) {
    assert.equal(dataLimiteProtocolo(valor, null, HOJE), null, `valor: ${JSON.stringify(valor)}`)
  }
})

// CASO_363f15e6 (15/10/2026): 3000-10-28 passou, e o e-mail mandou protocolar até 28/10/3000.
test('data-limite mais de um ano depois de hoje vira null', () => {
  assert.equal(dataLimiteProtocolo('3000-10-28', '2026-09-20T08:15', HOJE), null)
  assert.equal(dataLimiteProtocolo('2027-10-16', null, HOJE), null)
  assert.equal(dataLimiteProtocolo('2027-10-15', null, HOJE), '2027-10-15')
})

test('data-limite anterior à data da infração vira null', () => {
  assert.equal(dataLimiteProtocolo('2026-09-19', '2026-09-20T08:15', HOJE), null)
  assert.equal(dataLimiteProtocolo('2026-09-20', '2026-09-20T08:15', HOJE), '2026-09-20')
})

test('sem data da infração legível, só o teto vale', () => {
  for (const infracao of [null, undefined, '', 'ontem', 20260920]) {
    assert.equal(dataLimiteProtocolo('2020-01-10', infracao, HOJE), '2020-01-10', `infração: ${JSON.stringify(infracao)}`)
  }
})

test('código de enquadramento no formato NNNN-N passa como está', () => {
  assert.equal(codigoEnquadramento('7455-0'), '7455-0')
  assert.equal(codigoEnquadramento('5169-1'), '5169-1')
})

// Review Focus 5: só o formato que o site manda; o resto vira null, sem recusar o envio.
test('código em outro formato ou de outro tipo vira null', () => {
  for (const valor of ['7455-00', '74550', '745-50', ' 7455-0', '7455-0 ', 'abcd-e', '', 74550, null, undefined, {}, []]) {
    assert.equal(codigoEnquadramento(valor), null, `valor: ${JSON.stringify(valor)}`)
  }
})
