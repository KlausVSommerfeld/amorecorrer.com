import test from 'node:test'
import assert from 'node:assert/strict'
import { clienteConduzia, dataLimiteProtocolo } from './campos.ts'

test('booleano de verdade passa como está', () => {
  assert.equal(clienteConduzia(true), true)
  assert.equal(clienteConduzia(false), false)
})

test('qualquer outra coisa vira null, sem recusar o envio', () => {
  for (const valor of [undefined, null, 'true', 'false', 'sim', 'nao', '', 1, 0, {}, []]) {
    assert.equal(clienteConduzia(valor), null, `valor: ${JSON.stringify(valor)}`)
  }
})

test('data-limite válida passa como está', () => {
  assert.equal(dataLimiteProtocolo('2026-10-30'), '2026-10-30')
  assert.equal(dataLimiteProtocolo('2028-02-29'), '2028-02-29')
})

test('data-limite impossível, em outro formato ou de outro tipo vira null', () => {
  for (const valor of ['2026-02-30', '2027-02-29', '30/10/2026', '2026-10-30T00:00', '', ' ', 20261030, null, undefined, {}]) {
    assert.equal(dataLimiteProtocolo(valor), null, `valor: ${JSON.stringify(valor)}`)
  }
})
