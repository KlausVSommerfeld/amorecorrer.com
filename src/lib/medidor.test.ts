import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizarNumeroSerie, normalizarNumeroDigitos } from './medidor.ts'

test('série: caixa alta, sem espaços nas pontas nem no meio', () => {
  assert.equal(normalizarNumeroSerie(' fsc-s3924 '), 'FSC-S3924')
  assert.equal(normalizarNumeroSerie('BRI 1012'), 'BRI1012')
})

test('série: hífen fica — FSC-S3924 e FSCS3924 são aparelhos distintos na base do RJ', () => {
  assert.notEqual(normalizarNumeroSerie('FSC-S3924'), normalizarNumeroSerie('FSCS3924'))
})

test('série: barra e zeros à esquerda ficam', () => {
  assert.equal(normalizarNumeroSerie('0001/2019'), '0001/2019')
  assert.equal(normalizarNumeroSerie('0272'), '0272')
})

test('série: vazio ou só espaço vira null', () => {
  assert.equal(normalizarNumeroSerie(''), null)
  assert.equal(normalizarNumeroSerie('   '), null)
  assert.equal(normalizarNumeroSerie(undefined), null)
  assert.equal(normalizarNumeroSerie(null), null)
})

test('INMETRO e certificado: só os dígitos', () => {
  assert.equal(normalizarNumeroDigitos('104 167 73'), '10416773')
  assert.equal(normalizarNumeroDigitos('13.750.622'), '13750622')
})

test('INMETRO e certificado: zero à esquerda fica', () => {
  assert.equal(normalizarNumeroDigitos('0853252'), '0853252')
})

test('INMETRO e certificado: sem dígito nenhum vira null', () => {
  assert.equal(normalizarNumeroDigitos(''), null)
  assert.equal(normalizarNumeroDigitos('abc'), null)
  assert.equal(normalizarNumeroDigitos(undefined), null)
})
