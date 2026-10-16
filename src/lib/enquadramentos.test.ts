import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { LIMITE_DE_RESULTADOS, artigoDe, buscarEnquadramentos, lerCodigo, type Enquadramento } from './enquadramentos.ts'

const CASOS: { texto: string; codigo: string | null }[] = JSON.parse(
  readFileSync(new URL('../../tests/compartilhados/codigos.json', import.meta.url), 'utf8'),
)
const ITENS: Enquadramento[] = JSON.parse(readFileSync(new URL('../data/enquadramentos.json', import.meta.url), 'utf8'))
const codigos = (termo: string) => buscarEnquadramentos(termo, ITENS).map((i) => i.codigo)

test('paridade com o pipeline na leitura de código', () => {
  for (const c of CASOS) assert.equal(lerCodigo(c.texto), c.codigo, c.texto)
})

test('código em qualquer formato impresso', () => {
  for (const t of ['7455-0', '745-50', '74550', '7455', ' 745-50 ']) assert.deepEqual(codigos(t), ['7455-0'], t)
})

test('artigo, com ou sem inciso', () => {
  assert.deepEqual(codigos('218'), ['7455-0', '7463-0', '7471-0'])
  assert.deepEqual(codigos('Art. 218, I'), ['7455-0'])
  assert.deepEqual(codigos('art 218 inciso II'), ['7463-0'])
  assert.deepEqual(codigos('Artigo 218, III, do CTB'), ['7471-0'])
  assert.deepEqual(codigos('181, I'), ['5380-0'])
  assert.deepEqual(codigos('181 i'), ['5380-0'])
})

test('artigo com letra', () => {
  assert.deepEqual(codigos('165-A'), ['7579-0'])
  assert.deepEqual(codigos('165a'), ['7579-0'])
})

test('palavras: sem acento, sem caixa, pelo começo', () => {
  assert.deepEqual(codigos('velocidade 20'), ['7455-0', '7463-0'])
  assert.deepEqual(codigos('VELOCIDADE 20'), ['7455-0', '7463-0'])
  assert.deepEqual(codigos('veloc 20'), ['7455-0', '7463-0'])
  assert.deepEqual(codigos('estacionar fila dupla'), ['5487-0'])
  assert.deepEqual(codigos('telefone celular'), ['7366-2', '7633-1', '7633-2'])
  assert.deepEqual(codigos('influencia alcool'), ['5169-1'])
})

test('nada a buscar', () => {
  for (const t of ['', '   ', '2026-10-15', 'xyzw']) assert.deepEqual(codigos(t), [], t)
})

test('no máximo 30 resultados, em ordem de código', () => {
  const r = codigos('a')
  assert.equal(r.length, LIMITE_DE_RESULTADOS)
  assert.deepEqual(r, [...r].sort())
})

test('artigo do dispositivo', () => {
  assert.equal(artigoDe('art. 165-A, § 1º'), '165-A')
  assert.equal(artigoDe('art. 252, parágrafo único'), '252')
})
