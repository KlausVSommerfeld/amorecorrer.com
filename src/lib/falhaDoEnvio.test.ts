import test from 'node:test'
import assert from 'node:assert/strict'
import { mensagemDeFalha } from './falhaDoEnvio.ts'

test('503: os dados chegaram, a geração não começou — tentar de novo', () => {
  assert.equal(
    mensagemDeFalha(503),
    'Recebemos seus dados, mas não conseguimos começar a gerar a sua peça agora. Tente de novo em um minuto.'
  )
})

test('as mensagens de antes continuam', () => {
  assert.match(mensagemDeFalha(409), /já foi finalizado/)
  assert.match(mensagemDeFalha(404), /Não localizamos este pedido/)
  assert.match(mensagemDeFalha(413), /grande demais/)
  assert.match(mensagemDeFalha(429), /Muitas tentativas/)
  assert.match(mensagemDeFalha(400), /recusado/)
  assert.match(mensagemDeFalha(500), /Nossos servidores não responderam/)
})
