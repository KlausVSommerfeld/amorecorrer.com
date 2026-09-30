import test from 'node:test'
import assert from 'node:assert/strict'
import { consideradaMaiorQueAferida } from './velocidade.ts'

test('considerada maior que a aferida é erro de digitação', () => {
  assert.equal(consideradaMaiorQueAferida('97', '98'), true)
})

test('igual ou menor é o normal', () => {
  assert.equal(consideradaMaiorQueAferida('97', '97'), false)
  assert.equal(consideradaMaiorQueAferida('97', '90'), false)
})

test('com algum dos dois vazio não há o que comparar', () => {
  assert.equal(consideradaMaiorQueAferida('', '90'), false)
  assert.equal(consideradaMaiorQueAferida('97', ''), false)
  assert.equal(consideradaMaiorQueAferida('  ', '  '), false)
})

test('compara número, não texto ("100" > "99")', () => {
  assert.equal(consideradaMaiorQueAferida('99', '100'), true)
  assert.equal(consideradaMaiorQueAferida('100', '99'), false)
})
