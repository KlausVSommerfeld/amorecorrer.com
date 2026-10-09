import test from 'node:test'
import assert from 'node:assert/strict'
import { sessaoPaga } from './pagamento.ts'
import { statusDoWebhook } from '../_shared/entrega.ts'

test('promovida a paid agora: paga', () => {
  assert.equal(sessaoPaga('paid', 'pending'), true)
  assert.equal(sessaoPaga('paid', null), true)
})

test('evento reenviado: já estava paid e a promoção não acontece — continua paga', () => {
  assert.equal(sessaoPaga(null, 'paid'), true)
})

test('não paga: pendente, cancelada, falha ou sessão nova sem status', () => {
  assert.equal(sessaoPaga(null, null), false)
  assert.equal(sessaoPaga(null, 'pending'), false)
  assert.equal(sessaoPaga('cancelled', 'pending'), false)
  assert.equal(sessaoPaga('failed', null), false)
})

test('evento repetido de caso já entregue (reserva vazia) não vira 500', () => {
  assert.equal(statusDoWebhook('nada_a_fazer'), 200)
})
