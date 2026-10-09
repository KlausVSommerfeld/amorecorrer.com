import test from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import {
  ENTREGA_TIMEOUT_MS,
  entregar,
  statusDoFormulario,
  statusDoWebhook,
  type DepsEntrega,
} from './entrega.ts'

const CASO = 'CASO_aaaaaaaa-0000-4000-8000-000000000001'
const CHAVE = '8d9796e3-323e-413f-b7af-426923dbc533'
const RESERVA = { dispatch_key: CHAVE, email: 'cliente@exemplo.com', stripe_session_id: 'cs_test_1' }
const ENV = {
  DISPATCH_PIPELINE_URL: 'https://pipeline.exemplo/hooks/dispatch',
  DISPATCH_PIPELINE_HMAC_SECRET: 'segredo',
}

type Rpc = { data: unknown; error: unknown }
type Opcoes = {
  reserva?: Rpc | Error
  devolucao?: Rpc
  resposta?: Response | Error
  env?: Record<string, string>
}

function falso(op: Opcoes = {}) {
  const rpc: [string, Record<string, unknown>][] = []
  const fetches: [string, RequestInit][] = []
  const logs: [string, string, Record<string, unknown>][] = []
  const deps: DepsEntrega = {
    rpc: async (fn, args) => {
      rpc.push([fn, args])
      if (fn === 'reservar_entrega') {
        if (op.reserva instanceof Error) throw op.reserva
        return op.reserva ?? { data: [RESERVA], error: null }
      }
      if (fn === 'devolver_entrega') return op.devolucao ?? { data: [{ devolvido: true }], error: null }
      if (fn === 'confirm_dispatch') return { data: [{ confirmed: true }], error: null }
      throw new Error(`rpc inesperada: ${fn}`)
    },
    fetch: async (url, init) => {
      fetches.push([url, init])
      if (op.resposta instanceof Error) throw op.resposta
      return op.resposta ?? new Response(null, { status: 202 })
    },
    env: (k) => (op.env ?? ENV)[k],
    log: (nivel, etapa, detalhes) => { logs.push([nivel, etapa, detalhes]) },
  }
  const chamou = (fn: string) => rpc.filter(([f]) => f === fn)
  return { deps, rpc, fetches, logs, chamou }
}

test('reserva vazia: nada a fazer, sem POST e sem devolução', async () => {
  const f = falso({ reserva: { data: [], error: null } })
  assert.equal(await entregar(f.deps, CASO, 'formulario'), 'nada_a_fazer')
  assert.equal(f.fetches.length, 0)
  assert.equal(f.chamou('devolver_entrega').length, 0)
})

test('reserva com o caso certo: pede reservar_entrega pelo case_id', async () => {
  const f = falso()
  await entregar(f.deps, CASO, 'webhook')
  assert.deepEqual(f.chamou('reservar_entrega'), [['reservar_entrega', { p_case_id: CASO }]])
})

test('202: entregue, sem confirmar nem devolver (quem fecha é o Express)', async () => {
  const f = falso()
  assert.equal(await entregar(f.deps, CASO, 'formulario'), 'entregue')
  assert.equal(f.chamou('confirm_dispatch').length, 0)
  assert.equal(f.chamou('devolver_entrega').length, 0)
})

test('POST: URL, corpo compacto e Idempotency-Key = dispatch_key', async () => {
  const f = falso()
  await entregar(f.deps, CASO, 'formulario')
  const [url, init] = f.fetches[0]
  assert.equal(url, ENV.DISPATCH_PIPELINE_URL)
  assert.equal(init.method, 'POST')
  assert.equal(init.body, `{"case_id":"${CASO}","email":"cliente@exemplo.com","dispatch_key":"${CHAVE}"}`)
  const headers = init.headers as Record<string, string>
  assert.equal(headers['Idempotency-Key'], CHAVE)
  assert.equal(headers['Content-Type'], 'application/json')
})

test('assinatura: X-Signature é o HMAC-SHA256 hex do corpo enviado', async () => {
  const f = falso()
  await entregar(f.deps, CASO, 'formulario')
  const [, init] = f.fetches[0]
  const esperado = createHmac('sha256', 'segredo').update(String(init.body)).digest('hex')
  assert.equal((init.headers as Record<string, string>)['X-Signature'], esperado)
})

test('sem segredo: POST sem X-Signature', async () => {
  const f = falso({ env: { DISPATCH_PIPELINE_URL: ENV.DISPATCH_PIPELINE_URL } })
  await entregar(f.deps, CASO, 'formulario')
  assert.equal('X-Signature' in (f.fetches[0][1].headers as Record<string, string>), false)
})

test('nomes antigos (N8N_*) valem quando os novos não existem', async () => {
  const f = falso({ env: { N8N_WEBHOOK_URL: 'https://antigo/hook', N8N_HMAC_SECRET: 's' } })
  assert.equal(await entregar(f.deps, CASO, 'formulario'), 'entregue')
  assert.equal(f.fetches[0][0], 'https://antigo/hook')
})

test('o POST leva tempo-limite de 10 s', async () => {
  const f = falso()
  await entregar(f.deps, CASO, 'formulario')
  assert.equal(ENTREGA_TIMEOUT_MS, 10_000)
  assert.ok(f.fetches[0][1].signal instanceof AbortSignal)
})

test('200 legado: confirm_dispatch(true) e entregue', async () => {
  const f = falso({ resposta: new Response('ok', { status: 200 }) })
  assert.equal(await entregar(f.deps, CASO, 'formulario'), 'entregue')
  assert.deepEqual(f.chamou('confirm_dispatch'), [['confirm_dispatch', { dispatch_key: CHAVE, success: true }]])
  assert.equal(f.chamou('devolver_entrega').length, 0)
})

test('500 do pipeline: devolve e falha', async () => {
  const f = falso({ resposta: new Response('erro', { status: 500 }) })
  assert.equal(await entregar(f.deps, CASO, 'webhook'), 'falhou')
  assert.deepEqual(f.chamou('devolver_entrega'), [['devolver_entrega', { p_dispatch_key: CHAVE }]])
})

test('erro de rede: devolve e falha', async () => {
  const f = falso({ resposta: new TypeError('fetch failed') })
  assert.equal(await entregar(f.deps, CASO, 'formulario'), 'falhou')
  assert.equal(f.chamou('devolver_entrega').length, 1)
})

test('tempo esgotado: devolve e falha', async () => {
  const f = falso({ resposta: new DOMException('signal timed out', 'TimeoutError') })
  assert.equal(await entregar(f.deps, CASO, 'formulario'), 'falhou')
  assert.equal(f.chamou('devolver_entrega').length, 1)
})

test('URL ausente: devolve e falha, sem POST', async () => {
  const f = falso({ env: {} })
  assert.equal(await entregar(f.deps, CASO, 'formulario'), 'falhou')
  assert.equal(f.fetches.length, 0)
  assert.equal(f.chamou('devolver_entrega').length, 1)
})

test('URL presente mas vazia conta como ausente', async () => {
  const f = falso({ env: { DISPATCH_PIPELINE_URL: '', DISPATCH_PIPELINE_HMAC_SECRET: 's' } })
  assert.equal(await entregar(f.deps, CASO, 'formulario'), 'falhou')
  assert.equal(f.fetches.length, 0)
})

test('erro da RPC de reserva: falha sem POST e sem devolução (não há chave)', async () => {
  const f = falso({ reserva: { data: null, error: { message: 'boom' } } })
  assert.equal(await entregar(f.deps, CASO, 'formulario'), 'falhou')
  assert.equal(f.fetches.length, 0)
  assert.equal(f.chamou('devolver_entrega').length, 0)
})

test('reserva que lança: falha, não propaga', async () => {
  const f = falso({ reserva: new Error('rede do banco') })
  assert.equal(await entregar(f.deps, CASO, 'formulario'), 'falhou')
})

test('devolução que também falha: ainda falhou, e loga devolucao_falhou', async () => {
  const f = falso({
    resposta: new Response('erro', { status: 503 }),
    devolucao: { data: null, error: { message: 'banco fora' } },
  })
  assert.equal(await entregar(f.deps, CASO, 'webhook'), 'falhou')
  assert.ok(f.logs.some(([nivel, etapa]) => nivel === 'error' && etapa === 'devolucao_falhou'))
})

test('todo log leva case_id e origem', async () => {
  const f = falso({ resposta: new Response('erro', { status: 500 }) })
  await entregar(f.deps, CASO, 'webhook')
  assert.ok(f.logs.length > 0)
  for (const [, , detalhes] of f.logs) {
    assert.equal(detalhes.case_id, CASO)
    assert.equal(detalhes.origem, 'webhook')
  }
})

test('status HTTP: 503 no formulário e 500 na webhook só quando falhou', () => {
  assert.equal(statusDoFormulario('falhou'), 503)
  assert.equal(statusDoFormulario('entregue'), 200)
  assert.equal(statusDoFormulario('nada_a_fazer'), 200)
  assert.equal(statusDoWebhook('falhou'), 500)
  assert.equal(statusDoWebhook('entregue'), 200)
  assert.equal(statusDoWebhook('nada_a_fazer'), 200)
})

test('o segredo assina como está: espaço no fim não é aparado (Express e pipeline não aparam)', async () => {
  const f = falso({ env: { DISPATCH_PIPELINE_URL: ENV.DISPATCH_PIPELINE_URL, DISPATCH_PIPELINE_HMAC_SECRET: 'segredo\n' } })
  await entregar(f.deps, CASO, 'formulario')
  const [, init] = f.fetches[0]
  const esperado = createHmac('sha256', 'segredo\n').update(String(init.body)).digest('hex')
  assert.equal((init.headers as Record<string, string>)['X-Signature'], esperado)
})

test('falha inesperada depois da reserva: devolve e falha, não propaga', async () => {
  const f = falso()
  f.deps.env = (k) => {
    if (k === 'DISPATCH_PIPELINE_HMAC_SECRET') throw new Error('ambiente quebrado')
    return (ENV as Record<string, string>)[k]
  }
  assert.equal(await entregar(f.deps, CASO, 'formulario'), 'falhou')
  assert.equal(f.chamou('devolver_entrega').length, 1)
})
