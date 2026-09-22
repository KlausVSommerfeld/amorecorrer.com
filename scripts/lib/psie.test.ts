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
