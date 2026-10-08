import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DEFESA_PREVIA, ESTAGIOS, RECURSO_JARI } from './estagios.ts'

// CLAUDE.md: mudar este texto sem mudar peca.py faz toda peça sair sem destinatário.
test('os rótulos batem byte a byte com DEFESA_PREVIA e RECURSO_JARI do peca.py', () => {
  const peca = readFileSync(new URL('../../pipeline/peca.py', import.meta.url), 'utf8')
  assert.ok(peca.includes(`DEFESA_PREVIA = "${DEFESA_PREVIA}"`))
  assert.ok(peca.includes(`RECURSO_JARI = "${RECURSO_JARI}"`))
  assert.deepEqual(ESTAGIOS.map((e) => e.valor), [DEFESA_PREVIA, RECURSO_JARI])
})
