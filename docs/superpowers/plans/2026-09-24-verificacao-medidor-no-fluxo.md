# Verificação do medidor no fluxo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Edge `form-submit` verifica o medidor de velocidade no envio e grava o resultado no caso e no log de auditoria; o pipeline o transforma num bloco de prompt com regra de redação escolhida em código, atrás da chave `RADAR_TESE_ATIVA` (desligada por padrão).

**Architecture:** Uma migration acrescenta `form_submissions.verificacao_medidor jsonb` e corrige o aviso de "número de certificado ausente" na RPC `verificar_medidor`. A Edge chama a RPC (timeout de 3 s, qualquer falha vira `nao_aplicavel`) entre a gravação do formulário e o `attempt_dispatch`, com a lógica de decisão num módulo TypeScript puro. No pipeline, dois módulos Python puros — `verificacao.py` (regra + bloco) e `prompt.py` (contexto + system prompt, extraídos do `worker.py`) — mantêm tudo testável sem as dependências do venv.

**Tech Stack:** PostgreSQL 15 + pgTAP (via `psql` no container), Deno/Supabase Edge (testado com `node --test` do Node 22, type-stripping nativo), Python 3.12 `unittest` (stdlib), FastAPI worker existente, DeepSeek via SDK `openai`.

**Spec:** `docs/superpowers/specs/2026-09-24-verificacao-medidor-no-fluxo-design.md` — leia antes de começar.

## Global Constraints

- Branch: `feat/radar-fase5-verificacao-no-fluxo` (já criada a partir de `main`).
- Migration nova: `supabase/migrations/20260924000001_verificacao_medidor.sql`. **Nenhuma migration existente é editada.**
- Chave: `RADAR_TESE_ATIVA`, padrão `false`. Com ela desligada, o contexto e o system prompt enviados ao DeepSeek são **idênticos, byte a byte,** aos de antes.
- `verificacao_medidor` **nunca** entra cru no prompt, com a chave ligada ou desligada.
- A verificação **nunca** derruba o envio: nenhum caminho novo na Edge devolve erro ao cliente.
- Timeout da RPC na Edge: `3000` ms.
- Avisos exatos: `"dados do medidor não informados — verificação não realizada"` e `"verificação indisponível"`.
- Aviso da RPC exato: `"a base pública informa a verificação, mas não o número do certificado"`.
- Base legal que o prompt autoriza: **só** "art. 280, inciso V e § 2º, do Código de Trânsito Brasileiro". Nenhuma resolução do CONTRAN, nenhuma portaria do INMETRO.
- Não tocar: `dup_guard`, guarda de 409, bloco do `attempt_dispatch`, contrato do 202, corpo da resposta da `form-submit`, Express (`server/`).
- O `UPDATE` da coluna nova **não** toca `document_status` (invariante do `CLAUDE.md`: reescrever o status manda um segundo e-mail ao cliente).
- Testes Python: sempre `python3 -m unittest <módulos explícitos>` a partir de `pipeline/`. **Nunca `unittest discover`**: `pipeline/test_resend_smtp.py` casa com `test_*.py` e **manda um e-mail real** ao ser importado.
- Nunca instalar nada dentro de `pipeline/.venv` (é um venv de Windows; ver `CLAUDE.md`).
- Nunca rodar `npx supabase db reset` nem `migration up --local` (o histórico local está vazio; ver `CLAUDE.md`). Migration local se aplica pelo `psql`.
- Comentários e textos em português, no estilo dos arquivos vizinhos.
- Todo commit termina com a linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Objeto da verificação incompleto ou de outro formato** (sem `avisos`, `instrumento` nulo, `evidencia` nula, ou o jsonb chegando como string JSON) — o pipeline deve montar o bloco com o que houver, sem `KeyError`/`TypeError`. Testes na Task 4.
2. **`data_infracao` ausente ou malformada na Edge** — a entrada segue com `p_data_infracao: null` (a própria RPC devolve `nao_aplicavel` com aviso próprio), sem exceção. Teste na Task 2.
3. **Números do medidor presentes como string vazia ou só espaço** — contam como ausentes: a RPC não é chamada. Teste na Task 2.
4. **`proprietario` como objeto `{Nome, …}` em vez de texto** (a fonte do INMETRO manda aninhado; foi um defeito real em 22/09) — o bloco usa o `Nome`. Teste na Task 4.
5. **Número de certificado presente no objeto, mas proibido pela regra** (`nao_comprovado`, confiança baixa, `comprovado_valido`) — o número não aparece em lugar nenhum do bloco. Teste na Task 4.

---

## File Structure

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `supabase/migrations/20260924000001_verificacao_medidor.sql` | Criar | Coluna `verificacao_medidor` + `verificar_medidor` com o aviso generalizado |
| `supabase/tests/verificar_medidor_test.sql` | Modificar | 24 → 26 asserções |
| `supabase/functions/form-submit/verificacao.ts` | Criar | Lógica pura: entrada da RPC, fallback, linha do log |
| `supabase/functions/form-submit/verificacao.test.ts` | Criar | Testes `node --test` do módulo |
| `supabase/functions/form-submit/index.ts` | Modificar | Bloco que chama a RPC e grava coluna + log |
| `package.json` | Modificar | `radar:test` cobre o teste novo |
| `pipeline/verificacao.py` | Criar | Regra de redação + bloco em português |
| `pipeline/test_verificacao.py` | Criar | `unittest` do módulo |
| `pipeline/prompt.py` | Criar | `CAMPOS_INTERNOS`, `build_case_context`, `system_prompt` (extraídos do worker) |
| `pipeline/test_prompt.py` | Criar | `unittest`, incluindo "chave desligada = idêntico ao de antes" |
| `pipeline/config.py` | Modificar | `radar_tese_ativa: bool = False` |
| `pipeline/worker.py` | Modificar | Importa de `prompt.py`, passa a chave, loga o bloco |
| `.env.example`, `.env.local.example`, `.env.production.example` | Modificar | `RADAR_TESE_ATIVA=false` |
| `CLAUDE.md`, `PROGRESSO.md`, `PENDENCIAS.md` | Modificar | Estado, invariantes, pendência de ligar a chave |

---

### Task 1: Migration — coluna e aviso generalizado na RPC

**Files:**
- Create: `supabase/migrations/20260924000001_verificacao_medidor.sql`
- Modify: `supabase/tests/verificar_medidor_test.sql`

**Interfaces:**
- Consumes: `verificar_medidor(text, text, date, text, text)` de `20260906000001_fn_verificar_medidor.sql`.
- Produces: coluna `public.form_submissions.verificacao_medidor jsonb` (anulável, sem default); `verificar_medidor` passa a incluir o aviso `"a base pública informa a verificação, mas não o número do certificado"` sempre que `numero_certificado` do certificado vigente for vazio, qualquer que seja a origem.

Pré-requisito: Docker Desktop aberto e `npx supabase start` no ar. O container do banco se chama `supabase_db_tsdzvxgkokrjqayxukud`.

- [ ] **Step 1: Escrever os testes que falham**

Em `supabase/tests/verificar_medidor_test.sql`:

1. Troque `SELECT plan(24);` por `SELECT plan(26);`.
2. No `INSERT INTO radar_instruments`, acrescente a linha (vírgula na linha anterior):
```sql
  ('inst_j', 'NITEROI',        'Av Roberto Silveira',   'Fixo', 'SPLICE',   '11111111-1111-1111-1111-111111111111');
```
3. No `INSERT INTO radar_faixas`, acrescente (vírgula na linha anterior):
```sql
  ('inst_j', '1', '14100009', '3000007', 'Centro',       50);
```
4. No `INSERT INTO radar_verificacoes`, acrescente antes do `;` final (vírgula na linha anterior):
```sql
  -- inst_j: histórico vigente SEM número de certificado — as 81 entradas reais do RJ
  ('inst_j','historico','',        '11',  2026,'2026-01-10','2027-01-09','Periódica','Aprovado')
```
5. Antes de `SELECT * FROM finish();`, acrescente:
```sql
-- ---------------------------------------------------------------------------
-- Número de certificado ausente, qualquer que seja a origem (Fase 5)
-- ---------------------------------------------------------------------------
SELECT ok((verificar_medidor('3000007', NULL, '2026-06-01'))->>'avisos' LIKE '%não o número do certificado%',
          'historico vigente sem numero: o aviso sai tambem, nao so na origem topo');
SELECT ok((verificar_medidor('3000006', NULL, '2026-06-01'))->>'avisos' NOT LIKE '%não o número do certificado%',
          'historico vigente COM numero: sem aviso falso');
```

Sobre o segundo teste: a spec pedia "a regressão de que a origem `topo` continua trazendo o aviso". Essa regressão **já existe** (o teste "e o aviso registra isso…", sobre `3000001`); o teste 26 cobre em seu lugar o risco novo que a troca de condição cria — aviso falso num histórico que tem número.

- [ ] **Step 2: Rodar e ver falhar**

```bash
docker exec -i supabase_db_tsdzvxgkokrjqayxukud psql -U postgres -d postgres -Xqt \
  -f - < supabase/tests/verificar_medidor_test.sql | grep -E '^ *(not )?ok'
```
Esperado: 25 `ok` e **1 `not ok`** — o 25 ("historico vigente sem numero…").

- [ ] **Step 3: Gerar a migration**

A função é copiada do arquivo da Fase 3 com **uma** linha trocada. Gere com o comando abaixo (não redigite o corpo à mão):

```bash
cd /mnt/c/Users/klaus/Coding/Atlas/amorecorrer.com
M=supabase/migrations/20260924000001_verificacao_medidor.sql
cat > "$M" <<'EOF'
-- Verificação do medidor no fluxo do recurso
-- Fase 5 de PLANO-verificacao-radar-inmetro.md · spec:
-- docs/superpowers/specs/2026-09-24-verificacao-medidor-no-fluxo-design.md
--
-- 1. form_submissions.verificacao_medidor — o objeto devolvido por
--    verificar_medidor(), gravado pela Edge `form-submit` antes do
--    attempt_dispatch. Os dois "vazios" significam coisas diferentes:
--      NULL                              -> a verificação nunca rodou
--      {"status":"nao_aplicavel", ...}   -> rodou e não se aplicava, ou falhou
--
-- 2. verificar_medidor() recriada com UMA condição trocada: o aviso de número
--    de certificado ausente saía só para origem 'topo'. Na carga de 22/09/2026,
--    81 das 7.814 verificações de origem 'historico' também vieram sem número,
--    e a peça poderia afirmar vigência sem número e sem ressalva.
--
-- Deploy: sobe ANTES da Edge que grava a coluna.

ALTER TABLE public.form_submissions
  ADD COLUMN IF NOT EXISTS verificacao_medidor jsonb;

COMMENT ON COLUMN public.form_submissions.verificacao_medidor IS
  'Resultado de verificar_medidor() gravado no envio do formulário. NULL = nunca verificado; status nao_aplicavel = sem números do medidor ou verificação indisponível.';

EOF
awk '/^CREATE OR REPLACE FUNCTION public\.verificar_medidor\(/{p=1} p' \
    supabase/migrations/20260906000001_fn_verificar_medidor.sql \
  | sed "s/    IF v_cert.origem = 'topo' THEN/    IF nullif(v_cert.numero_certificado, '') IS NULL THEN/" \
  >> "$M"
grep -c "IF nullif(v_cert.numero_certificado, '') IS NULL THEN" "$M"
grep -c "v_cert.origem = 'topo'" "$M"
tail -3 "$M"
```
Esperado: `1`, depois `0`, e as três últimas linhas são o `COMMENT ON FUNCTION`, o `REVOKE` e o `GRANT … TO service_role;`.

- [ ] **Step 4: Aplicar localmente e ver passar**

```bash
docker exec -i supabase_db_tsdzvxgkokrjqayxukud psql -U postgres -d postgres -v ON_ERROR_STOP=1 -X \
  -f - < supabase/migrations/20260924000001_verificacao_medidor.sql
docker exec -i supabase_db_tsdzvxgkokrjqayxukud psql -U postgres -d postgres -Xqt \
  -f - < supabase/tests/verificar_medidor_test.sql | grep -E '^ *(not )?ok' | sort | uniq -c | sed 's/ok [0-9]*.*/ok/' | uniq -c
docker exec -i supabase_db_tsdzvxgkokrjqayxukud psql -U postgres -d postgres -Xqt \
  -c "select data_type, is_nullable from information_schema.columns where table_name='form_submissions' and column_name='verificacao_medidor'"
npx supabase db query --local -f tests/sql/assert_storage_setup.sql
```
Esperado: nenhuma linha `not ok` e 26 `ok`; a coluna `jsonb | YES`; a asserção de Storage termina em `DO`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260924000001_verificacao_medidor.sql supabase/tests/verificar_medidor_test.sql
git commit -m "feat(radar): coluna verificacao_medidor e aviso de nº de certificado ausente em qualquer origem

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Edge — módulo puro da verificação

**Files:**
- Create: `supabase/functions/form-submit/verificacao.ts`
- Create: `supabase/functions/form-submit/verificacao.test.ts`
- Modify: `package.json` (script `radar:test`)

**Interfaces:**
- Consumes: nada (sem imports).
- Produces:
  - `AVISO_SEM_DADOS: string`, `AVISO_INDISPONIVEL: string`, `VERIFICACAO_TIMEOUT_MS: number` (= 3000)
  - `type EntradaVerificacao = { p_numero_serie: string | null; p_numero_inmetro: string | null; p_data_infracao: string | null; p_municipio: null; p_local: null }`
  - `type Verificacao = { status: string; confianca: string; metodo_match: string; avisos: string[]; [chave: string]: unknown }`
  - `entradaDaVerificacao(norm: Record<string, unknown>): EntradaVerificacao | null`
  - `naoAplicavel(aviso: string): Verificacao`
  - `linhaDoLog(caseId: string, entrada: EntradaVerificacao | null, resultado: Verificacao, agora?: Date): LinhaDoLog`

- [ ] **Step 1: Escrever o teste que falha**

`supabase/functions/form-submit/verificacao.test.ts`:
```ts
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
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
node --test supabase/functions/form-submit/verificacao.test.ts 2>&1 | grep -E '^# (pass|fail)'
```
Esperado: `# fail 1` (o módulo não existe).

- [ ] **Step 3: Implementar**

`supabase/functions/form-submit/verificacao.ts`:
```ts
/*
 * Verificação do medidor de velocidade no envio do formulário — Fase 5 de
 * PLANO-verificacao-radar-inmetro.md (spec em
 * docs/superpowers/specs/2026-09-24-verificacao-medidor-no-fluxo-design.md).
 *
 * Só lógica pura, sem imports: roda no Deno da Edge e no `node --test` do
 * `npm run radar:test` (o Deno não está instalado no WSL). Quem fala com o
 * banco é o `index.ts`.
 */

export const AVISO_SEM_DADOS = "dados do medidor não informados — verificação não realizada";
export const AVISO_INDISPONIVEL = "verificação indisponível";

// A verificação nunca pode derrubar o envio nem segurá-lo: o cliente pagou
// pela peça, não pela verificação.
export const VERIFICACAO_TIMEOUT_MS = 3000;

export type EntradaVerificacao = {
  p_numero_serie: string | null;
  p_numero_inmetro: string | null;
  p_data_infracao: string | null;
  // Sempre null: o formulário não tem município da infração (`cidade` é o
  // endereço do cliente), e extrair de `localSentido` seria chute.
  p_municipio: null;
  p_local: null;
};

export type Verificacao = {
  status: string;
  confianca: string;
  metodo_match: string;
  avisos: string[];
  [chave: string]: unknown;
};

export type LinhaDoLog = {
  case_id: string;
  consultado_em: string;
  entrada: EntradaVerificacao | null;
  resultado: Verificacao;
  status: string | null;
  confianca: string | null;
  metodo_match: string | null;
  revisado_por: null;
  revisado_em: null;
};

function texto(valor: unknown): string | null {
  return typeof valor === "string" && valor.trim() ? valor.trim() : null;
}

/*
 * Sem nº de série NEM nº INMETRO, não se consulta: a RPC devolveria
 * `sem_registro` com "instrumento não localizado na base pública" — falso,
 * porque não houve busca.
 */
export function entradaDaVerificacao(norm: Record<string, unknown>): EntradaVerificacao | null {
  const serie = texto(norm.medidor_numero_serie);
  const inmetro = texto(norm.medidor_numero_inmetro);
  if (!serie && !inmetro) return null;

  // `data_infracao` é o relógio de parede do papel ("2026-09-01T23:30:00"),
  // sem fuso. O dia são os 10 primeiros caracteres — converter para Date
  // deslocaria a data em 3h e mudaria o dia de quem foi multado à noite.
  const data = texto(norm.data_infracao);
  const dia = data && /^\d{4}-\d{2}-\d{2}/.test(data) ? data.slice(0, 10) : null;

  return {
    p_numero_serie: serie,
    p_numero_inmetro: inmetro,
    p_data_infracao: dia,
    p_municipio: null,
    p_local: null,
  };
}

/* O objeto de quando não houve verificação, no mesmo formato do contrato. */
export function naoAplicavel(aviso: string): Verificacao {
  return {
    status: "nao_aplicavel",
    confianca: "baixa",
    metodo_match: "nenhum",
    instrumento: null,
    certificado_vigente: null,
    certificados_proximos: [],
    evidencia: null,
    avisos: [aviso],
  };
}

/*
 * Uma linha por caso (`case_id` é UNIQUE em radar_consultas_log). A revisão
 * humana é zerada de propósito: uma consulta nova, com dados novos, invalida o
 * que foi revisado sobre os anteriores.
 */
export function linhaDoLog(
  caseId: string,
  entrada: EntradaVerificacao | null,
  resultado: Verificacao,
  agora: Date = new Date(),
): LinhaDoLog {
  return {
    case_id: caseId,
    consultado_em: agora.toISOString(),
    entrada,
    resultado,
    status: resultado.status ?? null,
    confianca: resultado.confianca ?? null,
    metodo_match: resultado.metodo_match ?? null,
    revisado_por: null,
    revisado_em: null,
  };
}
```

No `package.json`, troque a linha do `radar:test` por:
```json
    "radar:test": "node --test \"scripts/lib/*.test.ts\" \"src/lib/*.test.ts\" \"supabase/functions/form-submit/*.test.ts\"",
```

- [ ] **Step 4: Rodar e ver passar**

```bash
npm run radar:test 2>&1 | grep -E '^# (tests|pass|fail)'
npx eslint supabase/functions/form-submit/verificacao.ts supabase/functions/form-submit/verificacao.test.ts
```
Esperado: `# tests 49`, `# pass 49`, `# fail 0` (41 antigos + 8 novos); eslint sem saída.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/form-submit/verificacao.ts supabase/functions/form-submit/verificacao.test.ts package.json
git commit -m "feat(radar): lógica pura da verificação do medidor na form-submit

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Edge — chamar a RPC, gravar coluna e log

**Files:**
- Modify: `supabase/functions/form-submit/index.ts` (import no topo; bloco novo logo depois de `if (upsertErr) { … }` e antes de `// After successful update, attempt dispatch via RPC`)

**Interfaces:**
- Consumes: tudo o que a Task 2 produz; coluna da Task 1; tabela `radar_consultas_log` (existente).
- Produces: `form_submissions.verificacao_medidor` e uma linha em `radar_consultas_log` por caso enviado.

Pré-requisitos: Task 1 aplicada no banco local; Supabase local no ar.

- [ ] **Step 1: Import**

Logo abaixo de `import { createClient } from "jsr:@supabase/supabase-js@2";`:
```ts
import {
  AVISO_INDISPONIVEL,
  AVISO_SEM_DADOS,
  VERIFICACAO_TIMEOUT_MS,
  entradaDaVerificacao,
  linhaDoLog,
  naoAplicavel,
  type Verificacao,
} from "./verificacao.ts";
```

- [ ] **Step 2: O bloco**

Imediatamente depois de:
```ts
    if (upsertErr) {
      console.error("DB update error:", upsertErr);
      return bad("DB upsert error", 500, corsHeadersForOrigin);
    }
```
insira:
```ts

    // Verificação do medidor de velocidade — Fase 5 do plano do radar.
    //
    // ANTES do attempt_dispatch, para o pipeline já ler o caso com ela. Nada
    // aqui pode derrubar o envio: toda falha vira `nao_aplicavel` e é só
    // logada. O UPDATE não toca document_status (ver o comentário do INSERT
    // acima: reescrevê-lo manda um segundo e-mail ao cliente).
    try {
      const entrada = entradaDaVerificacao(norm);
      let verificacao: Verificacao = naoAplicavel(AVISO_SEM_DADOS);

      if (entrada) {
        const { data, error } = await supabase
          .rpc("verificar_medidor", entrada)
          .abortSignal(AbortSignal.timeout(VERIFICACAO_TIMEOUT_MS));
        if (error || !data) {
          console.error("[radar] verificar_medidor_falhou", {
            case_id: norm.case_id,
            error: error ? formatDispatchError(error) : "resposta vazia"
          });
          verificacao = naoAplicavel(AVISO_INDISPONIVEL);
        } else {
          verificacao = data as Verificacao;
        }
      }

      const { error: colunaErr } = await supabase
        .from("form_submissions")
        .update({ verificacao_medidor: verificacao })
        .eq("case_id", norm.case_id);
      if (colunaErr) {
        console.error("[radar] gravar_verificacao_falhou", {
          case_id: norm.case_id,
          error: formatDispatchError(colunaErr)
        });
      }

      // Também para `nao_aplicavel`: a calibração precisa saber quantos casos
      // chegam sem os números do medidor.
      const { error: logErr } = await supabase
        .from("radar_consultas_log")
        .upsert(linhaDoLog(String(norm.case_id), entrada, verificacao), { onConflict: "case_id" });
      if (logErr) {
        console.error("[radar] log_consulta_falhou", {
          case_id: norm.case_id,
          error: formatDispatchError(logErr)
        });
      }
    } catch (err) {
      console.error("[radar] verificacao_excecao", {
        case_id: norm.case_id,
        error: err instanceof Error ? err.message : String(err)
      });
    }
```

- [ ] **Step 3: Lint e testes**

```bash
npx eslint supabase/functions/form-submit/index.ts
npm run radar:test 2>&1 | grep -E '^# (pass|fail)'
```
Esperado: eslint sem saída; `# pass 49`, `# fail 0`.

- [ ] **Step 4: Carregar o parque do RJ no banco local**

```bash
npm run radar:ingest -- --yes 2>&1 | tail -5
docker exec -i supabase_db_tsdzvxgkokrjqayxukud psql -U postgres -d postgres -Xqt \
  -c "select count(*) from radar_instruments" -c "select count(*) from radar_verificacoes"
```
Esperado: `1971` e `9652`. (Com `.env.local` presente, o `radar:ingest` vai para o banco local. Se a fonte falhar com `TypeError: terminated`, rode de novo — a fonte é errática; ver `PROGRESSO.md` de 22/09.)

- [ ] **Step 5: Escolher aparelhos reais para os casos**

```bash
D="docker exec -i supabase_db_tsdzvxgkokrjqayxukud psql -U postgres -d postgres -Xqt -A -F |"
$D -c "
with unicas as (select numero_serie from radar_faixas group by 1 having count(distinct instrument_id)=1),
cand as (
  select f.numero_serie, (v.data_laudo + 30) as dia, v.resultado
  from radar_faixas f join radar_verificacoes v using (instrument_id)
  where f.numero_serie in (select numero_serie from unicas)
    and v.origem='historico' and v.numero_certificado<>'' and v.data_laudo + 30 <= v.data_validade)
select 'valido', numero_serie, dia from cand
 where resultado='Aprovado'
   and verificar_medidor(numero_serie, null, dia)->>'status'='comprovado_valido' limit 1;"
$D -c "
with unicas as (select numero_serie from radar_faixas group by 1 having count(distinct instrument_id)=1)
select 'reprovado', f.numero_serie, v.data_laudo
  from radar_faixas f join radar_verificacoes v using (instrument_id)
 where f.numero_serie in (select numero_serie from unicas) and v.resultado='Reprovado'
   and verificar_medidor(f.numero_serie, null, v.data_laudo)->>'status'='reprovado' limit 1;"
```
Esperado: uma linha `valido|<SERIE_VALIDO>|<DIA_VALIDO>` e uma `reprovado|<SERIE_REPROVADO>|<DIA_REPROVADO>`. Anote os quatro valores.

- [ ] **Step 6: Subir a Edge local e semear quatro sessões**

```bash
SCRATCH=$(mktemp -d); echo $SCRATCH
npx supabase functions serve --env-file .env.local > $SCRATCH/functions.log 2>&1 &
docker exec -i supabase_db_tsdzvxgkokrjqayxukud psql -U postgres -d postgres -Xq -c "
insert into stripe_sessions (id, case_id) values
 ('cs_test_f5_sem',  'CASO_00000000-0000-4000-8000-00000000f501'),
 ('cs_test_f5_val',  'CASO_00000000-0000-4000-8000-00000000f502'),
 ('cs_test_f5_rep',  'CASO_00000000-0000-4000-8000-00000000f503'),
 ('cs_test_f5_falha','CASO_00000000-0000-4000-8000-00000000f504');"
timeout 120 bash -c 'until curl -s -o /dev/null -X OPTIONS http://127.0.0.1:54321/functions/v1/form-submit; do sleep 3; done'
```

- [ ] **Step 7: Os quatro envios**

Defina a função de envio e rode os três primeiros casos (substitua `<SERIE_…>` e `<DIA_…>` pelos valores do Step 5):
```bash
enviar() {  # $1 = sufixo do case_id, $2 = série (ou vazio), $3 = dia AAAA-MM-DD
  curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:54321/functions/v1/form-submit \
    -H "Origin: http://localhost:8080" -H "Content-Type: application/json" \
    -d "{\"case_id\":\"CASO_00000000-0000-4000-8000-00000000$1\",\"form_token\":\"tok-$1\",\"nome\":\"Teste $1\",\"email\":\"$1@example.com\",\"data_infracao\":\"$3T08:30:00\",\"medidor_numero_serie\":\"$2\"}"
}
enviar f501 "" 2026-09-01
enviar f502 "<SERIE_VALIDO>" "<DIA_VALIDO>"
enviar f503 "<SERIE_REPROVADO>" "<DIA_REPROVADO>"
```
Esperado: `200` três vezes.

Agora a falha simulada — tira a permissão da Edge (service role), envia, e **devolve a permissão**:
```bash
docker exec -i supabase_db_tsdzvxgkokrjqayxukud psql -U postgres -d postgres -Xq \
  -c "REVOKE EXECUTE ON FUNCTION public.verificar_medidor(text, text, date, text, text) FROM service_role;"
enviar f504 "<SERIE_VALIDO>" "<DIA_VALIDO>"
docker exec -i supabase_db_tsdzvxgkokrjqayxukud psql -U postgres -d postgres -Xq \
  -c "GRANT EXECUTE ON FUNCTION public.verificar_medidor(text, text, date, text, text) TO service_role;"
```
Esperado: `200`.

- [ ] **Step 8: Conferir coluna, log e o attempt_dispatch**

```bash
docker exec -i supabase_db_tsdzvxgkokrjqayxukud psql -U postgres -d postgres -Xq -c "
select right(f.case_id,4) as caso, f.document_status,
       f.verificacao_medidor->>'status' as status_col, f.verificacao_medidor->'avisos' as avisos,
       l.status as status_log, l.entrada is null as sem_entrada
  from form_submissions f left join radar_consultas_log l using (case_id)
 where f.case_id like 'CASO_00000000-0000-4000-8000-00000000f5%' order by 1;"
grep -A8 -E "\[radar\]|\[dispatch\]" $SCRATCH/functions.log | grep -E "\[radar\]|\[dispatch\]|case_id"
```
Esperado:

| caso | document_status | status_col | status_log | sem_entrada | avisos contém |
|---|---|---|---|---|---|
| f501 | pending | nao_aplicavel | nao_aplicavel | t | "dados do medidor não informados…" |
| f502 | pending | comprovado_valido | comprovado_valido | f | — |
| f503 | pending | reprovado | reprovado | f | — |
| f504 | pending | nao_aplicavel | nao_aplicavel | f | "verificação indisponível" |

E no log (o Deno imprime o objeto em várias linhas, por isso o `-A8`): uma linha `[radar] verificar_medidor_falhou` seguida do `case_id` do `f504`, e **para cada um dos quatro** `case_id` uma linha `[dispatch] dispatch_ignorado` ou `dispatch_aguardando_pagamento` — a prova de que o `attempt_dispatch` rodou depois da verificação, inclusive no caso da falha.

Deixe a Edge local no ar e **não apague** esses casos: a Task 6 usa o f502 e o f503.

- [ ] **Step 9: Commit**

```bash
git add supabase/functions/form-submit/index.ts
git commit -m "feat(radar): form-submit verifica o medidor antes do attempt_dispatch

A verificação grava form_submissions.verificacao_medidor e uma linha em
radar_consultas_log. Timeout de 3 s; qualquer falha vira nao_aplicavel e o
envio segue.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Pipeline — regra de redação e bloco do prompt

**Files:**
- Create: `pipeline/verificacao.py`
- Create: `pipeline/test_verificacao.py`

**Interfaces:**
- Consumes: o objeto de `verificar_medidor` (dict, ou string JSON dele).
- Produces:
  - `INSTRUCAO_REPROVADO: str`, `INSTRUCAO_COMPROVADO: str`, `INSTRUCAO_EXIBICAO: str`
  - `instrucao_de_redacao(v: Any) -> str | None`
  - `bloco_verificacao(v: Any) -> str | None`

- [ ] **Step 1: Escrever o teste que falha**

`pipeline/test_verificacao.py`:
```python
"""Testes de verificacao.py. Rodar de dentro de pipeline/:

    python3 -m unittest test_verificacao -v

Nunca `unittest discover`: test_resend_smtp.py manda e-mail real ao ser importado.
"""

import json
import unittest

from verificacao import (
    INSTRUCAO_COMPROVADO,
    INSTRUCAO_EXIBICAO,
    INSTRUCAO_REPROVADO,
    bloco_verificacao,
    instrucao_de_redacao,
)


def verificacao(**sobre):
    base = {
        "status": "reprovado",
        "confianca": "alta",
        "metodo_match": "numero_serie",
        "instrumento": {
            "municipio": "RIO DE JANEIRO",
            "local_via": "Est Rio Grande Px1096",
            "proprietario": "CONSILUX",
        },
        "certificado_vigente": {
            "origem": "historico",
            "numero": "13785621",
            "data_laudo": "2024-07-12",
            "data_validade": "2025-07-11",
            "resultado": "Reprovado",
        },
        "evidencia": {"capturado_em": "2026-09-22T04:30:00+00:00"},
        "avisos": [],
    }
    base.update(sobre)
    return base


class TestInstrucao(unittest.TestCase):
    def test_nulo_e_nao_aplicavel_sem_instrucao(self):
        self.assertIsNone(instrucao_de_redacao(None))
        self.assertIsNone(instrucao_de_redacao({"status": "nao_aplicavel", "confianca": "baixa"}))
        self.assertIsNone(instrucao_de_redacao({}))

    def test_reprovado_alta_e_tese_forte(self):
        self.assertEqual(instrucao_de_redacao(verificacao()), INSTRUCAO_REPROVADO)

    def test_comprovado_alta_descarta_a_tese(self):
        self.assertEqual(instrucao_de_redacao(verificacao(status="comprovado_valido")), INSTRUCAO_COMPROVADO)

    def test_confianca_nao_alta_vence_o_status(self):
        for status in ("reprovado", "comprovado_valido"):
            for confianca in ("baixa", "media", None):
                with self.subTest(status=status, confianca=confianca):
                    self.assertEqual(
                        instrucao_de_redacao(verificacao(status=status, confianca=confianca)),
                        INSTRUCAO_EXIBICAO,
                    )

    def test_demais_status_pedem_exibicao(self):
        for status in ("nao_comprovado", "sem_registro", "ambiguo", "status_que_nao_existe"):
            with self.subTest(status=status):
                self.assertEqual(instrucao_de_redacao(verificacao(status=status)), INSTRUCAO_EXIBICAO)

    def test_string_json_e_aceita(self):
        self.assertEqual(instrucao_de_redacao(json.dumps(verificacao())), INSTRUCAO_REPROVADO)
        self.assertIsNone(instrucao_de_redacao("isto não é json"))


class TestBloco(unittest.TestCase):
    def test_nao_aplicavel_sem_bloco(self):
        self.assertIsNone(bloco_verificacao({"status": "nao_aplicavel", "confianca": "baixa"}))
        self.assertIsNone(bloco_verificacao(None))

    def test_reprovado_cita_certificado_equipamento_e_fonte(self):
        b = bloco_verificacao(verificacao())
        self.assertIn("reprovado", b)
        self.assertIn("12/07/2024", b)
        self.assertIn("11/07/2025", b)
        self.assertIn("13785621", b)
        self.assertIn("Est Rio Grande Px1096, RIO DE JANEIRO", b)
        self.assertIn("CONSILUX", b)
        self.assertIn("capturada em 22/09/2026", b)
        self.assertTrue(b.rstrip().endswith(INSTRUCAO_REPROVADO))

    def test_reprovado_sem_numero_nao_inventa(self):
        cert = dict(verificacao()["certificado_vigente"], numero=None)
        b = bloco_verificacao(verificacao(certificado_vigente=cert))
        self.assertNotIn("nº", b)
        self.assertIn("12/07/2024", b)

    def test_numero_proibido_nunca_aparece(self):
        casos = [
            verificacao(status="nao_comprovado"),
            verificacao(status="reprovado", confianca="baixa"),
            verificacao(status="comprovado_valido"),
            verificacao(status="ambiguo"),
        ]
        for v in casos:
            with self.subTest(status=v["status"], confianca=v["confianca"]):
                b = bloco_verificacao(v)
                self.assertNotIn("13785621", b)
                self.assertNotIn("CONSILUX", b)

    def test_exibicao_nao_diz_reprovado(self):
        b = bloco_verificacao(verificacao(status="reprovado", confianca="baixa"))
        self.assertNotIn("foi reprovado", b)
        self.assertTrue(b.rstrip().endswith(INSTRUCAO_EXIBICAO))

    def test_avisos_da_base_entram(self):
        b = bloco_verificacao(verificacao(
            status="nao_comprovado",
            avisos=["ausência de certificado na base pública não comprova ausência de verificação"],
        ))
        self.assertIn("não comprova ausência de verificação", b)

    def test_objeto_incompleto_nao_quebra(self):
        b = bloco_verificacao({"status": "reprovado", "confianca": "alta"})
        self.assertIsNotNone(b)
        self.assertNotIn("Fonte", b)
        self.assertNotIn("Equipamento", b)

    def test_campos_nulos_nao_quebram(self):
        b = bloco_verificacao(verificacao(instrumento=None, certificado_vigente=None, evidencia=None, avisos=None))
        self.assertTrue(b.rstrip().endswith(INSTRUCAO_REPROVADO))

    def test_proprietario_aninhado_usa_o_nome(self):
        inst = {"municipio": "RIO DE JANEIRO", "local_via": "Est X",
                "proprietario": {"Nome": "SPLICE", "Municipio": "X", "Estado": "RJ"}}
        b = bloco_verificacao(verificacao(instrumento=inst))
        self.assertIn("proprietário: SPLICE", b)
        self.assertNotIn("Estado", b)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd /mnt/c/Users/klaus/Coding/Atlas/amorecorrer.com/pipeline && python3 -m unittest test_verificacao 2>&1 | tail -3
```
Esperado: `ModuleNotFoundError: No module named 'verificacao'`.

- [ ] **Step 3: Implementar**

`pipeline/verificacao.py`:
```python
"""Verificação do medidor -> texto do prompt. Fase 5 do plano do radar.

Puro, sem dependências: testável com unittest fora do venv de Windows.

A regra de redação é escolhida AQUI, em código. O modelo recebe uma
instrução só, já decidida, e o que a regra proíbe citar nem chega ao bloco —
ele não tem como citar o que não recebeu.
"""

from __future__ import annotations

import json
from typing import Any

INSTRUCAO_REPROVADO = (
    "Sustente que o equipamento medidor foi reprovado na verificação metrológica que "
    "cobre a data da infração, citando a data do laudo e o resultado informados acima, "
    "e o número do certificado somente se ele constar acima."
)
INSTRUCAO_COMPROVADO = (
    "Não levante tese sobre a verificação metrológica do equipamento e não mencione "
    "esta consulta na peça."
)
INSTRUCAO_EXIBICAO = (
    "Requeira que o órgão autuador junte aos autos o certificado de verificação "
    "metrológica do equipamento vigente na data da infração, informando que a consulta "
    "à base pública de dados abertos do INMETRO não o localizou. Não afirme que o "
    "equipamento estava sem verificação ou irregular, e não cite número de certificado."
)

_RESULTADO = {
    INSTRUCAO_REPROVADO: "o equipamento foi reprovado na verificação metrológica que cobre a data da infração.",
    INSTRUCAO_COMPROVADO: "há verificação metrológica vigente na data da infração.",
    INSTRUCAO_EXIBICAO: (
        "a consulta à base pública não localizou, com segurança, verificação "
        "metrológica vigente na data da infração."
    ),
}


def _como_dict(v: Any) -> dict | None:
    # O Express devolve o jsonb já como objeto; string JSON é defesa, não caso esperado.
    if isinstance(v, str):
        try:
            v = json.loads(v)
        except ValueError:
            return None
    return v if isinstance(v, dict) else None


def _data_br(valor: Any) -> str | None:
    s = str(valor or "")[:10]
    if len(s) == 10 and s[4] == "-" and s[7] == "-":
        return f"{s[8:10]}/{s[5:7]}/{s[0:4]}"
    return None


def _proprietario(valor: Any) -> str | None:
    # A fonte do INMETRO manda {Nome, Municipio, Estado}; a carga grava o nome.
    if isinstance(valor, dict):
        valor = valor.get("Nome")
    return str(valor).strip() if valor else None


def instrucao_de_redacao(v: Any) -> str | None:
    """Precedência da spec (§5.2): a primeira regra que casar vence."""
    v = _como_dict(v)
    if not v:
        return None
    status = v.get("status")
    if status in (None, "nao_aplicavel"):
        return None
    # Só confiança alta libera tese forte ou descarte. `media` existe no
    # contrato, ainda que a RPC hoje só produza `alta` e `baixa`.
    if v.get("confianca") != "alta":
        return INSTRUCAO_EXIBICAO
    if status == "reprovado":
        return INSTRUCAO_REPROVADO
    if status == "comprovado_valido":
        return INSTRUCAO_COMPROVADO
    return INSTRUCAO_EXIBICAO


def bloco_verificacao(v: Any) -> str | None:
    v = _como_dict(v)
    instrucao = instrucao_de_redacao(v)
    if instrucao is None:
        return None

    linhas = [
        "Verificação metrológica do medidor de velocidade (consulta automática à base do INMETRO):",
        f"- Resultado: {_RESULTADO[instrucao]}",
    ]

    # Equipamento e certificado só entram quando a regra manda citá-los.
    if instrucao == INSTRUCAO_REPROVADO:
        inst = v.get("instrumento") or {}
        local = ", ".join(p for p in (inst.get("local_via"), inst.get("municipio")) if p)
        if local:
            dono = _proprietario(inst.get("proprietario"))
            linhas.append(f"- Equipamento: {local}" + (f" (proprietário: {dono})" if dono else ""))

        cert = v.get("certificado_vigente") or {}
        partes = []
        laudo = _data_br(cert.get("data_laudo"))
        if laudo:
            partes.append(f"laudo de {laudo}")
        validade = _data_br(cert.get("data_validade"))
        if validade:
            partes.append(f"válido até {validade}")
        if cert.get("resultado"):
            partes.append(f"resultado: {cert['resultado']}")
        if cert.get("numero"):
            partes.append(f"certificado nº {cert['numero']}")
        if partes:
            linhas.append("- Verificação que cobre a data: " + ", ".join(partes))

    avisos = [str(a) for a in (v.get("avisos") or []) if a]
    if avisos:
        linhas.append("- Ressalvas da base: " + "; ".join(avisos))

    capturado = _data_br((v.get("evidencia") or {}).get("capturado_em"))
    if capturado:
        linhas.append(f"- Fonte: base de dados abertos do INMETRO/RBMLQ, capturada em {capturado}.")

    linhas.append(f"Instrução para a redação: {instrucao}")
    return "\n".join(linhas)
```

- [ ] **Step 4: Rodar e ver passar**

```bash
cd /mnt/c/Users/klaus/Coding/Atlas/amorecorrer.com/pipeline && python3 -m unittest test_verificacao -v 2>&1 | tail -4
```
Esperado: `Ran 16 tests` e `OK`.

- [ ] **Step 5: Commit**

```bash
cd /mnt/c/Users/klaus/Coding/Atlas/amorecorrer.com
git add pipeline/verificacao.py pipeline/test_verificacao.py
git commit -m "feat(radar): regra de redação e bloco do prompt para a verificação do medidor

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Pipeline — contexto, system prompt, chave e worker

**Files:**
- Create: `pipeline/prompt.py`
- Create: `pipeline/test_prompt.py`
- Modify: `pipeline/config.py` (campo novo depois de `deepseek_model`)
- Modify: `pipeline/worker.py` (remove `CAMPOS_INTERNOS` e `build_case_context`, linhas 141–171; `call_deepseek`, linhas 107–138; chamada em `run_dispatch_pipeline`, linha 301)

**Interfaces:**
- Consumes: `bloco_verificacao` da Task 4.
- Produces:
  - `SYSTEM_PROMPT_BASE: str`, `REGRAS_RADAR: str`, `CAMPOS_INTERNOS: frozenset[str]`
  - `system_prompt(tese_ativa: bool) -> str`
  - `build_case_context(case: dict[str, Any], tese_ativa: bool = False) -> str`
  - `settings.radar_tese_ativa: bool` (padrão `False`, variável `RADAR_TESE_ATIVA`)
  - `call_deepseek(text_context: str) -> str` mantém a assinatura.

- [ ] **Step 1: Escrever o teste que falha**

`pipeline/test_prompt.py`:
```python
"""Testes de prompt.py. Rodar de dentro de pipeline/:

    python3 -m unittest test_prompt -v

Nunca `unittest discover`: test_resend_smtp.py manda e-mail real ao ser importado.
"""

import unittest

from prompt import CAMPOS_INTERNOS, REGRAS_RADAR, build_case_context, system_prompt
from verificacao import INSTRUCAO_EXIBICAO

# O system prompt exato de antes da Fase 5 (worker.py, call_deepseek).
PROMPT_ANTIGO = (
    "Você é um assistente jurídico que redige rascunhos de recurso de multa de trânsito "
    "em português do Brasil. Seja formal, claro e cite fatos do formulário. "
    "Não invente dados ausentes. Produza 2 a 4 parágrafos."
)

CASO = {
    "id": "uuid",
    "case_id": "CASO_x",
    "nome": "Fulana",
    "placa": "ABC1D23",
    "velocidade_aferida": 55,
    "justificativa": "",
    "cpf": None,
    "medidor_numero_serie": "2000065",
    "verificacao_medidor": {
        "status": "nao_comprovado",
        "confianca": "baixa",
        "metodo_match": "numero_serie",
        "certificado_vigente": None,
        "avisos": [],
    },
}

# O contexto exato que a implementação de antes produzia para CASO, sem a
# coluna nova (que não existia).
CONTEXTO_ANTIGO = (
    "Dados do caso para o recurso:\n"
    "medidor_numero_serie: 2000065\n"
    "nome: Fulana\n"
    "placa: ABC1D23\n"
    "velocidade_aferida: 55"
)


class TestChaveDesligada(unittest.TestCase):
    def test_system_prompt_identico_ao_de_antes(self):
        self.assertEqual(system_prompt(False), PROMPT_ANTIGO)

    def test_contexto_identico_ao_de_antes(self):
        self.assertEqual(build_case_context(CASO, False), CONTEXTO_ANTIGO)
        self.assertEqual(build_case_context(CASO), CONTEXTO_ANTIGO)

    def test_dict_cru_nunca_entra(self):
        self.assertIn("verificacao_medidor", CAMPOS_INTERNOS)
        for ativa in (False, True):
            with self.subTest(tese_ativa=ativa):
                ctx = build_case_context(CASO, ativa)
                self.assertNotIn("verificacao_medidor", ctx)
                self.assertNotIn("{'status'", ctx)


class TestChaveLigada(unittest.TestCase):
    def test_system_prompt_ganha_as_regras(self):
        self.assertEqual(system_prompt(True), PROMPT_ANTIGO + REGRAS_RADAR)
        self.assertIn("art. 280, inciso V e § 2º", REGRAS_RADAR)
        self.assertIn("CONTRAN", REGRAS_RADAR)

    def test_bloco_logo_depois_do_cabecalho(self):
        ctx = build_case_context(CASO, True)
        self.assertTrue(ctx.startswith("Dados do caso para o recurso:\nVerificação metrológica"))
        self.assertIn(INSTRUCAO_EXIBICAO, ctx)
        self.assertTrue(ctx.endswith("velocidade_aferida: 55"))

    def test_bloco_fica_fora_do_corte_de_200_linhas(self):
        caso = dict(CASO, **{f"campo_{i:03d}": "x" for i in range(300)})
        ctx = build_case_context(caso, True)
        self.assertIn(INSTRUCAO_EXIBICAO, ctx)
        linhas_de_campo = [l for l in ctx.splitlines() if l.startswith("campo_")]
        self.assertEqual(len(linhas_de_campo), 200)

    def test_nao_aplicavel_sem_bloco(self):
        caso = dict(CASO, verificacao_medidor={"status": "nao_aplicavel", "confianca": "baixa"})
        self.assertEqual(build_case_context(caso, True), CONTEXTO_ANTIGO)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd /mnt/c/Users/klaus/Coding/Atlas/amorecorrer.com/pipeline && python3 -m unittest test_prompt 2>&1 | tail -3
```
Esperado: `ModuleNotFoundError: No module named 'prompt'`.

- [ ] **Step 3: Criar `pipeline/prompt.py`**

`CAMPOS_INTERNOS` e `build_case_context` saem do `worker.py` **com o comentário que os acompanha**, mais o campo novo:
```python
"""Monta o que vai ao DeepSeek: o contexto do caso e o system prompt.

Extraído de worker.py na Fase 5 do plano do radar para ser testável sem as
dependências do venv (httpx, openai, supabase). Com RADAR_TESE_ATIVA
desligada, o que sai daqui é idêntico ao que o worker produzia antes.
"""

from __future__ import annotations

from typing import Any

from verificacao import bloco_verificacao

SYSTEM_PROMPT_BASE = (
    "Você é um assistente jurídico que redige rascunhos de recurso de multa de trânsito "
    "em português do Brasil. Seja formal, claro e cite fatos do formulário. "
    "Não invente dados ausentes. Produza 2 a 4 parágrafos."
)

# Só entram com RADAR_TESE_ATIVA ligada. Base legal conferida no texto oficial
# do CTB (CTB-compilado_files/L9503Compilado.html); o número da resolução do
# CONTRAN sobre verificação metrológica NÃO foi confirmado e fica proibido.
REGRAS_RADAR = (
    " Sobre o equipamento medidor de velocidade: siga a instrução do bloco de "
    "verificação metrológica, quando houver. Como base legal dessa matéria, cite "
    "apenas o art. 280, inciso V e § 2º, do Código de Trânsito Brasileiro — nenhuma "
    "resolução do CONTRAN nem portaria do INMETRO. Não cite número de certificado "
    "que não esteja no bloco. Não afirme irregularidade do equipamento além do que "
    "o bloco informa."
)

# Campos de controle interno. O read model do Express faz `select("*")`, então a
# linha inteira chegava ao prompt — inclusive o `dup_guard` (hash de 64
# caracteres), o `form_token` e os uuids. Nada disso tem papel numa peça
# jurídica, e tudo compete por atenção com os dados que têm.
#
# `created_at` e `updated_at` saem por um motivo a mais: são `timestamptz` em
# UTC, e a IA lia "10/09" num caso protocolado às 22h do dia 9 em BRT. É o mesmo
# erro de fuso que o front já havia corrigido do lado da data da infração.
# Como nenhum dos dois entra no recurso, saem inteiros em vez de convertidos.
#
# `verificacao_medidor` sai SEMPRE: cru, seria um dict Python ilegível no
# prompt. Com a chave ligada, ele entra como bloco em português.
CAMPOS_INTERNOS = frozenset(
    {
        "id",
        "case_id",
        "form_token",
        "dup_guard",
        "document_status",
        "document_url",
        "stripe_session_id",
        "created_at",
        "updated_at",
        "verificacao_medidor",
    }
)


def system_prompt(tese_ativa: bool) -> str:
    return SYSTEM_PROMPT_BASE + (REGRAS_RADAR if tese_ativa else "")


def build_case_context(case: dict[str, Any], tese_ativa: bool = False) -> str:
    lines = [
        f"{k}: {v}"
        for k, v in sorted(case.items())
        if k not in CAMPOS_INTERNOS and v is not None and str(v).strip()
    ]
    cabecalho = "Dados do caso para o recurso:\n"
    bloco = bloco_verificacao(case.get("verificacao_medidor")) if tese_ativa else None
    if bloco:
        # Fora do corte de 200 linhas: a verificação não pode ser a que some.
        cabecalho += bloco + "\n\n"
    return cabecalho + "\n".join(lines[:200])
```

- [ ] **Step 4: Rodar e ver passar**

```bash
cd /mnt/c/Users/klaus/Coding/Atlas/amorecorrer.com/pipeline && python3 -m unittest test_prompt test_verificacao -v 2>&1 | tail -4
```
Esperado: `Ran 23 tests` e `OK`.

- [ ] **Step 5: A chave em `config.py`**

Depois de `    deepseek_model: str = "deepseek-chat"`, acrescente:
```python

    # Fase 5 do radar: com True, a verificação do medidor entra no prompt como
    # bloco + regras de redação. Fica False até a calibração (Fase 0.5) ser
    # assinada — ligar é mudar a variável, sem deploy de código.
    radar_tese_ativa: bool = False
```

- [ ] **Step 6: Ligar o worker**

Em `pipeline/worker.py`:

1. Nos imports, depois de `from hmac_utils import hmac_sha256_hex`, acrescente:
```python
from prompt import build_case_context, system_prompt
from verificacao import bloco_verificacao
```
2. Em `call_deepseek`, troque o dict da mensagem de sistema inteiro:
```python
            {
                "role": "system",
                "content": (
                    "Você é um assistente jurídico que redige rascunhos de recurso de multa de trânsito "
                    "em português do Brasil. Seja formal, claro e cite fatos do formulário. "
                    "Não invente dados ausentes. Produza 2 a 4 parágrafos."
                ),
            },
```
por:
```python
            {
                "role": "system",
                "content": system_prompt(settings.radar_tese_ativa),
            },
```
3. Apague do `worker.py` o bloco inteiro que vai do comentário `# Campos de controle interno. O read model do Express…` até o fim de `def build_case_context(...)` (o `return "Dados do caso para o recurso:\n" + "\n".join(lines[:200])`) — ele agora vive em `prompt.py`.
4. Em `run_dispatch_pipeline`, troque:
```python
            context = build_case_context(case)
```
por:
```python
            context = build_case_context(case, settings.radar_tese_ativa)
            if settings.radar_tese_ativa:
                bloco = bloco_verificacao(case.get("verificacao_medidor"))
                # Só dados do equipamento: nenhum dado pessoal do cliente.
                log.info("verificação do medidor no prompt case_id=%s bloco=%r", payload.case_id, bloco)
```

- [ ] **Step 7: Conferir que o worker compila e não sobrou referência antiga**

```bash
cd /mnt/c/Users/klaus/Coding/Atlas/amorecorrer.com/pipeline
python3 -m py_compile worker.py prompt.py verificacao.py config.py && echo compila
grep -n "CAMPOS_INTERNOS\|def build_case_context\|Produza 2 a 4" worker.py
python3 -m unittest test_prompt test_verificacao 2>&1 | tail -1
```
Esperado: `compila`; o `grep` **sem saída**; `OK`.

- [ ] **Step 8: Commit**

```bash
cd /mnt/c/Users/klaus/Coding/Atlas/amorecorrer.com
git add pipeline/prompt.py pipeline/test_prompt.py pipeline/config.py pipeline/worker.py
git commit -m "feat(radar): verificação do medidor no prompt, atrás de RADAR_TESE_ATIVA

build_case_context e o system prompt saem do worker para prompt.py, sem
dependências, testáveis fora do venv. Com a chave desligada (padrão), o
contexto e o prompt são idênticos aos de antes; o dict cru da verificação
nunca entra.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Ponta a ponta com o DeepSeek real

**Files:** nenhum arquivo do projeto. Tudo em diretório temporário.

**Interfaces:**
- Consumes: casos `f502` (comprovado) e `f503` (reprovado) da Task 3, gravados no banco local; `worker.fetch_case_aggregate`, `worker.call_deepseek`, `prompt.build_case_context`.
- Produces: dois textos do DeepSeek, lidos e julgados contra as regras.

Pré-requisitos: Supabase local no ar com os casos da Task 3; `DEEPSEEK_API_KEY` preenchida no `.env` ou `.env.local`. Confira sem imprimir o valor:
```bash
cd /mnt/c/Users/klaus/Coding/Atlas/amorecorrer.com
for f in .env .env.local; do printf "%s: " $f; grep -E '^DEEPSEEK_API_KEY=.+' $f >/dev/null && echo preenchida || echo vazia; done
```
Se `.env.local` tiver a chave **vazia**, ela vence o `.env` e apaga a chave. Nesse caso, **pare e peça ao Klaus** — não edite os `.env`.

- [ ] **Step 1: Dependências do pipeline fora do venv**

```bash
PYDEPS=$(mktemp -d); echo $PYDEPS
python3 -m pip install --quiet --target "$PYDEPS" -r pipeline/requirements.txt && echo instalado
```
Esperado: `instalado`. (Nunca dentro de `pipeline/.venv`.)

- [ ] **Step 2: Express local**

```bash
npm run dev --prefix server > "$PYDEPS/express.log" 2>&1 &
timeout 60 bash -c 'until curl -s -o /dev/null http://127.0.0.1:3001/; do sleep 2; done' && echo express-no-ar
```

- [ ] **Step 3: Montar os contextos e chamar o DeepSeek**

```bash
cat > "$PYDEPS/e2e_radar.py" <<'EOF'
import asyncio, sys
import httpx
from worker import fetch_case_aggregate, call_deepseek
from prompt import build_case_context, system_prompt

async def main():
    for sufixo in sys.argv[1:]:
        case_id = f"CASO_00000000-0000-4000-8000-00000000{sufixo}"
        async with httpx.AsyncClient() as c:
            agg = await fetch_case_aggregate(c, case_id)
        ctx = build_case_context(agg["case"], True)
        print(f"===== {sufixo} · CONTEXTO =====\n{ctx}\n")
        print(f"===== {sufixo} · TEXTO DO DEEPSEEK =====\n{await call_deepseek(ctx)}\n")

asyncio.run(main())
EOF
cd pipeline && RADAR_TESE_ATIVA=true PYTHONPATH="$PYDEPS:." python3 "$PYDEPS/e2e_radar.py" f503 f502 | tee "$PYDEPS/e2e.txt"; cd ..
```
Esperado: dois pares CONTEXTO / TEXTO. Para ter um `nao_comprovado`, repita com um caso novo: semeie `cs_test_f5_nc` / `…f505`, envie com `enviar f505 "<SERIE_VALIDO>" "<um dia anterior ao primeiro laudo>"` (confira antes no psql que `verificar_medidor` devolve `nao_comprovado` para essa data) e rode o script com `f505`.

- [ ] **Step 4: Ler e julgar**

Contra cada texto, confira **à mão** e anote o resultado:

| Caso | Critério | Passa? |
|---|---|---|
| f503 (reprovado) | Sustenta a reprovação citando data do laudo e resultado | |
| f503 | Cita nº de certificado **só** se ele estava no bloco, e igual ao do bloco | |
| f502 (comprovado) | **Não** menciona verificação metrológica nem a consulta | |
| f505 (nao_comprovado) | Faz **pedido de exibição** do certificado; não afirma irregularidade | |
| todos | Não cita resolução do CONTRAN nem portaria do INMETRO | |
| todos | Base legal da matéria do radar, se citada, é só o art. 280, V e § 2º do CTB | |

Se algum critério falhar, **pare**: o ajuste é no texto das instruções (`pipeline/verificacao.py`) ou em `REGRAS_RADAR` (`pipeline/prompt.py`), com o teste correspondente atualizado. Rode de novo esta task.

- [ ] **Step 5: Limpar**

```bash
docker exec -i supabase_db_tsdzvxgkokrjqayxukud psql -U postgres -d postgres -Xq -c "
delete from form_submissions where case_id like 'CASO_00000000-0000-4000-8000-00000000f5%';
delete from stripe_sessions where id like 'cs_test_f5_%';"
kill %1 %2 2>/dev/null; pkill -f "supabase functions serve" ; pkill -f "tsx watch" ; true
```
(`radar_consultas_log` cai junto pela FK `ON DELETE CASCADE`.) Guarde o `e2e.txt` para citar no `PROGRESSO.md`.

---

### Task 7: Documentação e verificação final

**Files:**
- Modify: `.env.example`, `.env.local.example`, `.env.production.example`
- Modify: `CLAUDE.md`, `PROGRESSO.md`, `PENDENCIAS.md`

- [ ] **Step 1: `.env*.example`**

Nos três arquivos, logo depois da linha `DEEPSEEK_MODEL=…` (no `.env.local.example`, depois de `DEEPSEEK_API_KEY=`), acrescente:
```bash
# Fase 5 do radar: true põe a verificação do medidor no prompt da IA. Fica
# false até a calibração (Fase 0.5) ser assinada.
RADAR_TESE_ATIVA=false
```

- [ ] **Step 2: `CLAUDE.md`**

1. Na seção **Modelo de dados**, troque `**O schema vive em cinco migrations**: … e a dos campos do medidor em `form_submissions` (24/09/2026).` por `**O schema vive em seis migrations**: … a dos campos do medidor em `form_submissions` e a da verificação do medidor no fluxo (ambas de 24/09/2026).` (mantenha o resto da frase).
2. Na lista **Três invariantes que quebram em silêncio**, troque "Três" por "Quatro" e acrescente o item:
```markdown
- **A verificação do medidor nunca derruba o envio, e nunca vai crua ao prompt.** A `form-submit` chama `verificar_medidor` com timeout de 3 s antes do `attempt_dispatch`; qualquer falha vira `status: "nao_aplicavel"` e o envio segue. No pipeline, `verificacao_medidor` está em `CAMPOS_INTERNOS` (`pipeline/prompt.py`) sempre — só entra como bloco em português, e só com `RADAR_TESE_ATIVA=true`. A regra de redação é escolhida em código (`pipeline/verificacao.py`), não pelo modelo.
```
3. Em **Variáveis de ambiente**, na frase "**pipeline** lê `PIPELINE_*`, …", acrescente `RADAR_TESE_ATIVA` à lista.
4. Em **Testes**, depois do bloco de código, acrescente:
```markdown
Os testes Python do pipeline rodam fora do venv, de dentro de `pipeline/`: `python3 -m unittest test_verificacao test_prompt`. **Nunca `unittest discover`** — `test_resend_smtp.py` casa com o padrão e manda um e-mail real ao ser importado.
```

- [ ] **Step 3: `PENDENCIAS.md`**

Na seção **Radar INMETRO (RJ)**:
1. Remova o item `**Fase 5 — integração no fluxo** — …` e os três subitens dele.
2. Acrescente:
```markdown
- **Fase 5 em produção** — `db push` da migration `20260924000001`, **depois** `functions deploy form-submit`. Pelo Klaus, no terminal dele. → Sessão de 24/09/2026 (Fase 5)
- **Ligar `RADAR_TESE_ATIVA`** — só depois da Fase 0.5 assinada. → Sessão de 24/09/2026 (Fase 5)
  - Confirmar o dispositivo do CONTRAN antes de acrescentá-lo a `REGRAS_RADAR` (risco 3). → plano §7
```
3. Atualize a linha `*Atualizado em …*` para `2026-09-24`.

- [ ] **Step 4: `PROGRESSO.md`**

1. Em **Estado atual**, troque o bullet da Fase 4 por um que diga: Fases 4 e 5 prontas; a Fase 5 grava a verificação e o log no envio e deixa a tese pronta atrás de `RADAR_TESE_ATIVA=false`; falta `db push` + deploy da `form-submit` (nessa ordem) e, para ligar a tese, a Fase 0.5.
2. Acrescente no fim a entrada `## Sessão de 24/09/2026 — Fase 5 do radar: a verificação entra no fluxo, e a tese espera atrás de uma chave`, no formato da convenção do topo do arquivo (**Feito / Arquivos / Verificação / Ficou de fora**), registrando: as decisões da spec (com o link para ela); a extração de `prompt.py` e o porquê; os quatro envios locais com a tabela de resultados da Task 3; os resultados da Task 6 (quais critérios passaram, citando trechos curtos do texto do DeepSeek); e o que ficou de fora (deploy, ligar a chave, Fase 6).

- [ ] **Step 5: Verificação final**

```bash
cd /mnt/c/Users/klaus/Coding/Atlas/amorecorrer.com
npm run radar:test 2>&1 | grep -E '^# (pass|fail)'
(cd pipeline && python3 -m unittest test_verificacao test_prompt 2>&1 | tail -1)
docker exec -i supabase_db_tsdzvxgkokrjqayxukud psql -U postgres -d postgres -Xqt \
  -f - < supabase/tests/verificar_medidor_test.sql | grep -cE '^ *ok'
docker exec -i supabase_db_tsdzvxgkokrjqayxukud psql -U postgres -d postgres -Xqt \
  -f - < supabase/tests/verificar_medidor_test.sql | grep -E '^ *not ok'
npx supabase db query --local -f tests/sql/assert_storage_setup.sql 2>&1 | tail -1
npm run lint 2>&1 | grep problems
npm run build 2>&1 | tail -1
git status --short
```
Esperado: `# pass 49` / `# fail 0`; `OK`; `26`; nenhuma linha `not ok`; `DO`; `✖ 14 problems (7 errors, 7 warnings)` (o baseline); `✓ built`; só os arquivos desta task modificados.

- [ ] **Step 6: Commit**

```bash
git add .env.example .env.local.example .env.production.example CLAUDE.md PROGRESSO.md PENDENCIAS.md
git commit -m "docs(radar): Fase 5 — invariantes, RADAR_TESE_ATIVA e registro da sessão

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
