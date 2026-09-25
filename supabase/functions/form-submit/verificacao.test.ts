import test from 'node:test'
import assert from 'node:assert/strict'
import {
  AVISO_INDISPONIVEL,
  AVISO_SEM_DADOS,
  VERIFICACAO_TIMEOUT_MS,
  entradaDaVerificacao,
  linhaDoLog,
  naoAplicavel,
} from './verificacao.ts'

test('sem série nem INMETRO: não há o que consultar', () => {
  assert.equal(entradaDaVerificacao({ data_infracao: '2026-09-01T08:30:00' }), null)
})

test('número vazio ou só espaço conta como ausente', () => {
  assert.equal(
    entradaDaVerificacao({ medidor_numero_serie: '', medidor_numero_inmetro: '   ', data_infracao: '2026-09-01T08:30:00' }),
    null,
  )
})

test('com série: argumentos da RPC, data cortada no relógio de parede', () => {
  assert.deepEqual(
    entradaDaVerificacao({ medidor_numero_serie: 'FSC-S3924', data_infracao: '2026-09-01T23:30:00' }),
    {
      p_numero_serie: 'FSC-S3924',
      p_numero_inmetro: null,
      p_data_infracao: '2026-09-01',
      p_municipio: null,
      p_local: null,
    },
  )
})

test('só com INMETRO também consulta', () => {
  const e = entradaDaVerificacao({ medidor_numero_inmetro: '10416773', data_infracao: '2026-09-01T08:30:00' })
  assert.equal(e?.p_numero_serie, null)
  assert.equal(e?.p_numero_inmetro, '10416773')
})

test('data ausente ou malformada vira null, sem exceção — a RPC responde nao_aplicavel', () => {
  assert.equal(entradaDaVerificacao({ medidor_numero_serie: 'X1' })?.p_data_infracao, null)
  assert.equal(entradaDaVerificacao({ medidor_numero_serie: 'X1', data_infracao: '01/09/2026' })?.p_data_infracao, null)
  assert.equal(entradaDaVerificacao({ medidor_numero_serie: 'X1', data_infracao: 20260901 })?.p_data_infracao, null)
})

test('fallback no formato do contrato', () => {
  assert.deepEqual(naoAplicavel(AVISO_INDISPONIVEL), {
    status: 'nao_aplicavel',
    confianca: 'baixa',
    metodo_match: 'nenhum',
    instrumento: null,
    certificado_vigente: null,
    certificados_proximos: [],
    evidencia: null,
    avisos: ['verificação indisponível'],
  })
  assert.equal(AVISO_SEM_DADOS, 'dados do medidor não informados — verificação não realizada')
  assert.equal(VERIFICACAO_TIMEOUT_MS, 3000)
})

test('linha do log: espelha o resultado e zera a revisão humana', () => {
  const entrada = entradaDaVerificacao({ medidor_numero_serie: '2000065', data_infracao: '2024-07-12T10:00:00' })
  const resultado = { status: 'comprovado_valido', confianca: 'alta', metodo_match: 'numero_serie', avisos: [] }
  const agora = new Date('2026-09-24T12:00:00Z')
  assert.deepEqual(linhaDoLog('CASO_x', entrada, resultado, agora), {
    case_id: 'CASO_x',
    consultado_em: '2026-09-24T12:00:00.000Z',
    entrada,
    resultado,
    status: 'comprovado_valido',
    confianca: 'alta',
    metodo_match: 'numero_serie',
    revisado_por: null,
    revisado_em: null,
  })
})

test('linha do log sem entrada (não consultado) também é registrada', () => {
  const linha = linhaDoLog('CASO_y', null, naoAplicavel(AVISO_SEM_DADOS))
  assert.equal(linha.entrada, null)
  assert.equal(linha.status, 'nao_aplicavel')
})
