import test from 'node:test'
import assert from 'node:assert/strict'
import { clienteConduzia } from './campos.ts'

test('booleano de verdade passa como está', () => {
  assert.equal(clienteConduzia(true), true)
  assert.equal(clienteConduzia(false), false)
})

test('qualquer outra coisa vira null, sem recusar o envio', () => {
  for (const valor of [undefined, null, 'true', 'false', 'sim', 'nao', '', 1, 0, {}, []]) {
    assert.equal(clienteConduzia(valor), null, `valor: ${JSON.stringify(valor)}`)
  }
})
