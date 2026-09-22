import test from 'node:test'
import assert from 'node:assert/strict'
import { comRetry } from './retry.ts'

const semEspera = { esperaMs: () => 0, dormir: async () => {} }

test('devolve o valor na primeira tentativa, sem repetir', async () => {
  let chamadas = 0
  const r = await comRetry(async () => { chamadas++; return 'ok' }, { tentativas: 3, ...semEspera })
  assert.equal(r, 'ok')
  assert.equal(chamadas, 1)
})

test('repete até obter sucesso', async () => {
  let chamadas = 0
  const r = await comRetry(async () => {
    chamadas++
    if (chamadas < 3) throw new TypeError('terminated')
    return 'enfim'
  }, { tentativas: 3, ...semEspera })
  assert.equal(r, 'enfim')
  assert.equal(chamadas, 3)
})

test('esgotadas as tentativas, propaga o último erro', async () => {
  let chamadas = 0
  await assert.rejects(
    () => comRetry(async () => { chamadas++; throw new Error(`falha ${chamadas}`) }, { tentativas: 3, ...semEspera }),
    /falha 3/,
  )
  assert.equal(chamadas, 3)
})

test('espera o que a função de backoff mandar, entre tentativas', async () => {
  const esperas: number[] = []
  let chamadas = 0
  await comRetry(async () => {
    chamadas++
    if (chamadas < 3) throw new Error('x')
    return null
  }, {
    tentativas: 3,
    esperaMs: (n) => n * 1000,
    dormir: async (ms) => { esperas.push(ms) },
  })
  // Espera só ENTRE tentativas: duas falhas, duas esperas. Nunca depois do sucesso.
  assert.deepEqual(esperas, [1000, 2000])
})

test('avisa a cada falha, com o número da tentativa', async () => {
  const avisos: string[] = []
  let chamadas = 0
  await comRetry(async () => {
    chamadas++
    if (chamadas < 2) throw new Error('boom')
    return null
  }, {
    tentativas: 3,
    ...semEspera,
    aoFalhar: (n, e) => avisos.push(`${n}:${(e as Error).message}`),
  })
  assert.deepEqual(avisos, ['1:boom'])
})

test('tentativas = 1 não repete', async () => {
  let chamadas = 0
  await assert.rejects(
    () => comRetry(async () => { chamadas++; throw new Error('só uma') }, { tentativas: 1, ...semEspera }),
    /só uma/,
  )
  assert.equal(chamadas, 1)
})
