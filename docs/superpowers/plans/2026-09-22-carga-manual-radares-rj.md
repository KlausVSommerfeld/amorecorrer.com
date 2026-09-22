# Carga manual dos radares do RJ — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Popular as tabelas `radar_*` de produção — hoje com 0 linhas — a partir do arquivo de dados abertos do INMETRO/RBMLQ do RJ, baixado da máquina do Klaus, destravando a coleta de provas que a RPC `verificar_medidor` já sabe consultar.

**Architecture:** Dois arquivos. Um núcleo puro (`scripts/lib/psie.ts`) que converte o JSON da fonte nas linhas das quatro tabelas, sem nenhum I/O — é onde moram os erros silenciosos e é o que os testes cobrem. Um entrypoint (`scripts/ingest-radares-rj.ts`) que concentra rede, Storage e banco, com `--dry-run` como rede de proteção e confirmação explícita do projeto de destino.

**Tech Stack:** Node 22.23.2 (type-stripping nativo, `node --test`, `--env-file-if-exists`), `@supabase/supabase-js` ^2.81.1, Web Crypto. **Nenhuma dependência nova.**

**Spec:** `docs/superpowers/specs/2026-09-22-carga-manual-radares-rj-design.md` — leia por inteiro antes da Task 1. O plano argumenta a partir dela.

## Global Constraints

- **Gerenciador de pacotes: `npm`.** Nunca `bun`, `yarn` ou `pnpm`. O lockfile é versionado.
- **Nenhuma dependência nova.** Verificado em 22/09/2026: Node 22.23.2 faz type-stripping nativo, roda `node --test` sobre `.ts` e importa `@supabase/supabase-js` de dentro do repositório. Se você sentir vontade de instalar `tsx`, `dotenv`, `ts-node` ou um runner de testes, **pare e reporte** — a vontade é sinal de que algo saiu do caminho.
- **Nenhuma migration, nenhum schema tocado.** As cinco tabelas e as três funções já existem em produção. Se algo parecer exigir DDL, **pare e reporte**.
- **Não alterar `src/`, `server/`, `pipeline/` nem `supabase/functions/`.** Este plano cria dois arquivos e edita `package.json`. Nada mais.
- **`import` de arquivo local leva a extensão `.ts`** (`from './lib/psie.ts'`). É exigência do ESM com type-stripping; sem ela o Node não resolve.
- **Só sintaxe TypeScript apagável.** Type-stripping nativo aceita `interface`, `type` e anotações; **rejeita `enum`, `namespace` e parâmetros com modificador de acesso no construtor.**
- **`UF_ALVO = 'RJ'` num único lugar.** Nenhum literal `'RJ'` espalhado pelo código.
- **Nenhum valor desconhecido pode virar `nao_conforme`.** O default de `classificarResultado` é sempre `indeterminado`. É a regra de maior consequência jurídica do subsistema.
- **O `eslint` alcança `scripts/**/*.ts`** (`files: ["**/*.{ts,tsx}"]` em `eslint.config.js`), mas `@typescript-eslint/no-unused-vars` está **off** e `no-undef` é desligado pelo preset do typescript-eslint — então `process` e um `const` declarado numa task e usado na seguinte não quebram `npm run lint`.
- **Comentários e mensagens de commit em português**, no tom do repositório.
- **Ao fim, acrescentar entrada em `PROGRESSO.md`** — convenção declarada no `CLAUDE.md`.
- **Nunca commitar `medidores.json` íntegro** (3,66 MB). Só o fixture de 23 registros é versionado.

---

## File Structure

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `scripts/lib/psie.ts` | criar | Núcleo puro: tipos, `parseBrDate`, `parseIntOrNull`, `classificarResultado`, `instrumentId`, `normalize`. **Zero I/O.** |
| `scripts/lib/psie.test.ts` | criar | Testes do núcleo, `node --test`, sobre `tests/fixtures/medidores_RJ.json`. |
| `scripts/ingest-radares-rj.ts` | criar | Entrypoint: CLI, busca, sanidade, idempotência, Storage, upserts. |
| `package.json` | editar | Scripts `radar:test` e `radar:ingest`. |
| `PROGRESSO.md` | editar | Entrada de sessão ao fim (Task 6). |

**Dados de referência, medidos no arquivo real em 21-22/09/2026** (use como valores esperados, não recalcule):

| | Arquivo íntegro (RJ) | Fixture (23 registros) |
|---|---|---|
| Registros | 1.971 | 23 |
| Faixas | 3.346 | 31 |
| Verificações `historico` | 7.814 | 103 |
| Verificações `topo` | 1.838 | 17 |
| **Total de verificações** | **9.652** | **120** |
| Descartes por data inválida | 0 | 0 |
| Colisões de PK dentro do lote | 0 | 0 |
| Bytes | 3.661.867 | — |
| sha256 | `4dcb3d35ee37cd60122d660319b00be215a49759b0f371cd59f4a6fde648fb9b` | — |

---

## Task 1: Núcleo — datas, inteiros e classificação

Primeiras três funções puras, e a fiação de testes do projeto. São as que mais erram em silêncio: uma data lida como `MM/DD` produz um sistema que funciona e mente.

**Files:**
- Create: `scripts/lib/psie.ts`
- Create: `scripts/lib/psie.test.ts`
- Modify: `package.json` (bloco `scripts`)

**Interfaces:**
- Consumes: nada.
- Produces: `UF_ALVO: string`, `parseBrDate(s?: string | null): string | null`, `parseIntOrNull(s?: string | null): number | null`, `classificarResultado(r?: string | null): 'conforme' | 'nao_conforme' | 'indeterminado'`.

- [ ] **Step 1: Escrever os testes que falham**

Crie `scripts/lib/psie.test.ts`:

```ts
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
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Adicione ao bloco `scripts` do `package.json`:

```json
    "radar:test": "node --test \"scripts/lib/*.test.ts\"",
```

**Não use a forma de diretório** (`node --test scripts/lib/`): medido em 22/09 neste Node 22.23.2, ela
falha com `Cannot find module '<dir>'` em vez de varrer a pasta — o erro se disfarça de módulo ausente e
faz perder tempo. A forma glob funciona, e é o Node que a expande.

Run: `npm run radar:test`
Expected: FAIL — `Cannot find module` ou `ERR_MODULE_NOT_FOUND` para `./psie.ts`, porque o módulo ainda não existe.

- [ ] **Step 3: Implementar o mínimo**

Crie `scripts/lib/psie.ts`:

```ts
// Núcleo de parsing do PSIE/INMETRO — puro, sem I/O.
// Mora em scripts/lib/ e não em supabase/functions/_shared/ porque nenhuma
// Edge Function o consome: a Edge de ingestão foi descartada pela §5.1.2 do
// PLANO-verificacao-radar-inmetro.md (o RBMLQ recusa o IP de saída da Supabase).
// Escrito só com APIs que Node e Deno compartilham, para que mover seja barato.

export const UF_ALVO = 'RJ'

/** "12/07/2024" -> "2024-07-12". Qualquer outra coisa -> null. */
export function parseBrDate(s?: string | null): string | null {
  if (typeof s !== 'string') return null
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s.trim())
  if (!m) return null
  const dia = Number(m[1])
  const mes = Number(m[2])
  const ano = Number(m[3])
  // Date normaliza 31/02 para 03/03; comparar de volta é o que rejeita data impossível.
  const d = new Date(Date.UTC(ano, mes - 1, dia))
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) {
    return null
  }
  return `${m[3]}-${m[2]}-${m[1]}`
}

/** Inteiro, ou null. "0" vira null: a origem usa 0 para "não informado". */
export function parseIntOrNull(s?: string | null): number | null {
  if (typeof s !== 'string') return null
  const t = s.trim()
  if (t === '') return null
  if (!/^-?\d+$/.test(t)) return null
  const n = Number(t)
  return n === 0 ? null : n
}

/**
 * Mapa de resultado da §5.4 do plano.
 * REGRA INVIOLÁVEL: qualquer valor desconhecido é `indeterminado`, nunca
 * `nao_conforme`. Afirmar "não conforme" sem base é o erro que cria problema
 * numa peça protocolada.
 */
export function classificarResultado(
  r?: string | null,
): 'conforme' | 'nao_conforme' | 'indeterminado' {
  const t = (r ?? '').trim().toLowerCase()
  if (t === 'aprovado') return 'conforme'
  if (t === 'reprovado') return 'nao_conforme'
  return 'indeterminado'
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npm run radar:test`
Expected: PASS — 7 testes, 0 falhas.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/psie.ts scripts/lib/psie.test.ts package.json
git commit -m "feat(radar): núcleo de parsing — datas, inteiros e classificação

Type-stripping nativo do Node 22; nenhuma dependência nova.
O default de classificarResultado é indeterminado, nunca nao_conforme.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: Núcleo — identidade do instrumento

O dataset não tem chave primária. `instrumentId` deriva uma, e ela precisa ser **estável entre execuções** e **invariante à ordem do array `Faixas`** — senão a segunda carga duplica o parque inteiro.

**Files:**
- Modify: `scripts/lib/psie.ts`
- Modify: `scripts/lib/psie.test.ts`

**Interfaces:**
- Consumes: `UF_ALVO` da Task 1.
- Produces: `PsieFaixa`, `PsieHistorico`, `PsieRecord` (interfaces), `instrumentId(r: PsieRecord): Promise<string>` — string de 32 caracteres hexadecimais.

- [ ] **Step 1: Escrever os testes que falham**

Acrescente ao fim de `scripts/lib/psie.test.ts`:

```ts
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
```

- [ ] **Step 2: Rodar e confirmar que falham**

Run: `npm run radar:test`
Expected: FAIL — `instrumentId is not a function` / erro de import, porque ainda não existe.

- [ ] **Step 3: Implementar**

Acrescente a `scripts/lib/psie.ts`, **acima** de `UF_ALVO`, os tipos da fonte:

```ts
export interface PsieFaixa {
  NumeroFaixa?: string | null
  NumeroInmetro?: string | null
  NumeroSerie?: string | null
  /** Vem `null` em registros reais (3 no fixture). Entra na PK, então nunca pode virar NULL no banco. */
  Sentido?: string | null
  VelocidadeNominal?: string | null
}

export interface PsieHistorico {
  NumeroCertificado?: string | null
  NumeroEnsaio?: string | null
  Ano?: string | null
  DataLaudo?: string | null
  DataValidade?: string | null
  TipoServico?: string | null
  Resultado?: string | null
}

export interface PsieRecord {
  SiglaUf?: string | null
  Estado?: string | null
  Municipio?: string | null
  LocalVerificacao?: string | null
  DataUltimaVerificacao?: string | null
  DataValidade?: string | null
  UltimoResultado?: string | null
  TipoMedidor?: string | null
  Faixas?: PsieFaixa[] | null
  Historico?: PsieHistorico[] | null
  Proprietario?: string | null
}
```

E ao fim do arquivo:

```ts
/**
 * Identidade derivada (§5.3 do plano). O dataset não tem chave primária.
 *
 * sha256( SiglaUf | Municipio | LocalVerificacao | série_1 | série_2 | … )[:32]
 * com as séries únicas, não vazias e ordenadas — a ordenação é o que torna o id
 * invariante à ordem do array Faixas.
 *
 * RISCO ACEITO: se o INMETRO corrigir a grafia de LocalVerificacao, o hash muda
 * e o instrumento entra como novo. Tolerável porque o histórico vive em
 * radar_verificacoes e a consulta casa por numero_serie / numero_inmetro.
 */
export async function instrumentId(r: PsieRecord): Promise<string> {
  const series = [
    ...new Set(
      (r.Faixas ?? [])
        .map((f) => (f.NumeroSerie ?? '').trim())
        .filter((s) => s !== ''),
    ),
  ].sort()

  const base = [r.SiglaUf ?? '', r.Municipio ?? '', r.LocalVerificacao ?? '', ...series].join('|')
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(base))
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32)
}
```

- [ ] **Step 4: Rodar e confirmar que passam**

Run: `npm run radar:test`
Expected: PASS — 13 testes, 0 falhas.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/psie.ts scripts/lib/psie.test.ts
git commit -m "feat(radar): identidade derivada do instrumento

sha256 estável e invariante à ordem das faixas. Sem isso, a segunda
carga duplicaria o parque inteiro.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: Núcleo — `normalize`

Converte um registro da fonte nas linhas das três tabelas. É aqui que vive a regra dos 297 instrumentos: a verificação de origem `topo`.

**Files:**
- Modify: `scripts/lib/psie.ts`
- Modify: `scripts/lib/psie.test.ts`

**Interfaces:**
- Consumes: tudo das Tasks 1 e 2.
- Produces: `InstrumentRow`, `FaixaRow`, `VerificacaoRow`, `NormalizeResult` (interfaces) e
  `normalize(r: PsieRecord, snapshotId: string): Promise<NormalizeResult>`, onde
  `NormalizeResult = { instrument: InstrumentRow; faixas: FaixaRow[]; verificacoes: VerificacaoRow[]; descartes: number }`.

- [ ] **Step 1: Escrever os testes que falham**

Acrescente ao fim de `scripts/lib/psie.test.ts`:

```ts
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
```

- [ ] **Step 2: Rodar e confirmar que falham**

Run: `npm run radar:test`
Expected: FAIL — `normalize is not a function`.

- [ ] **Step 3: Implementar**

Acrescente a `scripts/lib/psie.ts` os tipos das linhas do banco:

```ts
export interface InstrumentRow {
  id: string
  uf: string
  municipio: string | null
  local_via: string | null
  tipo_medidor: string | null
  proprietario: string | null
  data_ultima_verificacao: string | null
  data_validade: string | null
  ultimo_resultado: string | null
  snapshot_id: string
  updated_at: string
}

export interface FaixaRow {
  instrument_id: string
  numero_faixa: string
  numero_inmetro: string | null
  numero_serie: string | null
  sentido: string
  velocidade_nominal: number | null
}

export interface VerificacaoRow {
  instrument_id: string
  origem: 'historico' | 'topo'
  numero_certificado: string
  numero_ensaio: string | null
  ano: number | null
  data_laudo: string
  data_validade: string
  tipo_servico: string | null
  resultado: string | null
}

export interface NormalizeResult {
  instrument: InstrumentRow
  faixas: FaixaRow[]
  verificacoes: VerificacaoRow[]
  /** Entradas de histórico jogadas fora por data não parseável. Esperado hoje: 0. */
  descartes: number
}
```

E a função, ao fim do arquivo:

```ts
/** Texto da fonte -> coluna nullable: vazio e só-espaço viram null. */
function textoOuNull(s?: string | null): string | null {
  if (typeof s !== 'string') return null
  const t = s.trim()
  return t === '' ? null : t
}

/**
 * Converte um registro da fonte nas linhas das três tabelas.
 *
 * A verificação de origem `topo` é o coração desta função: 297 instrumentos do
 * RJ têm `Historico: []` e, ainda assim, declaram verificação no topo do
 * registro (§1.4.11 do plano). Ignorá-la classificaria os 297 como sem
 * registro — erro que o produto venderia como fato.
 */
export async function normalize(r: PsieRecord, snapshotId: string): Promise<NormalizeResult> {
  const id = await instrumentId(r)

  const instrument: InstrumentRow = {
    id,
    uf: textoOuNull(r.SiglaUf) ?? UF_ALVO,
    municipio: textoOuNull(r.Municipio),
    local_via: textoOuNull(r.LocalVerificacao),
    tipo_medidor: textoOuNull(r.TipoMedidor),
    proprietario: textoOuNull(r.Proprietario),
    data_ultima_verificacao: parseBrDate(r.DataUltimaVerificacao),
    data_validade: parseBrDate(r.DataValidade),
    ultimo_resultado: textoOuNull(r.UltimoResultado),
    snapshot_id: snapshotId,
    // Escrito explicitamente: o DEFAULT só vale no INSERT, e num upsert que
    // atualiza linha existente a coluna ficaria congelada na primeira carga.
    updated_at: new Date().toISOString(),
  }

  // `sentido` e `numero_faixa` entram na PK: NOT NULL, então `?? ''`.
  const faixas: FaixaRow[] = (r.Faixas ?? []).map((f) => ({
    instrument_id: id,
    numero_faixa: (f.NumeroFaixa ?? '').trim(),
    numero_inmetro: textoOuNull(f.NumeroInmetro),
    numero_serie: textoOuNull(f.NumeroSerie),
    sentido: (f.Sentido ?? '').trim(),
    velocidade_nominal: parseIntOrNull(f.VelocidadeNominal),
  }))

  let descartes = 0
  const verificacoes: VerificacaoRow[] = []

  for (const h of r.Historico ?? []) {
    const laudo = parseBrDate(h.DataLaudo)
    const validade = parseBrDate(h.DataValidade)
    // data_laudo e data_validade são NOT NULL: sem as duas, a linha não existe.
    if (laudo === null || validade === null) {
      descartes++
      continue
    }
    verificacoes.push({
      instrument_id: id,
      origem: 'historico',
      numero_certificado: (h.NumeroCertificado ?? '').trim(),
      numero_ensaio: textoOuNull(h.NumeroEnsaio),
      ano: parseIntOrNull(h.Ano),
      data_laudo: laudo,
      data_validade: validade,
      tipo_servico: textoOuNull(h.TipoServico),
      resultado: textoOuNull(h.Resultado),
    })
  }

  verificacoes.sort((a, b) => a.data_laudo.localeCompare(b.data_laudo))

  const topoLaudo = parseBrDate(r.DataUltimaVerificacao)
  const topoValidade = parseBrDate(r.DataValidade)
  if (topoLaudo !== null && topoValidade !== null) {
    verificacoes.push({
      instrument_id: id,
      origem: 'topo',
      // A fonte não fornece número de certificado no topo. A peça pode afirmar
      // a vigência; não pode citar um número que não existe na base pública.
      numero_certificado: '',
      numero_ensaio: null,
      ano: null,
      data_laudo: topoLaudo,
      data_validade: topoValidade,
      tipo_servico: null,
      resultado: textoOuNull(r.UltimoResultado),
    })
  }

  return { instrument, faixas, verificacoes, descartes }
}
```

- [ ] **Step 4: Rodar e confirmar que passam**

Run: `npm run radar:test`
Expected: PASS — 24 testes, 0 falhas. Em especial o último, que reproduz 31 faixas, 103 verificações de histórico e 17 de topo sobre o fixture.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/psie.ts scripts/lib/psie.test.ts
git commit -m "feat(radar): normalize — registro da fonte para linhas das tabelas

Emite a verificação de origem 'topo', sem a qual 297 instrumentos do RJ
seriam classificados como sem registro.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: Entrypoint — CLI, busca, sanidade e `--dry-run`

Metade do entrypoint: tudo o que acontece **antes** de escrever qualquer coisa. Ao fim desta task o `--dry-run` roda de ponta a ponta contra a fonte real, sem credencial nenhuma.

**Files:**
- Create: `scripts/ingest-radares-rj.ts`
- Modify: `package.json` (bloco `scripts`)

**Interfaces:**
- Consumes: `normalize`, `UF_ALVO`, tipos de `./lib/psie.ts`.
- Produces: o executável. Nenhuma API para outras tasks.

- [ ] **Step 1: Escrever o entrypoint, parte 1**

Crie `scripts/ingest-radares-rj.ts`:

```ts
// Carga manual dos radares do RJ. Ver:
//   docs/superpowers/specs/2026-09-22-carga-manual-radares-rj-design.md
//
// Roda da máquina do Klaus porque o servidor do RBMLQ recusa o IP de saída da
// Supabase (§5.1.2 do plano do radar / pendência 21 do PROGRESSO.md).
//
//   npm run radar:ingest -- --dry-run    # não escreve nada, dispensa credencial
//   npm run radar:ingest                 # carga real, pede confirmação
//   npm run radar:ingest -- --yes        # carga real, sem prompt

import { UF_ALVO, normalize } from './lib/psie.ts'
import type { FaixaRow, InstrumentRow, PsieRecord, VerificacaoRow } from './lib/psie.ts'

const FONTE = `https://servicos.rbmlq.gov.br/dados-abertos/${UF_ALVO}/medidores.json`
// O e-mail do plano (contato@amorecorrer.com) não existe — pendência 25. Este existe.
const USER_AGENT = 'amorecorrer.com/1.0 (+amorecorrer@gmail.com)'
const BUCKET = 'evidencias'
const LOTE = 500

// Sanidade: o RJ tem 1.971 registros. Queda abaixo disso é arquivo truncado na
// origem, e carregar um arquivo truncado apagaria nada, mas registraria um
// snapshot mentiroso como prova.
const MINIMO_REGISTROS = 1500
const MINIMO_COM_FAIXAS = 0.8

const args = new Set(process.argv.slice(2))
const DRY_RUN = args.has('--dry-run')
const SEM_PROMPT = args.has('--yes')

function log(...partes: unknown[]): void {
  console.log(...partes)
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function baixarFonte(): Promise<{ bytes: Uint8Array; lastModified: string | null }> {
  log(`→ GET ${FONTE}`)
  const t0 = Date.now()
  const resp = await fetch(FONTE, { headers: { 'User-Agent': USER_AGENT } })
  if (!resp.ok) {
    throw new Error(`fonte respondeu ${resp.status} ${resp.statusText}`)
  }
  const bytes = new Uint8Array(await resp.arrayBuffer())
  log(`  ${bytes.byteLength.toLocaleString('pt-BR')} bytes em ${Date.now() - t0} ms`)
  return { bytes, lastModified: resp.headers.get('last-modified') }
}

/** Aborta antes de qualquer escrita se o arquivo não parecer o arquivo. */
function conferirSanidade(registros: unknown): PsieRecord[] {
  if (!Array.isArray(registros)) {
    throw new Error('corpo não parseia como array')
  }
  if (registros.length < MINIMO_REGISTROS) {
    throw new Error(
      `só ${registros.length} registros; mínimo ${MINIMO_REGISTROS}. Arquivo truncado na origem?`,
    )
  }
  const comFaixas = registros.filter(
    (r) => Array.isArray((r as PsieRecord).Faixas) && (r as PsieRecord).Faixas!.length > 0,
  ).length
  const proporcao = comFaixas / registros.length
  if (proporcao < MINIMO_COM_FAIXAS) {
    throw new Error(
      `só ${(proporcao * 100).toFixed(1)}% dos registros têm faixas; mínimo ${MINIMO_COM_FAIXAS * 100}%`,
    )
  }
  return registros as PsieRecord[]
}

async function normalizarTudo(registros: PsieRecord[], snapshotId: string) {
  const instruments: InstrumentRow[] = []
  const faixas: FaixaRow[] = []
  const verificacoes: VerificacaoRow[] = []
  let descartes = 0

  for (const r of registros) {
    const n = await normalize(r, snapshotId)
    instruments.push(n.instrument)
    faixas.push(...n.faixas)
    verificacoes.push(...n.verificacoes)
    descartes += n.descartes
  }
  return { instruments, faixas, verificacoes, descartes }
}

function relatorio(n: Awaited<ReturnType<typeof normalizarTudo>>): void {
  const hist = n.verificacoes.filter((v) => v.origem === 'historico').length
  const topo = n.verificacoes.filter((v) => v.origem === 'topo').length
  log('')
  log('  instrumentos .............. ' + n.instruments.length.toLocaleString('pt-BR'))
  log('  faixas .................... ' + n.faixas.length.toLocaleString('pt-BR'))
  log('  verificações (histórico) .. ' + hist.toLocaleString('pt-BR'))
  log('  verificações (topo) ....... ' + topo.toLocaleString('pt-BR'))
  log('  verificações (total) ...... ' + n.verificacoes.length.toLocaleString('pt-BR'))
  log('  descartes por data ........ ' + n.descartes.toLocaleString('pt-BR'))
  log('')
}

async function main(): Promise<void> {
  const t0 = Date.now()
  log(`\n=== Carga de radares ${UF_ALVO} ${DRY_RUN ? '(DRY RUN — nada será gravado)' : ''}\n`)

  const { bytes, lastModified } = await baixarFonte()
  const sha = await sha256Hex(bytes)
  log(`  sha256: ${sha}`)
  log(`  Last-Modified: ${lastModified ?? '(ausente)'}`)

  const registros = conferirSanidade(JSON.parse(new TextDecoder().decode(bytes)))
  log(`  sanidade: OK (${registros.length} registros)`)

  // No dry-run o snapshot_id é fictício: nada será gravado.
  const n = await normalizarTudo(registros, '00000000-0000-4000-8000-000000000000')
  relatorio(n)

  if (DRY_RUN) {
    log(`Dry run concluído em ${Date.now() - t0} ms. Nada foi gravado.\n`)
    return
  }

  throw new Error('carga real ainda não implementada — ver Task 5')
}

main().catch((erro) => {
  console.error('\n✗ FALHOU:', erro instanceof Error ? erro.message : erro)
  process.exitCode = 1
})
```

- [ ] **Step 2: Acrescentar o script npm**

No bloco `scripts` do `package.json`, ao lado de `radar:test`:

```json
    "radar:ingest": "node --env-file-if-exists=.env --env-file-if-exists=.env.local scripts/ingest-radares-rj.ts",
```

Medido em 22/09: com dois `--env-file-if-exists` o último arquivo ganha (a regra que o `CLAUDE.md` documenta), arquivo ausente não derruba o processo, e **variável real de ambiente vence o arquivo**.

- [ ] **Step 3: Rodar o dry-run contra a fonte real**

Run: `npm run radar:ingest -- --dry-run`

Expected: PASS, com exatamente estes números:

```
  instrumentos .............. 1.971
  faixas .................... 3.346
  verificações (histórico) .. 7.814
  verificações (topo) ....... 1.838
  verificações (total) ...... 9.652
  descartes por data ........ 0
```

**Se algum número divergir, PARE.** O arquivo é byte a byte o mesmo de 03/09 (`sha256 4dcb3d35…648fb9b`); divergência é bug do nosso lado, não novidade da fonte. Se o `sha256` impresso for outro, a fonte finalmente se moveu — aí os números podem mudar legitimamente, e é caso de reportar antes de seguir.

- [ ] **Step 4: Conferir que o dry-run não precisa de credencial**

Run: `node scripts/ingest-radares-rj.ts --dry-run`
Expected: PASS, mesmos números — sem nenhum `--env-file`, provando que o dry-run não toca banco nem Storage.

- [ ] **Step 5: Commit**

```bash
git add scripts/ingest-radares-rj.ts package.json
git commit -m "feat(radar): entrypoint da carga — busca, sanidade e dry-run

O dry-run roda sem credencial e reproduz o censo do RJ: 1.971 instrumentos,
3.346 faixas, 9.652 verificações.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

> **Desvio aplicado em 22/09/2026, durante a execução.** A Task 4 ganhou um retry que este plano não
> previa, em `scripts/lib/retry.ts` (+ `retry.test.ts`, 6 testes). Motivo medido: o mesmo arquivo levou
> 1,5 s, 11,8 s, 15,9 s, 27,7 s, 40,9 s e 46,9 s em execuções seguidas, e uma delas morreu no meio do
> corpo — `TypeError: terminated` do undici. Sem retry, a carga falharia em torno de 1 vez a cada 5.
> `comRetry` recebe o `dormir` por injeção, então os testes não tocam rede nem relógio. São 4 tentativas
> com backoff linear de 3 s.

## Task 5: Entrypoint — escrita: confirmação, idempotência, Storage e upserts

A outra metade. Nada aqui roda sob `--dry-run`.

**Files:**
- Modify: `scripts/ingest-radares-rj.ts`

**Interfaces:**
- Consumes: tudo da Task 4.
- Produces: o executável completo.

- [ ] **Step 1: Acrescentar cliente, confirmação e idempotência**

No topo de `scripts/ingest-radares-rj.ts`, junto dos outros imports:

```ts
import { createInterface } from 'node:readline/promises'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
```

E antes de `async function main()`:

```ts
function clienteSupabase(): { db: SupabaseClient; ref: string; url: string } {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error(
      'faltam SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY. ' +
        'Rode com --dry-run para conferir a fonte sem credencial.',
    )
  }
  const ref = new URL(url).hostname.split('.')[0]
  return { db: createClient(url, key, { auth: { persistSession: false } }), ref, url }
}

/**
 * Confirma o destino em voz alta. É a guarda contra o erro mais caro disponível
 * aqui — gravar no projeto errado —, e custa uma linha.
 */
async function confirmarDestino(ref: string, url: string): Promise<void> {
  log(`\n  DESTINO: ${url}`)
  log(`  project ref: ${ref}`)
  if (SEM_PROMPT) {
    log('  --yes passado; seguindo sem perguntar.\n')
    return
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const resposta = await rl.question(`\n  Gravar no projeto "${ref}"? [s/N] `)
  rl.close()
  if (resposta.trim().toLowerCase() !== 's') {
    throw new Error('cancelado pelo operador')
  }
}

/**
 * Idempotência com uma correção sobre a Fase 2 do plano.
 *
 * O plano manda sair se (uf, sha256) já existe em radar_snapshots. Sozinha, essa
 * regra tem um buraco: se a carga falhar no meio, o snapshot já estará gravado e
 * toda re-execução vira no-op, deixando as tabelas incompletas para sempre — e
 * em silêncio. Por isso comparamos também o record_count com o count real.
 */
async function jaCarregado(db: SupabaseClient, sha: string, esperado: number): Promise<boolean> {
  const { data, error } = await db
    .from('radar_snapshots')
    .select('id, record_count')
    .eq('uf', UF_ALVO)
    .eq('sha256', sha)
    .maybeSingle()
  if (error) throw new Error(`consulta a radar_snapshots falhou: ${error.message}`)
  if (!data) return false

  const { count, error: erroCount } = await db
    .from('radar_instruments')
    .select('id', { count: 'exact', head: true })
  if (erroCount) throw new Error(`contagem de radar_instruments falhou: ${erroCount.message}`)

  if (count === esperado) {
    log(`\n  snapshot ${data.id} já carregado, com ${count} instrumentos. Nada a fazer.`)
    return true
  }
  log(
    `\n  snapshot já existe (${data.id}), mas radar_instruments tem ${count} linhas ` +
      `contra ${esperado} esperadas — carga anterior incompleta. Reprocessando.`,
  )
  return false
}
```

- [ ] **Step 2: Acrescentar dedupe, upload e upserts**

Ainda antes de `main()`:

```ts
/**
 * Um upsert em lote com duas linhas de mesma PK falha com "ON CONFLICT DO UPDATE
 * command cannot affect row a second time" — erro duro, que aborta o lote.
 * Medido em 22/09: zero colisões no arquivo real. Isto é seguro contra mudança
 * da fonte, não remendo para defeito conhecido.
 */
function dedupePorChave<T>(linhas: T[], chave: (l: T) => string, rotulo: string): T[] {
  const vistas = new Map<string, T>()
  for (const l of linhas) vistas.set(chave(l), l)
  const removidas = linhas.length - vistas.size
  if (removidas > 0) log(`  ⚠ ${removidas} linha(s) duplicada(s) de ${rotulo} removida(s) do lote`)
  return [...vistas.values()]
}

async function enviarEmLotes<T>(
  db: SupabaseClient,
  tabela: string,
  linhas: T[],
  onConflict: string,
  ignoreDuplicates: boolean,
): Promise<void> {
  for (let i = 0; i < linhas.length; i += LOTE) {
    const lote = linhas.slice(i, i + LOTE)
    const { error } = await db.from(tabela).upsert(lote as never, { onConflict, ignoreDuplicates })
    if (error) {
      throw new Error(`upsert em ${tabela} (lote ${i / LOTE + 1}) falhou: ${error.message}`)
    }
    log(`  ${tabela}: ${Math.min(i + LOTE, linhas.length)}/${linhas.length}`)
  }
}
```

- [ ] **Step 3: Substituir o `throw` provisório de `main()` pela carga real**

Troque a linha `throw new Error('carga real ainda não implementada — ver Task 5')` por:

```ts
  const { db, ref, url } = clienteSupabase()
  await confirmarDestino(ref, url)

  if (await jaCarregado(db, sha, n.instruments.length)) {
    log(`\nNada a fazer. ${Date.now() - t0} ms\n`)
    return
  }

  // A ordem daqui para baixo é imposta pelas FKs:
  // snapshot -> instruments -> faixas / verificações.
  const dia = new Date().toISOString().slice(0, 10)
  const caminho = `radares/${UF_ALVO}/${dia}-${sha.slice(0, 12)}.json`

  log(`\n→ upload de ${caminho} para o bucket ${BUCKET}`)
  const { error: erroUpload } = await db.storage
    .from(BUCKET)
    .upload(caminho, bytes, { contentType: 'application/json', upsert: true })
  if (erroUpload) throw new Error(`upload para o Storage falhou: ${erroUpload.message}`)

  log('→ insert em radar_snapshots')
  const { data: snap, error: erroSnap } = await db
    .from('radar_snapshots')
    .insert({
      uf: UF_ALVO,
      source_url: FONTE,
      last_modified: lastModified,
      sha256: sha,
      storage_path: caminho,
      bytes: bytes.byteLength,
      record_count: n.instruments.length,
    })
    .select('id')
    .single()
  if (erroSnap || !snap) throw new Error(`insert em radar_snapshots falhou: ${erroSnap?.message}`)

  const snapshotId = snap.id as string
  log(`  snapshot_id: ${snapshotId}`)

  // As linhas foram normalizadas com o id fictício; agora recebem o verdadeiro.
  for (const i of n.instruments) i.snapshot_id = snapshotId

  log('→ upserts')
  await enviarEmLotes(
    db,
    'radar_instruments',
    dedupePorChave(n.instruments, (i) => i.id, 'radar_instruments'),
    'id',
    false,
  )
  await enviarEmLotes(
    db,
    'radar_faixas',
    dedupePorChave(n.faixas, (f) => `${f.instrument_id}|${f.numero_faixa}|${f.sentido}`, 'radar_faixas'),
    'instrument_id,numero_faixa,sentido',
    false,
  )
  await enviarEmLotes(
    db,
    'radar_verificacoes',
    dedupePorChave(
      n.verificacoes,
      (v) => `${v.instrument_id}|${v.origem}|${v.numero_certificado}|${v.data_laudo}`,
      'radar_verificacoes',
    ),
    'instrument_id,origem,numero_certificado,data_laudo',
    true, // histórico metrológico é imutável: duplicata é no-op, não atualização
  )

  log(`\n✓ Carga concluída em ${Date.now() - t0} ms.\n`)
```

- [ ] **Step 4: Verificar que o dry-run continua intacto**

Run: `npm run radar:ingest -- --dry-run`
Expected: PASS, os mesmos seis números da Task 4, e **nenhuma** menção a destino, upload ou upsert. O dry-run não pode ter regredido.

- [ ] **Step 5: Commit**

```bash
git add scripts/ingest-radares-rj.ts
git commit -m "feat(radar): carga real — confirmação de destino, idempotência e upserts

A idempotência confere record_count contra o count real: só o sha256
deixaria uma carga interrompida presa em no-op para sempre.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: Executar a carga em produção e provar o ciclo

As cinco tasks anteriores produzem software. Esta produz **dado em produção** — e é a única que prova que a RPC de 06/09, que nunca viu um registro, funciona.

**Files:**
- Modify: `PROGRESSO.md`

**Interfaces:**
- Consumes: o executável completo.
- Produces: as tabelas `radar_*` de produção populadas.

- [ ] **Step 1: Conferir o ponto de partida**

Rode, no projeto `tsdzvxgkokrjqayxukud` (MCP do Supabase ou SQL editor):

```sql
select 'instruments' t, count(*) n from radar_instruments
union all select 'faixas', count(*) from radar_faixas
union all select 'verificacoes', count(*) from radar_verificacoes
union all select 'snapshots', count(*) from radar_snapshots;
```

Expected: quatro linhas com `0`. Se não forem zero, **pare e reporte** — alguém carregou antes, e o plano precisa saber disso.

- [ ] **Step 2: Dry-run, uma última vez**

Run: `npm run radar:ingest -- --dry-run`
Expected: 1.971 / 3.346 / 7.814 / 1.838 / 9.652 / 0 descartes.

- [ ] **Step 3: A carga real**

**Medido em 22/09/2026: `.env.local` existe e aponta para `127.0.0.1:54321`.** Pela regra de precedência
do `CLAUDE.md`, ele vence — então `npm run radar:ingest` mandaria a carga para o banco local, que está
desligado. Por isso existe o `radar:ingest:prod`, que carrega **só o `.env`**.

**Este passo é do Klaus, não do agente.** O prompt de confirmação foi desenhado para um humano ler o
`project ref` e responder; um agente passando `--yes` derrota a única guarda que existe aqui. No Claude
Code, rode com o prefixo `!` para a saída cair na conversa.

Run: `npm run radar:ingest:prod`
Expected: o prompt mostra `project ref: tsdzvxgkokrjqayxukud` — **confira antes de responder `s`**. Depois, o upload e os três upserts completam sem erro.

- [ ] **Step 4: Conferir o resultado no banco**

```sql
select 'instruments' t, count(*) n from radar_instruments
union all select 'faixas', count(*) from radar_faixas
union all select 'verificacoes_historico', count(*) from radar_verificacoes where origem = 'historico'
union all select 'verificacoes_topo', count(*) from radar_verificacoes where origem = 'topo'
union all select 'snapshots', count(*) from radar_snapshots;
```

Expected: `1971`, `3346`, `7814`, `1838`, `1`.

E confira que a prova foi arquivada:

```sql
select storage_path, bytes, record_count, last_modified from radar_snapshots;
```

Expected: `storage_path` preenchido, `bytes = 3661867`, `record_count = 1971`.

- [ ] **Step 5: Provar a idempotência**

Run: `npm run radar:ingest:prod -- --yes`
Expected: `snapshot ... já carregado, com 1971 instrumentos. Nada a fazer.` — e as contagens do Step 4 inalteradas.

- [ ] **Step 6: Provar que a RPC funciona com dado real**

Pegue um número de série do parque e consulte:

```sql
select numero_serie, numero_inmetro from radar_faixas
where numero_serie is not null limit 1;
```

Depois, com esse valor:

```sql
select public.verificar_medidor(
  p_numero_serie := '<o número acima>',
  p_data_infracao := '2026-06-15'::date
);
```

Expected: um JSON com `status`, `confianca`, `metodo_match: "numero_serie"` e o bloco `instrumento` preenchido. **Se os parâmetros não baterem**, leia a assinatura real antes de inventar:

```sql
select pg_get_function_arguments(p.oid) from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'verificar_medidor';
```

- [ ] **Step 7: Registrar em `PROGRESSO.md`**

Acrescente uma entrada de sessão ao fim do arquivo, no tom das existentes, cobrindo: o que foi carregado e os números conferidos; que a pendência 21 **continua aberta** (esta carga conviveu com ela, não a resolveu); que a Fase 2 está entregue **sem** `pg_cron` e **sem** poda, deixando a pendência 19 intacta; e que a Fase 0.5 segue bloqueada por falta de casos reais. Atualize também a seção *Estado atual*, que hoje afirma que as tabelas `radar_*` têm 0 linhas.

- [ ] **Step 8: Commit**

```bash
git add PROGRESSO.md
git commit -m "docs(progresso): carga dos radares do RJ em produção

1.971 instrumentos, 3.346 faixas, 9.652 verificações. A RPC verificar_medidor
respondeu com dado real pela primeira vez.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Depois deste plano

Não entram aqui, e continuam abertos:

- **Pendência 21** — de onde uma ingestão *recorrente* buscaria o arquivo. O teste de alcance por `curl` a partir do VPS, quando ele existir, continua valendo um minuto.
- **Pendência 19** — prazo de retenção dos snapshots. Sem poda, nada a força.
- **Fase 0.5** — calibração contra 8 a 10 notificações reais do RJ; `form_submissions` tem 0 linhas.
- **Fases 4 e 5** — captura dos dados do medidor no formulário e a coluna `form_submissions.verificacao_medidor`, que não existe em migration nenhuma. É o próximo passo natural.
