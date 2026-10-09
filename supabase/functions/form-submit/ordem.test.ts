import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// A verificação do medidor entra NA MESMA escrita do formulário (revisão final da
// spec 2026-10-09). Gravada depois, a `stripe-webhook` pode reservar e entregar
// no intervalo: o pipeline leria o caso sem a verificação, ou — num reenvio
// editado — o número de série novo com o resultado do aparelho antigo.
// O index.ts não roda no `node --test` (Deno.serve, jsr:), então a ordem é
// conferida no fonte, como o `estagios.test.ts` faz com o peca.py.
const fonte = readFileSync(new URL('./index.ts', import.meta.url), 'utf8')

test('verificar_medidor roda antes de gravar o formulário', () => {
  const verificacao = fonte.indexOf('.rpc("verificar_medidor"')
  const insert = fonte.indexOf('.insert({ ...updateFields')
  const update = fonte.indexOf('.update(updateFields)')
  assert.ok(verificacao > 0 && insert > 0 && update > 0)
  assert.ok(verificacao < insert, 'verificar_medidor depois do INSERT')
  assert.ok(verificacao < update, 'verificar_medidor depois do UPDATE')
})

test('a verificação vai nos campos gravados, não num UPDATE à parte', () => {
  const campos = fonte.slice(fonte.indexOf('const updateFields = {'), fonte.indexOf('};', fonte.indexOf('const updateFields = {')))
  assert.match(campos, /verificacao_medidor: verificacao/)
  assert.doesNotMatch(fonte, /\.update\(\{ verificacao_medidor: verificacao \}\)/)
})
