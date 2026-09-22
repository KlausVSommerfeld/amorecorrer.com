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
