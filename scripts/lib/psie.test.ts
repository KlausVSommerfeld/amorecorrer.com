import test from 'node:test'
import assert from 'node:assert/strict'
import { UF_ALVO, parseBrDate, parseIntOrNull, classificarResultado } from './psie.ts'

test('UF_ALVO é RJ', () => {
  assert.equal(UF_ALVO, 'RJ')
})

test('parseBrDate converte DD/MM/YYYY para ISO', () => {
  assert.equal(parseBrDate('12/07/2024'), '2024-07-12')
  assert.equal(parseBrDate('28/08/2026'), '2026-08-28')
})

test('parseBrDate não lê MM/DD — dia maior que 12 prova isso', () => {
  assert.equal(parseBrDate('13/01/2026'), '2026-01-13')
})

test('parseBrDate rejeita entrada inválida devolvendo null', () => {
  assert.equal(parseBrDate(''), null)
  assert.equal(parseBrDate(null), null)
  assert.equal(parseBrDate(undefined), null)
  assert.equal(parseBrDate('2026-08-04'), null)
  assert.equal(parseBrDate('31/02/2026'), null)
  assert.equal(parseBrDate('  '), null)
  assert.equal(parseBrDate('1/1/2026'), null)
})

test('parseIntOrNull devolve null para "0" — 32 faixas no RJ dependem disso', () => {
  assert.equal(parseIntOrNull('0'), null)
  assert.equal(parseIntOrNull('40'), 40)
  assert.equal(parseIntOrNull(''), null)
  assert.equal(parseIntOrNull(null), null)
  assert.equal(parseIntOrNull(undefined), null)
  assert.equal(parseIntOrNull('abc'), null)
  assert.equal(parseIntOrNull(' 50 '), 50)
})

test('classificarResultado mapeia exatamente a tabela da §5.4', () => {
  assert.equal(classificarResultado('Aprovado'), 'conforme')
  assert.equal(classificarResultado('Reprovado'), 'nao_conforme')
  assert.equal(classificarResultado('Pendente'), 'indeterminado')
  assert.equal(classificarResultado(''), 'indeterminado')
  assert.equal(classificarResultado(undefined), 'indeterminado')
  assert.equal(classificarResultado(null), 'indeterminado')
})

test('NENHUM valor desconhecido vira nao_conforme', () => {
  for (const v of ['Reparado', 'XYZ', 'reprovado parcialmente', 'Aprovado com ressalva', '???']) {
    assert.notEqual(classificarResultado(v), 'nao_conforme', `"${v}" não pode ser nao_conforme`)
  }
})

import { instrumentId } from './psie.ts'
import type { PsieRecord } from './psie.ts'

const REGISTRO_BASE: PsieRecord = {
  SiglaUf: 'RJ',
  Municipio: 'RIO DE JANEIRO',
  LocalVerificacao: 'Est Rio Grande Px1096',
  Faixas: [
    { NumeroFaixa: '2', NumeroInmetro: '14117709', NumeroSerie: '2000065', Sentido: 'Est Tindiba', VelocidadeNominal: '40' },
    { NumeroFaixa: '1', NumeroInmetro: '14117709', NumeroSerie: '2000065', Sentido: 'Est Pau Fome', VelocidadeNominal: '40' },
  ],
  Historico: [],
}

test('instrumentId tem 32 caracteres hexadecimais', async () => {
  const id = await instrumentId(REGISTRO_BASE)
  assert.match(id, /^[0-9a-f]{32}$/)
})

test('instrumentId é estável entre chamadas', async () => {
  const a = await instrumentId(REGISTRO_BASE)
  const b = await instrumentId(REGISTRO_BASE)
  assert.equal(a, b)
})

test('instrumentId é invariante à ordem das faixas', async () => {
  const invertido: PsieRecord = { ...REGISTRO_BASE, Faixas: [...REGISTRO_BASE.Faixas!].reverse() }
  assert.equal(await instrumentId(REGISTRO_BASE), await instrumentId(invertido))
})

test('instrumentId muda quando o local muda', async () => {
  const outro: PsieRecord = { ...REGISTRO_BASE, LocalVerificacao: 'Est Cafundá Px 2125' }
  assert.notEqual(await instrumentId(REGISTRO_BASE), await instrumentId(outro))
})

test('instrumentId ignora série vazia e duplicada', async () => {
  const comLixo: PsieRecord = {
    ...REGISTRO_BASE,
    Faixas: [
      ...REGISTRO_BASE.Faixas!,
      { NumeroFaixa: '3', NumeroSerie: '', Sentido: 'x', VelocidadeNominal: '40' },
      { NumeroFaixa: '4', NumeroSerie: '2000065', Sentido: 'y', VelocidadeNominal: '40' },
    ],
  }
  assert.equal(await instrumentId(REGISTRO_BASE), await instrumentId(comLixo))
})

test('instrumentId não quebra em registro sem faixas', async () => {
  const semFaixas: PsieRecord = { SiglaUf: 'RJ', Municipio: 'SÃO JOSÉ DO NORTE', LocalVerificacao: "1'", Faixas: [] }
  assert.match(await instrumentId(semFaixas), /^[0-9a-f]{32}$/)
})

import { readFileSync } from 'node:fs'
import { normalize } from './psie.ts'

const SNAP = '00000000-0000-4000-8000-000000000000'
const FIXTURE: PsieRecord[] = JSON.parse(
  readFileSync(new URL('../../tests/fixtures/medidores_RJ.json', import.meta.url), 'utf8'),
)

test('o fixture tem os 23 registros esperados', () => {
  assert.equal(FIXTURE.length, 23)
})

test('normalize monta a linha do instrumento a partir do registro canônico', async () => {
  const { instrument } = await normalize(FIXTURE[0], SNAP)
  assert.equal(instrument.uf, 'RJ')
  assert.equal(instrument.municipio, 'RIO DE JANEIRO')
  assert.equal(instrument.local_via, 'Est Rio Grande Px1096')
  assert.equal(instrument.data_ultima_verificacao, '2026-08-28')
  assert.equal(instrument.data_validade, '2027-08-27')
  assert.equal(instrument.ultimo_resultado, 'Aprovado')
  assert.equal(instrument.snapshot_id, SNAP)
  assert.match(instrument.updated_at, /^\d{4}-\d{2}-\d{2}T/)
})

test('normalize devolve o histórico ordenado por data_laudo', async () => {
  const { verificacoes } = await normalize(FIXTURE[0], SNAP)
  const hist = verificacoes.filter((v) => v.origem === 'historico').map((v) => v.data_laudo)
  assert.deepEqual(hist, [...hist].sort())
  assert.equal(hist.length, 8)
  assert.equal(hist[0], '2019-09-19')
})

test('registro com Historico vazio e par do topo válido devolve UMA verificação, origem topo', async () => {
  const { verificacoes } = await normalize(FIXTURE[1], SNAP)
  assert.equal(verificacoes.length, 1)
  assert.equal(verificacoes[0].origem, 'topo')
  assert.equal(verificacoes[0].numero_certificado, '')
  assert.equal(verificacoes[0].numero_ensaio, null)
  assert.equal(verificacoes[0].data_laudo, '2026-06-12')
  assert.equal(verificacoes[0].data_validade, '2027-06-11')
})

test('registro com histórico devolve historico.length + 1 verificações', async () => {
  const { verificacoes } = await normalize(FIXTURE[0], SNAP)
  assert.equal(verificacoes.length, (FIXTURE[0].Historico ?? []).length + 1)
  assert.equal(verificacoes.filter((v) => v.origem === 'topo').length, 1)
})

test('DataValidade vazia no topo não gera linha de origem topo', async () => {
  const { verificacoes } = await normalize(FIXTURE[3], SNAP)
  assert.equal(verificacoes.filter((v) => v.origem === 'topo').length, 0)
  assert.equal(verificacoes.length, 0)
})

test('VelocidadeNominal "0" vira null, nunca 0 km/h', async () => {
  const { faixas } = await normalize(FIXTURE[11], SNAP)
  assert.equal(faixas[0].velocidade_nominal, null)
})

test('Sentido null vira string vazia — a coluna é NOT NULL e entra na PK', async () => {
  const { faixas } = await normalize(FIXTURE[11], SNAP)
  assert.equal(faixas[0].sentido, '')
  assert.equal(typeof faixas[0].sentido, 'string')
})

test('registro sem Faixas e sem Historico não quebra', async () => {
  const r = await normalize(FIXTURE[12], SNAP)
  assert.equal(r.faixas.length, 0)
  assert.equal(r.verificacoes.filter((v) => v.origem === 'historico').length, 0)
  assert.match(r.instrument.id, /^[0-9a-f]{32}$/)
})

test('entrada de histórico com data inválida é descartada e contada', async () => {
  const sujo: PsieRecord = {
    SiglaUf: 'RJ', Municipio: 'X', LocalVerificacao: 'Y', Faixas: [],
    DataUltimaVerificacao: '', DataValidade: '',
    Historico: [
      { NumeroCertificado: '1', DataLaudo: '12/07/2024', DataValidade: '11/07/2025', Resultado: 'Aprovado' },
      { NumeroCertificado: '2', DataLaudo: 'lixo', DataValidade: '11/07/2025', Resultado: 'Aprovado' },
      { NumeroCertificado: '3', DataLaudo: '12/07/2024', DataValidade: '', Resultado: 'Aprovado' },
    ],
  }
  const r = await normalize(sujo, SNAP)
  assert.equal(r.verificacoes.length, 1)
  assert.equal(r.descartes, 2)
})

test('o fixture inteiro reproduz as contagens medidas', async () => {
  let faixas = 0, hist = 0, topo = 0, descartes = 0
  for (const reg of FIXTURE) {
    const r = await normalize(reg, SNAP)
    faixas += r.faixas.length
    hist += r.verificacoes.filter((v) => v.origem === 'historico').length
    topo += r.verificacoes.filter((v) => v.origem === 'topo').length
    descartes += r.descartes
  }
  assert.equal(faixas, 31)
  assert.equal(hist, 103)
  assert.equal(topo, 17)
  assert.equal(descartes, 0)
})
