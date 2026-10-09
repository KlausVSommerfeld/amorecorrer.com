# Entrega única ao pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Todo caso pago e com formulário chega ao pipeline exatamente uma vez, em qualquer ordem de chegada de formulário e webhook, com o pagamento conferido pela sessão do próprio caso.

**Architecture:** Uma função do banco (`reservar_entrega`) decide atomicamente quem entrega, passando o formulário de `pending` a `generating`; `devolver_entrega` desfaz quando o POST falha. Um módulo sem imports (`supabase/functions/_shared/entrega.ts`) faz reserva → POST assinado → devolução, e é chamado pela `form-submit` (503 na falha) e pela `stripe-webhook` (500 na falha, para o Stripe reenviar). `attempt_dispatch` sai.

**Tech Stack:** Postgres/plpgsql + pgTAP (Supabase local em Docker), Deno Edge Functions (TypeScript), `node --test` com type stripping (Node 22), React/Vite, Express/TS.

**Spec:** `docs/superpowers/specs/2026-10-09-entrega-unica-ao-pipeline-design.md`

## Global Constraints

- Trabalhar na branch `fix/entrega-unica`, criada a partir da `main` (`git checkout -b fix/entrega-unica`). Nada de commit na `main`.
- `git add` só com caminhos explícitos. Commits terminam com as duas linhas:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` e
  `Claude-Session: https://claude.ai/code/session_011vVJcDsBPjzUaFKyNjNbjp`.
- Comandos de deploy (`npx supabase db push`, `npx supabase functions deploy …`) são do Klaus, no terminal dele. Push e merge só quando ele pedir.
- O contrato do 202 não muda: a Edge só leva o caso a `generating`; quem fecha o ciclo é o Express (`/internal/dispatch/finish` → `confirm_dispatch`).
- `confirm_dispatch(dispatch_key text, success boolean)` não muda.
- `dispatches.dispatch_key` é `text` (não `uuid`).
- Nenhum caminho pode mandar um segundo e-mail ao cliente. A única escrita de `pending` sobre `generating` permitida é a de `devolver_entrega`.
- Módulos compartilhados pela Edge e pelo `node --test` não importam nada (nem `jsr:`, nem `npm:`), e importam outros `.ts` com a extensão — como `supabase/functions/form-submit/verificacao.ts`.
- Banco local: container `supabase_db_tsdzvxgkokrjqayxukud`. Migration nova se aplica com `psql` (o banco local não tem histórico de migrations; `migration up` falha).
- Nunca `python3 -m unittest discover` (manda e-mail real).
- Tempo-limite do POST ao pipeline: 10 s (`ENTREGA_TIMEOUT_MS = 10_000`).
- Mensagem do 503 no formulário: "Recebemos seus dados, mas não conseguimos começar a gerar a sua peça agora. Tente de novo em um minuto."

## Review Focus

1. **Variável de ambiente presente mas vazia** (`DISPATCH_PIPELINE_URL=""`): tem de contar como ausente (devolve e falha), não virar `fetch("")`. Teste no Task 2.
2. **A devolução também falha** (RPC `devolver_entrega` com erro depois de um POST falho): o caso fica em `generating`; `entregar` ainda devolve `falhou` e loga `devolucao_falhou`, nunca lança. Teste no Task 2.
3. **Evento do Stripe reenviado para um caso já `completed`** ou para uma sessão sem formulário: a webhook responde 200 (`nada_a_fazer`), nunca 500 — senão o Stripe reenvia por 3 dias à toa. Teste no Task 3 (`sessaoPaga` + `statusDoWebhook`).
4. **Navegador antigo (cache) mandando o `stripe_session_id` de outro caso**: ignorado. O banco cobre no pgTAP (Task 1, caso 4); a Edge, por `grep` no Task 4 — nenhuma leitura de `norm.stripe_session_id` sobra.
5. **Reenvio do formulário com dados alterados enquanto o caso está em `generating`**: grava os dados (comportamento de hoje), a reserva volta vazia e a resposta é 200. Coberto por `statusDoFormulario('nada_a_fazer') === 200` no Task 2 e conferido no Task 4.

---

### Task 1: Banco — `reservar_entrega`, `devolver_entrega`, fim do `attempt_dispatch`

**Files:**
- Create: `supabase/migrations/20261009000000_entrega_unica.sql`
- Create: `supabase/tests/entrega_test.sql`
- Create: `supabase/tests/entrega_concorrencia.sh`

**Interfaces:**
- Consumes: tabelas `stripe_sessions (id text, case_id text UNIQUE, payment_status text)`, `form_submissions (case_id, email, document_status, stripe_session_id)`, `dispatches (case_id UNIQUE, dispatch_key text UNIQUE, stripe_session_id → stripe_sessions.id, status)`.
- Produces:
  - `public.reservar_entrega(p_case_id text) RETURNS TABLE(dispatch_key text, email text, stripe_session_id text)` — zero ou uma linha.
  - `public.devolver_entrega(p_dispatch_key text) RETURNS TABLE(devolvido boolean)` — sempre uma linha.
  - `EXECUTE` só para `service_role`. `attempt_dispatch` deixa de existir.

- [ ] **Step 1: Criar a branch**

```bash
git checkout main && git checkout -b fix/entrega-unica
```

- [ ] **Step 2: Escrever o teste pgTAP**

`supabase/tests/entrega_test.sql`:

```sql
-- Entrega única ao pipeline — spec docs/superpowers/specs/2026-10-09-entrega-unica-ao-pipeline-design.md, §6.
-- Rodar contra o banco LOCAL (o `supabase test db` falha sob WSL pelo helper de credenciais do Docker):
--
--   docker exec -i supabase_db_<project> psql -U postgres -d postgres -Xqt \
--     -f - < supabase/tests/entrega_test.sql | grep -E '^ *(not )?ok|ERROR'
--
-- Falha é qualquer linha `not ok` ou `ERROR`. Tudo é desfeito pelo ROLLBACK do fim.

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(29);

-- Seed: um caso por situação.
INSERT INTO stripe_sessions (id, case_id, payment_status) VALUES
  ('cs_t1', 'CASO_aaaaaaaa-0000-4000-8000-000000000001', 'pending'),
  ('cs_t2', 'CASO_aaaaaaaa-0000-4000-8000-000000000002', 'paid'),
  ('cs_t3', 'CASO_aaaaaaaa-0000-4000-8000-000000000003', 'paid'),
  ('cs_t4', 'CASO_aaaaaaaa-0000-4000-8000-000000000004', 'pending'),
  ('cs_t5', 'CASO_aaaaaaaa-0000-4000-8000-000000000005', 'paid'),
  ('cs_t6', 'CASO_aaaaaaaa-0000-4000-8000-000000000006', 'paid');

INSERT INTO form_submissions (case_id, form_token, nome, email, document_status, stripe_session_id) VALUES
  ('CASO_aaaaaaaa-0000-4000-8000-000000000001', 't1', 'Um',     'c1@exemplo.com', 'pending',   NULL),
  ('CASO_aaaaaaaa-0000-4000-8000-000000000003', 't3', 'Tres',   'c3@exemplo.com', 'pending',   NULL),
  -- O navegador gravou a sessão PAGA de outro caso (o CASO_6b03e11a de 02/10/2026).
  ('CASO_aaaaaaaa-0000-4000-8000-000000000004', 't4', 'Quatro', 'c4@exemplo.com', 'pending',   'cs_t3'),
  ('CASO_aaaaaaaa-0000-4000-8000-000000000005', 't5', 'Cinco',  'c5@exemplo.com', 'completed', 'cs_t5'),
  ('CASO_aaaaaaaa-0000-4000-8000-000000000006', 't6', 'Seis',   'c6@exemplo.com', 'failed',    'cs_t6');

-- 1. Sessão não paga.
SELECT is_empty($$SELECT * FROM reservar_entrega('CASO_aaaaaaaa-0000-4000-8000-000000000001')$$,
  'sessao nao paga: reserva vazia');
SELECT is((SELECT document_status FROM form_submissions WHERE case_id = 'CASO_aaaaaaaa-0000-4000-8000-000000000001'),
  'pending', 'sessao nao paga: formulario continua pending');

-- 2. Pago, sem formulário.
SELECT is_empty($$SELECT * FROM reservar_entrega('CASO_aaaaaaaa-0000-4000-8000-000000000002')$$,
  'pago sem formulario: reserva vazia');

-- 3. Pago e pendente: reserva, trava e reaproveita a chave depois da devolução.
CREATE TEMP TABLE r3 AS SELECT * FROM reservar_entrega('CASO_aaaaaaaa-0000-4000-8000-000000000003');
SELECT is((SELECT count(*) FROM r3), 1::bigint, 'pago e pendente: uma linha');
SELECT is((SELECT email FROM r3), 'c3@exemplo.com', 'devolve o e-mail do formulario');
SELECT is((SELECT stripe_session_id FROM r3), 'cs_t3', 'devolve a sessao do caso');
SELECT is((SELECT document_status FROM form_submissions WHERE case_id = 'CASO_aaaaaaaa-0000-4000-8000-000000000003'),
  'generating', 'a reserva leva o formulario a generating');
SELECT is((SELECT status FROM dispatches WHERE case_id = 'CASO_aaaaaaaa-0000-4000-8000-000000000003'),
  'pending', 'dispatch criado em pending');
SELECT is((SELECT dispatch_key FROM dispatches WHERE case_id = 'CASO_aaaaaaaa-0000-4000-8000-000000000003'),
  (SELECT dispatch_key FROM r3), 'a chave devolvida e a do dispatch');
SELECT is_empty($$SELECT * FROM reservar_entrega('CASO_aaaaaaaa-0000-4000-8000-000000000003')$$,
  'segunda reserva: vazia (a trava)');
SELECT is((SELECT devolvido FROM devolver_entrega((SELECT dispatch_key FROM r3))), true,
  'devolver_entrega de um caso em generating: true');
SELECT is((SELECT document_status FROM form_submissions WHERE case_id = 'CASO_aaaaaaaa-0000-4000-8000-000000000003'),
  'pending', 'devolucao volta o formulario a pending');
SELECT is((SELECT status FROM dispatches WHERE case_id = 'CASO_aaaaaaaa-0000-4000-8000-000000000003'),
  'failed', 'devolucao marca o dispatch como failed');
SELECT is((SELECT dispatch_key FROM reservar_entrega('CASO_aaaaaaaa-0000-4000-8000-000000000003')),
  (SELECT dispatch_key FROM r3), 'nova reserva reaproveita a mesma chave');

-- 4. Sessão do navegador é de outro caso: vale a do próprio caso.
SELECT is_empty($$SELECT * FROM reservar_entrega('CASO_aaaaaaaa-0000-4000-8000-000000000004')$$,
  'sessao alheia paga nao despacha caso com o proprio pagamento pendente');
UPDATE stripe_sessions SET payment_status = 'paid' WHERE case_id = 'CASO_aaaaaaaa-0000-4000-8000-000000000004';
SELECT isnt_empty($$SELECT * FROM reservar_entrega('CASO_aaaaaaaa-0000-4000-8000-000000000004')$$,
  'pago o proprio caso, a reserva sai');
SELECT is((SELECT stripe_session_id FROM form_submissions WHERE case_id = 'CASO_aaaaaaaa-0000-4000-8000-000000000004'),
  'cs_t4', 'a reserva sobrescreve a sessao do navegador pela do caso');
SELECT is((SELECT stripe_session_id FROM dispatches WHERE case_id = 'CASO_aaaaaaaa-0000-4000-8000-000000000004'),
  'cs_t4', 'o dispatch aponta para a sessao do caso');

-- 5. Casos encerrados.
SELECT is_empty($$SELECT * FROM reservar_entrega('CASO_aaaaaaaa-0000-4000-8000-000000000005')$$,
  'caso completed: reserva vazia');
SELECT is_empty($$SELECT * FROM reservar_entrega('CASO_aaaaaaaa-0000-4000-8000-000000000006')$$,
  'caso failed: reserva vazia');

-- 6. Devolução fora de generating não muda nada.
INSERT INTO dispatches (case_id, dispatch_key, status) VALUES
  ('CASO_aaaaaaaa-0000-4000-8000-000000000005', 'chave-5', 'sent');
SELECT is((SELECT devolvido FROM devolver_entrega('chave-5')), false,
  'devolver caso completed: false');
SELECT is((SELECT document_status FROM form_submissions WHERE case_id = 'CASO_aaaaaaaa-0000-4000-8000-000000000005'),
  'completed', 'devolver caso completed: formulario intacto');
SELECT is((SELECT status FROM dispatches WHERE dispatch_key = 'chave-5'),
  'sent', 'devolver caso completed: dispatch intacto');
SELECT is((SELECT devolvido FROM devolver_entrega('chave-que-nao-existe')), false,
  'devolver chave inexistente: false');

-- 7. Permissões: só a service role executa (devolver_entrega exposta reabriria casos).
SELECT ok(NOT has_function_privilege('anon', 'public.reservar_entrega(text)', 'EXECUTE'),
  'anon nao executa reservar_entrega');
SELECT ok(NOT has_function_privilege('authenticated', 'public.reservar_entrega(text)', 'EXECUTE'),
  'authenticated nao executa reservar_entrega');
SELECT ok(NOT has_function_privilege('anon', 'public.devolver_entrega(text)', 'EXECUTE'),
  'anon nao executa devolver_entrega');
SELECT ok(NOT has_function_privilege('authenticated', 'public.devolver_entrega(text)', 'EXECUTE'),
  'authenticated nao executa devolver_entrega');

-- 8. attempt_dispatch saiu.
SELECT hasnt_function('public', 'attempt_dispatch', ARRAY['text'], 'attempt_dispatch foi removida');

SELECT * FROM finish();
ROLLBACK;
```

- [ ] **Step 3: Escrever o teste de concorrência**

`supabase/tests/entrega_concorrencia.sh`:

```bash
#!/usr/bin/env bash
# Duas reservas simultâneas do mesmo caso: só uma pode receber a chave.
# Spec 2026-10-09 (entrega única), §6. O pgTAP roda numa sessão só e não prova
# isto. Roda contra o banco LOCAL e apaga o que criou, mesmo se falhar:
#
#   bash supabase/tests/entrega_concorrencia.sh
set -euo pipefail

DB="${DB_CONTAINER:-$(docker ps --format '{{.Names}}' | grep '^supabase_db_' | head -1)}"
CASO="CASO_cccccccc-0000-4000-8000-000000000001"
SAIDA="$(mktemp -d)"

psql_() { docker exec -i "$DB" psql -U postgres -d postgres -Xqt -v ON_ERROR_STOP=1 "$@"; }

limpar() {
  psql_ -c "DELETE FROM dispatches WHERE case_id = '$CASO'" >/dev/null
  psql_ -c "DELETE FROM form_submissions WHERE case_id = '$CASO'" >/dev/null
  psql_ -c "DELETE FROM stripe_sessions WHERE case_id = '$CASO'" >/dev/null
}
trap 'limpar; rm -rf "$SAIDA"' EXIT
limpar

psql_ -c "INSERT INTO stripe_sessions (id, case_id, payment_status) VALUES ('cs_concorrencia', '$CASO', 'paid')" >/dev/null
psql_ -c "INSERT INTO form_submissions (case_id, form_token, nome, email, document_status)
          VALUES ('$CASO', 'tok', 'Teste', 'teste@exemplo.com', 'pending')" >/dev/null

# A primeira sessão reserva e segura a transação por 2 s; a segunda chega no meio.
psql_ -f - > "$SAIDA/a" 2>&1 <<SQL &
BEGIN;
SELECT dispatch_key FROM reservar_entrega('$CASO');
SELECT pg_sleep(2);
COMMIT;
SQL
sleep 0.5
psql_ -f - > "$SAIDA/b" 2>&1 <<SQL &
SELECT dispatch_key FROM reservar_entrega('$CASO');
SQL
wait

A=$(grep -cE '^ *[0-9a-f]{8}-[0-9a-f]{4}-' "$SAIDA/a" || true)
B=$(grep -cE '^ *[0-9a-f]{8}-[0-9a-f]{4}-' "$SAIDA/b" || true)
echo "sessao A: $A chave(s); sessao B: $B chave(s)"
if [ "$A" = "1" ] && [ "$B" = "0" ]; then
  echo "ok - so uma reserva recebeu a chave"
else
  echo "not ok - esperado A=1 e B=0"; cat "$SAIDA/a" "$SAIDA/b"; exit 1
fi
```

- [ ] **Step 4: Rodar os dois testes e ver falhar**

Run:
```bash
docker exec -i supabase_db_tsdzvxgkokrjqayxukud psql -U postgres -d postgres -Xqt -f - < supabase/tests/entrega_test.sql | grep -E '^ *(not )?ok|ERROR'
bash supabase/tests/entrega_concorrencia.sh
```
Expected: o pgTAP mostra `ERROR:  function reservar_entrega(unknown) does not exist`; o script termina com `not ok - esperado A=1 e B=0` e código 1.

- [ ] **Step 5: Escrever a migration**

`supabase/migrations/20261009000000_entrega_unica.sql`:

```sql
-- Entrega única ao pipeline — spec docs/superpowers/specs/2026-10-09-entrega-unica-ao-pipeline-design.md
--
-- Substitui attempt_dispatch por duas funções, chamadas só pelo módulo
-- supabase/functions/_shared/entrega.ts (form-submit e stripe-webhook):
--
--   reservar_entrega(p_case_id) — numa transação: confere o pagamento pela
--     sessão DO CASO (stripe_sessions pelo case_id, nunca o stripe_session_id
--     que o navegador mandou), passa o formulário de 'pending' a 'generating'
--     (a trava: de dois disparos simultâneos, o segundo reavalia o WHERE depois
--     do primeiro e não acha mais 'pending') e cria ou reaproveita o dispatch.
--     Só quem recebe a linha faz o POST ao pipeline.
--
--   devolver_entrega(p_dispatch_key) — o POST falhou: volta o formulário de
--     'generating' a 'pending'. É a ÚNICA escrita de 'pending' sobre
--     'generating' permitida: a regra existe porque reabrir um caso que o
--     pipeline processa manda um segundo e-mail, e aqui o pipeline não recebeu
--     o trabalho.
--
-- Antes, o formulário enviado antes da confirmação do pagamento ficava preso:
-- a stripe-webhook criava o dispatch e ninguém o entregava (CASO_fb6f9eca…,
-- 02/10/2026). E o pagamento era conferido pelo stripe_session_id do navegador
-- antes do case_id (CASO_6b03e11a… saiu com a sessão de outro caso).

CREATE OR REPLACE FUNCTION public.reservar_entrega(p_case_id text)
RETURNS TABLE(dispatch_key text, email text, stripe_session_id text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
#variable_conflict use_column
DECLARE
  _sessao_id text;
  _pagamento text;
  _email text;
  _chave text;
BEGIN
  SELECT ss.id, ss.payment_status
    INTO _sessao_id, _pagamento
    FROM stripe_sessions ss
   WHERE ss.case_id = p_case_id;

  IF NOT FOUND OR _pagamento IS DISTINCT FROM 'paid' THEN
    RETURN;
  END IF;

  UPDATE form_submissions fs
     SET document_status = 'generating',
         stripe_session_id = _sessao_id,
         updated_at = now()
   WHERE fs.case_id = p_case_id
     AND fs.document_status = 'pending'
  RETURNING fs.email INTO _email;

  IF NOT FOUND THEN
    -- Sem formulário, ou já em 'generating' (outra entrega em curso), ou encerrado.
    RETURN;
  END IF;

  INSERT INTO dispatches AS d (case_id, dispatch_key, stripe_session_id, status, created_at)
  VALUES (p_case_id, gen_random_uuid()::text, _sessao_id, 'pending', now())
  ON CONFLICT (case_id) DO UPDATE
     SET status = 'pending',
         stripe_session_id = EXCLUDED.stripe_session_id,
         updated_at = now()
  RETURNING d.dispatch_key INTO _chave;

  RETURN QUERY SELECT _chave, _email, _sessao_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.devolver_entrega(p_dispatch_key text)
RETURNS TABLE(devolvido boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _case_id text;
  _linhas integer;
BEGIN
  SELECT d.case_id INTO _case_id
    FROM dispatches d
   WHERE d.dispatch_key = p_dispatch_key;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false;
    RETURN;
  END IF;

  UPDATE form_submissions fs
     SET document_status = 'pending',
         updated_at = now()
   WHERE fs.case_id = _case_id
     AND fs.document_status = 'generating';
  GET DIAGNOSTICS _linhas = ROW_COUNT;

  IF _linhas > 0 THEN
    UPDATE dispatches d
       SET status = 'failed',
           updated_at = now()
     WHERE d.dispatch_key = p_dispatch_key;
  END IF;

  RETURN QUERY SELECT _linhas > 0;
END;
$$;

DROP FUNCTION IF EXISTS public.attempt_dispatch(text);

-- Uma função SECURITY DEFINER sem REVOKE pode ser chamada pela PostgREST com a
-- chave anônima, que vai no bundle do site. devolver_entrega exposta reabriria
-- casos em 'generating' — o segundo e-mail ao cliente.
REVOKE ALL ON FUNCTION public.reservar_entrega(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reservar_entrega(text) TO service_role;
REVOKE ALL ON FUNCTION public.devolver_entrega(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.devolver_entrega(text) TO service_role;

COMMENT ON FUNCTION public.reservar_entrega(text) IS
  'Reserva o caso para a entrega ao pipeline: sessao DO CASO paga e formulario pending -> passa a generating e devolve (dispatch_key, email, stripe_session_id). Vazio quando nao pago, sem formulario, ja em curso ou encerrado. A dispatch_key e reaproveitada nas novas tentativas (chave de idempotencia do e-mail).';
COMMENT ON FUNCTION public.devolver_entrega(text) IS
  'O POST ao pipeline falhou: volta o formulario de generating a pending e marca o dispatch failed. Unica escrita de pending sobre generating permitida. Devolve se pegou alguma linha.';
COMMENT ON COLUMN public.form_submissions.stripe_session_id IS
  'Id da sessao Stripe DO CASO (stripe_sessions pelo case_id), gravado pelo servidor: na insercao pela form-submit, pela stripe-webhook e por reservar_entrega. O valor que o navegador manda e ignorado desde 09/10/2026. NAO tem FK de proposito.';
```

- [ ] **Step 6: Aplicar no banco local**

Run:
```bash
docker exec -i supabase_db_tsdzvxgkokrjqayxukud psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f - < supabase/migrations/20261009000000_entrega_unica.sql
```
Expected: `CREATE FUNCTION`, `CREATE FUNCTION`, `DROP FUNCTION`, `REVOKE`, `GRANT`, `REVOKE`, `GRANT`, `COMMENT` ×3, sem `ERROR`.

- [ ] **Step 7: Rodar os testes e ver passar**

Run:
```bash
docker exec -i supabase_db_tsdzvxgkokrjqayxukud psql -U postgres -d postgres -Xqt -f - < supabase/tests/entrega_test.sql | grep -E '^ *(not )?ok|ERROR'
bash supabase/tests/entrega_concorrencia.sh
docker exec -i supabase_db_tsdzvxgkokrjqayxukud psql -U postgres -d postgres -Xqt -f - < supabase/tests/verificar_medidor_test.sql | grep -E '^ *(not )?ok' | grep -c '^ *ok'
```
Expected: 29 linhas `ok`, nenhuma `not ok`/`ERROR`; o script imprime `sessao A: 1 chave(s); sessao B: 0 chave(s)` e `ok - so uma reserva recebeu a chave`; o teste do radar conta `26`.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20261009000000_entrega_unica.sql supabase/tests/entrega_test.sql supabase/tests/entrega_concorrencia.sh
git commit -m "feat(banco): reservar_entrega e devolver_entrega no lugar de attempt_dispatch

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011vVJcDsBPjzUaFKyNjNbjp"
```

---

### Task 2: O módulo de entrega (`_shared/entrega.ts`)

**Files:**
- Create: `supabase/functions/_shared/entrega.ts`
- Create: `supabase/functions/_shared/entrega.test.ts`
- Modify: `package.json` (script `radar:test`)

**Interfaces:**
- Consumes: as RPCs do Task 1 (`reservar_entrega({ p_case_id })`, `devolver_entrega({ p_dispatch_key })`) e `confirm_dispatch({ dispatch_key, success })`.
- Produces:
  - `type Origem = "formulario" | "webhook"`
  - `type ResultadoEntrega = "entregue" | "nada_a_fazer" | "falhou"`
  - `type DepsEntrega = { rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>; fetch(url: string, init: RequestInit): Promise<Response>; env(nome: string): string | undefined; log?(nivel: "info" | "error", etapa: string, detalhes: Record<string, unknown>): void }`
  - `entregar(deps: DepsEntrega, caseId: string, origem: Origem): Promise<ResultadoEntrega>` — nunca lança.
  - `statusDoFormulario(r: ResultadoEntrega): number` (503 em `falhou`, senão 200)
  - `statusDoWebhook(r: ResultadoEntrega): number` (500 em `falhou`, senão 200)
  - `ENTREGA_TIMEOUT_MS = 10_000`, `hmacSha256Hex(segredo: string, mensagem: string): Promise<string>`

- [ ] **Step 1: Incluir as pastas novas no `radar:test`**

Em `package.json`, a linha do script passa a ser:

```json
    "radar:test": "node --test \"scripts/lib/*.test.ts\" \"src/lib/*.test.ts\" \"supabase/functions/form-submit/*.test.ts\" \"supabase/functions/_shared/*.test.ts\" \"supabase/functions/stripe-webhook/*.test.ts\"",
```

- [ ] **Step 2: Escrever o teste**

`supabase/functions/_shared/entrega.test.ts`:

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import {
  ENTREGA_TIMEOUT_MS,
  entregar,
  statusDoFormulario,
  statusDoWebhook,
  type DepsEntrega,
} from './entrega.ts'

const CASO = 'CASO_aaaaaaaa-0000-4000-8000-000000000001'
const CHAVE = '8d9796e3-323e-413f-b7af-426923dbc533'
const RESERVA = { dispatch_key: CHAVE, email: 'cliente@exemplo.com', stripe_session_id: 'cs_test_1' }
const ENV = {
  DISPATCH_PIPELINE_URL: 'https://pipeline.exemplo/hooks/dispatch',
  DISPATCH_PIPELINE_HMAC_SECRET: 'segredo',
}

type Rpc = { data: unknown; error: unknown }
type Opcoes = {
  reserva?: Rpc | Error
  devolucao?: Rpc
  resposta?: Response | Error
  env?: Record<string, string>
}

function falso(op: Opcoes = {}) {
  const rpc: [string, Record<string, unknown>][] = []
  const fetches: [string, RequestInit][] = []
  const logs: [string, string, Record<string, unknown>][] = []
  const deps: DepsEntrega = {
    rpc: async (fn, args) => {
      rpc.push([fn, args])
      if (fn === 'reservar_entrega') {
        if (op.reserva instanceof Error) throw op.reserva
        return op.reserva ?? { data: [RESERVA], error: null }
      }
      if (fn === 'devolver_entrega') return op.devolucao ?? { data: [{ devolvido: true }], error: null }
      if (fn === 'confirm_dispatch') return { data: [{ confirmed: true }], error: null }
      throw new Error(`rpc inesperada: ${fn}`)
    },
    fetch: async (url, init) => {
      fetches.push([url, init])
      if (op.resposta instanceof Error) throw op.resposta
      return op.resposta ?? new Response(null, { status: 202 })
    },
    env: (k) => (op.env ?? ENV)[k],
    log: (nivel, etapa, detalhes) => { logs.push([nivel, etapa, detalhes]) },
  }
  const chamou = (fn: string) => rpc.filter(([f]) => f === fn)
  return { deps, rpc, fetches, logs, chamou }
}

test('reserva vazia: nada a fazer, sem POST e sem devolução', async () => {
  const f = falso({ reserva: { data: [], error: null } })
  assert.equal(await entregar(f.deps, CASO, 'formulario'), 'nada_a_fazer')
  assert.equal(f.fetches.length, 0)
  assert.equal(f.chamou('devolver_entrega').length, 0)
})

test('reserva com o caso certo: pede reservar_entrega pelo case_id', async () => {
  const f = falso()
  await entregar(f.deps, CASO, 'webhook')
  assert.deepEqual(f.chamou('reservar_entrega'), [['reservar_entrega', { p_case_id: CASO }]])
})

test('202: entregue, sem confirmar nem devolver (quem fecha é o Express)', async () => {
  const f = falso()
  assert.equal(await entregar(f.deps, CASO, 'formulario'), 'entregue')
  assert.equal(f.chamou('confirm_dispatch').length, 0)
  assert.equal(f.chamou('devolver_entrega').length, 0)
})

test('POST: URL, corpo compacto e Idempotency-Key = dispatch_key', async () => {
  const f = falso()
  await entregar(f.deps, CASO, 'formulario')
  const [url, init] = f.fetches[0]
  assert.equal(url, ENV.DISPATCH_PIPELINE_URL)
  assert.equal(init.method, 'POST')
  assert.equal(init.body, `{"case_id":"${CASO}","email":"cliente@exemplo.com","dispatch_key":"${CHAVE}"}`)
  const headers = init.headers as Record<string, string>
  assert.equal(headers['Idempotency-Key'], CHAVE)
  assert.equal(headers['Content-Type'], 'application/json')
})

test('assinatura: X-Signature é o HMAC-SHA256 hex do corpo enviado', async () => {
  const f = falso()
  await entregar(f.deps, CASO, 'formulario')
  const [, init] = f.fetches[0]
  const esperado = createHmac('sha256', 'segredo').update(String(init.body)).digest('hex')
  assert.equal((init.headers as Record<string, string>)['X-Signature'], esperado)
})

test('sem segredo: POST sem X-Signature', async () => {
  const f = falso({ env: { DISPATCH_PIPELINE_URL: ENV.DISPATCH_PIPELINE_URL } })
  await entregar(f.deps, CASO, 'formulario')
  assert.equal('X-Signature' in (f.fetches[0][1].headers as Record<string, string>), false)
})

test('nomes antigos (N8N_*) valem quando os novos não existem', async () => {
  const f = falso({ env: { N8N_WEBHOOK_URL: 'https://antigo/hook', N8N_HMAC_SECRET: 's' } })
  assert.equal(await entregar(f.deps, CASO, 'formulario'), 'entregue')
  assert.equal(f.fetches[0][0], 'https://antigo/hook')
})

test('o POST leva tempo-limite de 10 s', async () => {
  const f = falso()
  await entregar(f.deps, CASO, 'formulario')
  assert.equal(ENTREGA_TIMEOUT_MS, 10_000)
  assert.ok(f.fetches[0][1].signal instanceof AbortSignal)
})

test('200 legado: confirm_dispatch(true) e entregue', async () => {
  const f = falso({ resposta: new Response('ok', { status: 200 }) })
  assert.equal(await entregar(f.deps, CASO, 'formulario'), 'entregue')
  assert.deepEqual(f.chamou('confirm_dispatch'), [['confirm_dispatch', { dispatch_key: CHAVE, success: true }]])
  assert.equal(f.chamou('devolver_entrega').length, 0)
})

test('500 do pipeline: devolve e falha', async () => {
  const f = falso({ resposta: new Response('erro', { status: 500 }) })
  assert.equal(await entregar(f.deps, CASO, 'webhook'), 'falhou')
  assert.deepEqual(f.chamou('devolver_entrega'), [['devolver_entrega', { p_dispatch_key: CHAVE }]])
})

test('erro de rede: devolve e falha', async () => {
  const f = falso({ resposta: new TypeError('fetch failed') })
  assert.equal(await entregar(f.deps, CASO, 'formulario'), 'falhou')
  assert.equal(f.chamou('devolver_entrega').length, 1)
})

test('tempo esgotado: devolve e falha', async () => {
  const f = falso({ resposta: new DOMException('signal timed out', 'TimeoutError') })
  assert.equal(await entregar(f.deps, CASO, 'formulario'), 'falhou')
  assert.equal(f.chamou('devolver_entrega').length, 1)
})

test('URL ausente: devolve e falha, sem POST', async () => {
  const f = falso({ env: {} })
  assert.equal(await entregar(f.deps, CASO, 'formulario'), 'falhou')
  assert.equal(f.fetches.length, 0)
  assert.equal(f.chamou('devolver_entrega').length, 1)
})

test('URL presente mas vazia conta como ausente', async () => {
  const f = falso({ env: { DISPATCH_PIPELINE_URL: '', DISPATCH_PIPELINE_HMAC_SECRET: 's' } })
  assert.equal(await entregar(f.deps, CASO, 'formulario'), 'falhou')
  assert.equal(f.fetches.length, 0)
})

test('erro da RPC de reserva: falha sem POST e sem devolução (não há chave)', async () => {
  const f = falso({ reserva: { data: null, error: { message: 'boom' } } })
  assert.equal(await entregar(f.deps, CASO, 'formulario'), 'falhou')
  assert.equal(f.fetches.length, 0)
  assert.equal(f.chamou('devolver_entrega').length, 0)
})

test('reserva que lança: falha, não propaga', async () => {
  const f = falso({ reserva: new Error('rede do banco') })
  assert.equal(await entregar(f.deps, CASO, 'formulario'), 'falhou')
})

test('devolução que também falha: ainda falhou, e loga devolucao_falhou', async () => {
  const f = falso({
    resposta: new Response('erro', { status: 503 }),
    devolucao: { data: null, error: { message: 'banco fora' } },
  })
  assert.equal(await entregar(f.deps, CASO, 'webhook'), 'falhou')
  assert.ok(f.logs.some(([nivel, etapa]) => nivel === 'error' && etapa === 'devolucao_falhou'))
})

test('todo log leva case_id e origem', async () => {
  const f = falso({ resposta: new Response('erro', { status: 500 }) })
  await entregar(f.deps, CASO, 'webhook')
  assert.ok(f.logs.length > 0)
  for (const [, , detalhes] of f.logs) {
    assert.equal(detalhes.case_id, CASO)
    assert.equal(detalhes.origem, 'webhook')
  }
})

test('status HTTP: 503 no formulário e 500 na webhook só quando falhou', () => {
  assert.equal(statusDoFormulario('falhou'), 503)
  assert.equal(statusDoFormulario('entregue'), 200)
  assert.equal(statusDoFormulario('nada_a_fazer'), 200)
  assert.equal(statusDoWebhook('falhou'), 500)
  assert.equal(statusDoWebhook('entregue'), 200)
  assert.equal(statusDoWebhook('nada_a_fazer'), 200)
})
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `node --test "supabase/functions/_shared/*.test.ts"`
Expected: FAIL com `Cannot find module …/supabase/functions/_shared/entrega.ts`.

- [ ] **Step 4: Escrever o módulo**

`supabase/functions/_shared/entrega.ts`:

```ts
/*
 * Entrega do caso ao pipeline — spec
 * docs/superpowers/specs/2026-10-09-entrega-unica-ao-pipeline-design.md.
 *
 * Usado pela `form-submit` e pela `stripe-webhook`. Quem consegue reservar o
 * caso (`reservar_entrega`, a trava atômica `pending → generating` no banco)
 * faz o POST assinado; o outro disparo recebe a reserva vazia e desiste. Se o
 * POST falha, `devolver_entrega` volta o caso a `pending` para uma nova
 * tentativa — o Stripe reenvia o evento (500 da webhook) ou o cliente clica de
 * novo (503 da form-submit).
 *
 * Sem imports, como o `form-submit/verificacao.ts`: roda no Deno da Edge e no
 * `node --test` do `npm run radar:test`. O cliente do Supabase e o `fetch`
 * entram como dependências.
 */

export type Origem = "formulario" | "webhook";
export type ResultadoEntrega = "entregue" | "nada_a_fazer" | "falhou";

// O pipeline responde 202 antes de qualquer trabalho (o `main.py` só confere a
// assinatura e agenda). Dez segundos são folga para túnel e cold start; sem
// limite nenhum, um pipeline pendurado segurava a Edge até ela morrer.
export const ENTREGA_TIMEOUT_MS = 10_000;

type RespostaRpc = { data: unknown; error: unknown };

export type DepsEntrega = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<RespostaRpc>;
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  env: (nome: string) => string | undefined;
  log?: (nivel: "info" | "error", etapa: string, detalhes: Record<string, unknown>) => void;
};

function logPadrao(nivel: "info" | "error", etapa: string, detalhes: Record<string, unknown>) {
  if (nivel === "error") console.error(`[entrega] ${etapa}`, detalhes);
  else console.info(`[entrega] ${etapa}`, detalhes);
}

function descreverErro(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null) {
    const e = err as Record<string, unknown>;
    const partes = [e.message, e.code, e.details, e.hint].filter((p) => typeof p === "string");
    if (partes.length > 0) return partes.join(" | ");
    try {
      return JSON.stringify(e);
    } catch {
      return String(err);
    }
  }
  return String(err);
}

function primeiraLinha(data: unknown): Record<string, unknown> | null {
  const linha = Array.isArray(data) ? data[0] : data;
  return typeof linha === "object" && linha !== null ? (linha as Record<string, unknown>) : null;
}

// Variável presente mas vazia conta como ausente: `fetch("")` não é uma entrega.
function primeiraDefinida(deps: DepsEntrega, ...nomes: string[]): string | null {
  for (const nome of nomes) {
    const valor = deps.env(nome)?.trim();
    if (valor) return valor;
  }
  return null;
}

export async function hmacSha256Hex(segredo: string, mensagem: string): Promise<string> {
  const enc = new TextEncoder();
  const chave = await crypto.subtle.importKey(
    "raw",
    enc.encode(segredo),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const assinatura = await crypto.subtle.sign("HMAC", chave, enc.encode(mensagem));
  return Array.from(new Uint8Array(assinatura))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function statusDoFormulario(resultado: ResultadoEntrega): number {
  return resultado === "falhou" ? 503 : 200;
}

export function statusDoWebhook(resultado: ResultadoEntrega): number {
  return resultado === "falhou" ? 500 : 200;
}

export async function entregar(
  deps: DepsEntrega,
  caseId: string,
  origem: Origem,
): Promise<ResultadoEntrega> {
  const log = deps.log ?? logPadrao;
  const base = { case_id: caseId, origem };

  let reserva: RespostaRpc;
  try {
    reserva = await deps.rpc("reservar_entrega", { p_case_id: caseId });
  } catch (err) {
    log("error", "reserva_falhou", { ...base, erro: descreverErro(err) });
    return "falhou";
  }
  if (reserva.error) {
    // Sem chave não há o que devolver: o caso continua `pending`.
    log("error", "reserva_falhou", { ...base, erro: descreverErro(reserva.error) });
    return "falhou";
  }

  const linha = primeiraLinha(reserva.data);
  const dispatchKey = typeof linha?.dispatch_key === "string" ? linha.dispatch_key : null;
  if (!linha || !dispatchKey) {
    // Não é erro: ainda não pago, ainda sem formulário, ou já em curso/encerrado.
    log("info", "nada_a_fazer", base);
    return "nada_a_fazer";
  }
  const contexto = { ...base, dispatch_key: dispatchKey };

  const devolver = async () => {
    try {
      const r = await deps.rpc("devolver_entrega", { p_dispatch_key: dispatchKey });
      if (r.error) {
        // O caso fica em `generating`, sem nova tentativa: precisa de gente.
        log("error", "devolucao_falhou", { ...contexto, erro: descreverErro(r.error) });
      } else {
        log("info", "devolvido", { ...contexto, devolvido: primeiraLinha(r.data)?.devolvido === true });
      }
    } catch (err) {
      log("error", "devolucao_falhou", { ...contexto, erro: descreverErro(err) });
    }
  };

  const url = primeiraDefinida(deps, "DISPATCH_PIPELINE_URL", "N8N_WEBHOOK_URL");
  if (!url) {
    log("error", "pipeline_url_ausente", contexto);
    await devolver();
    return "falhou";
  }
  const segredo = primeiraDefinida(deps, "DISPATCH_PIPELINE_HMAC_SECRET", "N8N_HMAC_SECRET");

  // JSON.stringify já é compacto: é exatamente o texto que o pipeline confere.
  const corpo = JSON.stringify({ case_id: caseId, email: linha.email, dispatch_key: dispatchKey });
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Idempotency-Key": dispatchKey,
  };
  if (segredo) headers["X-Signature"] = await hmacSha256Hex(segredo, corpo);

  let res: Response;
  try {
    res = await deps.fetch(url, {
      method: "POST",
      headers,
      body: corpo,
      signal: AbortSignal.timeout(ENTREGA_TIMEOUT_MS),
    });
  } catch (err) {
    log("error", "pipeline_inalcancavel", { ...contexto, erro: descreverErro(err) });
    await devolver();
    return "falhou";
  }

  if (res.status === 202) {
    log("info", "entregue", { ...contexto, status: 202 });
    return "entregue";
  }

  if (res.ok) {
    // Caminho legado: pipeline síncrono, quem confirma é a Edge.
    try {
      const conf = await deps.rpc("confirm_dispatch", { dispatch_key: dispatchKey, success: true });
      if (conf.error) log("error", "confirm_dispatch_falhou", { ...contexto, erro: descreverErro(conf.error) });
    } catch (err) {
      log("error", "confirm_dispatch_falhou", { ...contexto, erro: descreverErro(err) });
    }
    log("info", "entregue", { ...contexto, status: res.status });
    return "entregue";
  }

  const texto = await res.text().catch(() => "");
  log("error", "pipeline_recusou", { ...contexto, status: res.status, corpo: texto.slice(0, 500) });
  await devolver();
  return "falhou";
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `node --test "supabase/functions/_shared/*.test.ts"`
Expected: `# pass 19`, `# fail 0`.

- [ ] **Step 6: Suíte inteira**

Run: `npm run radar:test 2>&1 | grep -E '^# (tests|pass|fail)'`
Expected: `# tests 101`, `# pass 101`, `# fail 0` (82 de antes + 19).

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/_shared/entrega.ts supabase/functions/_shared/entrega.test.ts package.json
git commit -m "feat(edge): módulo de entrega única ao pipeline (reserva, POST assinado, devolução)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011vVJcDsBPjzUaFKyNjNbjp"
```

---

### Task 3: `stripe-webhook` entrega quando a sessão está paga

**Files:**
- Create: `supabase/functions/stripe-webhook/pagamento.ts`
- Create: `supabase/functions/stripe-webhook/pagamento.test.ts`
- Modify: `supabase/functions/stripe-webhook/index.ts` (imports; `triggerDispatch` sai; retorno de `handleSessionUpsertAndFormUpdate`; o bloco `if (paymentConfirmed && case_id)` no `Deno.serve`)

**Interfaces:**
- Consumes: `entregar`, `statusDoWebhook`, `DepsEntrega` de `../_shared/entrega.ts` (Task 2).
- Produces: `sessaoPaga(promovidoPara: string | null, statusAnterior: string | null): boolean`.

- [ ] **Step 1: Escrever o teste**

`supabase/functions/stripe-webhook/pagamento.test.ts`:

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { sessaoPaga } from './pagamento.ts'
import { statusDoWebhook } from '../_shared/entrega.ts'

test('promovida a paid agora: paga', () => {
  assert.equal(sessaoPaga('paid', 'pending'), true)
  assert.equal(sessaoPaga('paid', null), true)
})

test('evento reenviado: já estava paid e a promoção não acontece — continua paga', () => {
  assert.equal(sessaoPaga(null, 'paid'), true)
})

test('não paga: pendente, cancelada, falha ou sessão nova sem status', () => {
  assert.equal(sessaoPaga(null, null), false)
  assert.equal(sessaoPaga(null, 'pending'), false)
  assert.equal(sessaoPaga('cancelled', 'pending'), false)
  assert.equal(sessaoPaga('failed', null), false)
})

test('evento repetido de caso já entregue (reserva vazia) não vira 500', () => {
  assert.equal(statusDoWebhook('nada_a_fazer'), 200)
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test "supabase/functions/stripe-webhook/*.test.ts"`
Expected: FAIL com `Cannot find module …/stripe-webhook/pagamento.ts`.

- [ ] **Step 3: Escrever `pagamento.ts`**

`supabase/functions/stripe-webhook/pagamento.ts`:

```ts
/*
 * A sessão está paga depois deste evento? Sem imports, para o `node --test`.
 *
 * Não basta "acabou de ser promovida a paid": num evento que o Stripe reenvia
 * (porque a entrega falhou e a webhook respondeu 500) o status já é `paid`, a
 * promoção não acontece — e é justamente aí que a nova tentativa de entrega
 * tem de rodar (spec 2026-10-09, §5.1). Caso já entregue ou encerrado não
 * corre risco: a reserva volta vazia.
 */
export function sessaoPaga(promovidoPara: string | null, statusAnterior: string | null): boolean {
  return promovidoPara === "paid" || statusAnterior === "paid";
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test "supabase/functions/stripe-webhook/*.test.ts"`
Expected: `# pass 4`, `# fail 0`.

- [ ] **Step 5: Ligar a webhook ao módulo**

Em `supabase/functions/stripe-webhook/index.ts`:

(a) Depois de `import { createClient } from "jsr:@supabase/supabase-js@2";`, acrescentar:

```ts
import { entregar, statusDoWebhook, type DepsEntrega } from "../_shared/entrega.ts";
import { sessaoPaga } from "./pagamento.ts";
```

(b) Apagar a função `triggerDispatch` inteira (de `async function triggerDispatch(case_id: string): Promise<void> {` até o `}` que a fecha) e pôr no lugar:

```ts
const depsEntrega: DepsEntrega = {
  rpc: (fn, args) => supabaseAdmin.rpc(fn, args),
  fetch: (url, init) => fetch(url, init),
  env: (nome) => Deno.env.get(nome),
};
```

(c) Em `handleSessionUpsertAndFormUpdate`, a assinatura de retorno passa de `Promise<{ paymentConfirmed: boolean; case_id: string | null }>` para `Promise<{ pago: boolean; case_id: string | null }>`; o retorno do guarda de `case_id` ausente passa a `return { pago: false, case_id: null };`; e o fim da função troca

```ts
  const paymentConfirmed = nextPaymentStatus === "paid";
  return { paymentConfirmed, case_id };
```

por

```ts
  return { pago: sessaoPaga(nextPaymentStatus, existingRow?.payment_status ?? null), case_id };
```

(d) No `Deno.serve`, trocar

```ts
    let paymentConfirmed = false;
    let case_id: string | null = null;

    try {
      ({ paymentConfirmed, case_id } = await handleSessionUpsertAndFormUpdate(
```

por

```ts
    let pago = false;
    let case_id: string | null = null;

    try {
      ({ pago, case_id } = await handleSessionUpsertAndFormUpdate(
```

e trocar

```ts
    if (paymentConfirmed && case_id) {
      console.info("[webhook] Pagamento confirmado — disparando attempt_dispatch", { case_id });
      await triggerDispatch(case_id);
    }
```

por

```ts
    if (pago && case_id) {
      // Formulário enviado antes da confirmação: é aqui que ele é entregue
      // (spec 2026-10-09). Se a entrega falhar, o 500 faz o Stripe reenviar o
      // evento — com intervalos crescentes, por até 3 dias — e a reserva tenta
      // de novo. Sem formulário, ou já entregue, a reserva volta vazia.
      const resultado = await entregar(depsEntrega, case_id, "webhook");
      if (resultado === "falhou") {
        return new Response("Entrega ao pipeline falhou", { status: statusDoWebhook(resultado) });
      }
    }
```

- [ ] **Step 6: Conferir sintaxe e restos**

Run:
```bash
node_modules/.bin/esbuild supabase/functions/stripe-webhook/index.ts --format=esm --log-level=warning > /dev/null && echo sintaxe-ok
grep -n "attempt_dispatch\|triggerDispatch\|paymentConfirmed" supabase/functions/stripe-webhook/index.ts
npm run radar:test 2>&1 | grep -E '^# (tests|pass|fail)'
```
Expected: `sintaxe-ok`; o `grep` não imprime nada; `# tests 105`, `# pass 105`, `# fail 0`.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/stripe-webhook/pagamento.ts supabase/functions/stripe-webhook/pagamento.test.ts supabase/functions/stripe-webhook/index.ts
git commit -m "fix(webhook): entrega o caso quando a sessão está paga e responde 500 se a entrega falhar

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011vVJcDsBPjzUaFKyNjNbjp"
```

---

### Task 4: `form-submit` entrega pelo módulo e ignora a sessão do navegador

**Files:**
- Modify: `supabase/functions/form-submit/index.ts`

**Interfaces:**
- Consumes: `entregar`, `statusDoFormulario`, `DepsEntrega` de `../_shared/entrega.ts` (Task 2).
- Produces: respostas da `form-submit` — 200 (`entregue`/`nada_a_fazer`, também no reenvio idêntico) e **503** com `{ ok: false, error }` quando a entrega falha.

- [ ] **Step 1: Import e dependências**

Depois de `import { clienteConduzia, dataLimiteProtocolo } from "./campos.ts";`:

```ts
import { entregar, statusDoFormulario, type DepsEntrega } from "../_shared/entrega.ts";
```

E trocar a primeira linha do arquivo, `// form-submit (dispatch pipeline + deferred confirm_dispatch for async runners)`, por:

```ts
// form-submit: grava o formulário e entrega o caso ao pipeline pelo módulo
// compartilhado (supabase/functions/_shared/entrega.ts, spec 2026-10-09).
```

- [ ] **Step 2: A sessão do caso, não a do navegador**

No bloco `if (!existingCase) { … }`, trocar `.select("case_id")` por `.select("id,case_id")`. Antes desse bloco (logo depois do `if (caseErr) { … }`), declarar:

```ts
    // A sessão de pagamento é a do próprio caso, lida pelo servidor. O
    // `stripe_session_id` que o navegador manda é ignorado desde 09/10/2026: o
    // CASO_6b03e11a… chegou com a sessão de outro caso (spec 2026-10-09).
    let sessaoDoCaso: string | null = null;
```

e, dentro do bloco, depois do `if (!sessionRow) { return bad("case_id inválido", 404, corsHeadersForOrigin); }`:

```ts
      sessaoDoCaso = typeof sessionRow.id === "string" ? sessionRow.id : null;
```

Em `updateFields`, apagar a linha `stripe_session_id: norm.stripe_session_id ?? null,`. No INSERT, trocar `.insert({ ...updateFields, document_status: "pending" })` por:

```ts
        .insert({ ...updateFields, document_status: "pending", stripe_session_id: sessaoDoCaso })
```

- [ ] **Step 3: Função local de entrega**

Logo depois de `const norm = normalizePayload(raw);`:

```ts
  const depsEntrega: DepsEntrega = {
    rpc: (fn, args) => supabase.rpc(fn, args),
    fetch: (url, init) => fetch(url, init),
    env: (nome) => Deno.env.get(nome),
  };
  const MENSAGEM_ENTREGA_FALHOU =
    "Recebemos seus dados, mas não conseguimos começar a gerar a sua peça agora. Tente de novo em um minuto.";
```

- [ ] **Step 4: Reenvio idêntico também entrega; duplicata por sessão sai**

Trocar o bloco

```ts
    // Check for duplicate by dup_guard
    if (existingCase && existingCase.dup_guard === dup_guard) {
      return json(
        {
          ok: true,
          message: "Duplicate submission (no-op)",
          dup_guard
        },
        200,
        corsHeadersForOrigin
      );
    }

    // Check for duplicate by stripe_session_id
    if (
      norm.stripe_session_id &&
      existingCase &&
      existingCase.stripe_session_id === norm.stripe_session_id
    ) {
      return json(
        {
          ok: true,
          message: "Duplicate submission by stripe_session_id (no-op)"
        },
        200,
        corsHeadersForOrigin
      );
    }
```

por

```ts
    // Reenvio idêntico: os dados não mudam, mas a entrega é tentada de novo —
    // é assim que o cliente que recebeu o 503 dispara a nova tentativa. Num
    // caso em `generating` ou encerrado a reserva volta vazia e nada acontece.
    // (A duplicata por `stripe_session_id` saiu: dependia do valor do navegador.)
    if (existingCase && existingCase.dup_guard === dup_guard) {
      const resultado = await entregar(depsEntrega, String(norm.case_id), "formulario");
      if (resultado === "falhou") {
        return bad(MENSAGEM_ENTREGA_FALHOU, statusDoFormulario(resultado), corsHeadersForOrigin);
      }
      return json(
        {
          ok: true,
          message: "Duplicate submission (no-op)",
          dup_guard
        },
        200,
        corsHeadersForOrigin
      );
    }
```

- [ ] **Step 5: Trocar o bloco de dispatch pela entrega**

Apagar desde a linha `    // After successful update, attempt dispatch via RPC` até o fim do `catch (rpcErr) { logDispatchError("attempt_dispatch_rpc_error", … ) }` que o fecha — o `return json({ ok: true, form: updated }, 200, corsHeadersForOrigin);` que vem logo depois também sai — e pôr no lugar:

```ts
    // Entrega ao pipeline (spec 2026-10-09): a reserva atômica no banco decide
    // quem entrega. Sem pagamento confirmado ainda, ela volta vazia e quem
    // entrega é a `stripe-webhook`, quando o pagamento chegar.
    const resultado = await entregar(depsEntrega, String(norm.case_id), "formulario");
    if (resultado === "falhou") {
      return bad(MENSAGEM_ENTREGA_FALHOU, statusDoFormulario(resultado), corsHeadersForOrigin);
    }

    return json(
      {
        ok: true,
        form: updated
      },
      200,
      corsHeadersForOrigin
    );
```

- [ ] **Step 6: Tirar o que ficou sem uso e os comentários velhos**

- Apagar as funções `hmacSha256Hex`, `logDispatchError`, `logDispatchInfo`, `confirmDispatchOk` e `extractDispatchKey` **se** o `grep` abaixo mostrar que não têm mais chamada (o `formatDispatchError` continua: o bloco do radar o usa).
- No comentário do INSERT/UPDATE separados, trocar `faria attempt_dispatch devolver a MESMA\n    // dispatch_key e o worker mandar um SEGUNDO e-mail ao cliente.` por `reabriria a reserva\n    // (reservar_entrega) e o worker mandaria um SEGUNDO e-mail ao cliente.`
- No comentário da verificação do medidor, trocar `ANTES do attempt_dispatch` por `ANTES da entrega`.
- No `normalizePayload`, acima do `return norm;`, acrescentar: `  // \`stripe_session_id\`, se vier, é ignorado: a sessão é a do caso (spec 2026-10-09).`

Run:
```bash
grep -n "hmacSha256Hex\|logDispatchError\|logDispatchInfo\|confirmDispatchOk\|extractDispatchKey" supabase/functions/form-submit/index.ts
```
Expected depois da limpeza: nenhuma linha.

- [ ] **Step 7: Conferir sintaxe, restos e suíte**

Run:
```bash
node_modules/.bin/esbuild supabase/functions/form-submit/index.ts --format=esm --log-level=warning > /dev/null && echo sintaxe-ok
grep -n "attempt_dispatch\|norm.stripe_session_id\|confirm_dispatch" supabase/functions/form-submit/index.ts
npm run radar:test 2>&1 | grep -E '^# (tests|pass|fail)'
```
Expected: `sintaxe-ok`; o `grep` não imprime nada (o `confirm_dispatch` agora vive só no módulo); `# tests 105`, `# pass 105`, `# fail 0`.

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/form-submit/index.ts
git commit -m "fix(form-submit): entrega pelo módulo único, 503 na falha e sessão do caso no lugar da do navegador

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011vVJcDsBPjzUaFKyNjNbjp"
```

---

### Task 5: Formulário, tipos e Express

**Files:**
- Create: `src/lib/falhaDoEnvio.ts`
- Create: `src/lib/falhaDoEnvio.test.ts`
- Modify: `src/pages/Form.tsx`
- Modify: `src/integrations/supabase/types.ts:538-543`
- Modify: `server/src/index.ts:178-186`

**Interfaces:**
- Consumes: o 503 da `form-submit` (Task 4); as funções do Task 1 (para os tipos).
- Produces: `mensagemDeFalha(status: number): string` em `src/lib/falhaDoEnvio.ts`.

- [ ] **Step 1: Escrever o teste da mensagem**

`src/lib/falhaDoEnvio.test.ts`:

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { mensagemDeFalha } from './falhaDoEnvio.ts'

test('503: os dados chegaram, a geração não começou — tentar de novo', () => {
  assert.equal(
    mensagemDeFalha(503),
    'Recebemos seus dados, mas não conseguimos começar a gerar a sua peça agora. Tente de novo em um minuto.'
  )
})

test('as mensagens de antes continuam', () => {
  assert.match(mensagemDeFalha(409), /já foi finalizado/)
  assert.match(mensagemDeFalha(404), /Não localizamos este pedido/)
  assert.match(mensagemDeFalha(413), /grande demais/)
  assert.match(mensagemDeFalha(429), /Muitas tentativas/)
  assert.match(mensagemDeFalha(400), /recusado/)
  assert.match(mensagemDeFalha(500), /Nossos servidores não responderam/)
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test src/lib/falhaDoEnvio.test.ts`
Expected: FAIL com `Cannot find module …/src/lib/falhaDoEnvio.ts`.

- [ ] **Step 3: Mover a função para `src/lib/falhaDoEnvio.ts` e acrescentar o 503**

Recortar de `src/pages/Form.tsx` o bloco do comentário `/** O que o usuário lê quando o envio falha…` e da função `mensagemDeFalha` inteira, e criar `src/lib/falhaDoEnvio.ts` com ele, exportado, com o 503 antes do retorno final:

```ts
/**
 * O que o usuário lê quando o envio falha. O erro cru — `Request failed: 500 …`
 * seguido do corpo da resposta — dizia o problema do servidor, nunca o do
 * usuário, e vazava detalhes de infraestrutura na tela.
 */
export function mensagemDeFalha(status: number): string {
  if (status === 409) {
    return 'Este caso já foi finalizado. Se você não recebeu o PDF, fale com a gente com o número do caso em mãos.';
  }
  if (status === 404) {
    return 'Não localizamos este pedido. Confira se você abriu o link que veio depois do pagamento.';
  }
  if (status === 413) {
    return 'O texto ficou grande demais. Encurte o campo "O que aconteceu?" e envie de novo.';
  }
  if (status === 429) {
    return 'Muitas tentativas em pouco tempo. Espere um minuto e tente de novo.';
  }
  if (status === 400 || status === 401 || status === 403) {
    return 'O envio foi recusado. Recarregue a página pelo link do pagamento e tente de novo.';
  }
  // A form-submit gravou os dados, mas a entrega ao pipeline falhou e o caso
  // voltou a `pending`: um novo clique tenta de novo (spec 2026-10-09).
  if (status === 503) {
    return 'Recebemos seus dados, mas não conseguimos começar a gerar a sua peça agora. Tente de novo em um minuto.';
  }
  return 'Nossos servidores não responderam agora. Seus dados continuam aqui — tente de novo.';
}
```

Em `src/pages/Form.tsx`, junto dos outros imports de `../lib/…`: `import { mensagemDeFalha } from '../lib/falhaDoEnvio';`.

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test src/lib/falhaDoEnvio.test.ts`
Expected: `# pass 2`, `# fail 0`.

- [ ] **Step 5: Tirar o `stripe_session_id` do formulário**

Em `src/pages/Form.tsx`:
- no tipo `FormData`, apagar `stripe_session_id: string;`;
- em `INITIAL_FORM`, apagar `stripe_session_id: ''` (e a vírgula que sobrar em `case_id: ''`);
- `CAMPOS_DE_SISTEMA` passa a `['form_token', 'case_id'] as const`;
- apagar o bloco `let stripeSessionId: string | null = null; try { stripeSessionId = localStorage.getItem('stripe_session_id'); } catch { stripeSessionId = null; }`;
- no `setFormData` da restauração, apagar `stripe_session_id: stripeSessionId ?? prev.stripe_session_id` (e a vírgula que sobrar);
- em `normalizeData`, apagar `stripe_session_id: data.stripe_session_id || null,`;
- no envio, apagar o bloco `if (!formData.stripe_session_id) { setMessage({ … 'Não localizamos o seu pagamento neste navegador…' }); return; }`;
- nos dois `setFormData(prev => ({ ...INITIAL_FORM, form_token: prev.form_token, case_id: prev.case_id, stripe_session_id: prev.stripe_session_id }))`, apagar a linha do `stripe_session_id` (e a vírgula que sobrar);
- `pedidoIncompleto` passa a `pronto && !formData.case_id;`, com o comentário acima mantido;
- o aviso do `pedidoIncompleto` troca o título e o texto por:

```tsx
            <p className="font-semibold">Não encontramos o número do seu pedido.</p>
            <p className="mt-1 text-sm leading-snug text-foreground">
              Abra o formulário pelo link que apareceu depois do pagamento. Se
              você já pagou e o link se perdeu, fale com a gente — a cobrança
              está registrada.
            </p>
```

Run: `grep -n "stripe_session_id\|stripeSessionId" src/pages/Form.tsx`
Expected: nenhuma linha.

- [ ] **Step 6: Tipos do Supabase**

Em `src/integrations/supabase/types.ts`, apagar o bloco

```ts
      attempt_dispatch: {
        Args: { p_case_id: string }
        Returns: {
          dispatch_key: string
        }[]
      }
```

e, mantendo a ordem alfabética das chaves (`confirm_dispatch`, `devolver_entrega`, `radar_…`, `reservar_entrega`, `verificar_medidor`), acrescentar depois de `confirm_dispatch: { … }`:

```ts
      devolver_entrega: {
        Args: { p_dispatch_key: string }
        Returns: {
          devolvido: boolean
        }[]
      }
```

e antes de `verificar_medidor: {`:

```ts
      reservar_entrega: {
        Args: { p_case_id: string }
        Returns: {
          dispatch_key: string
          email: string
          stripe_session_id: string
        }[]
      }
```

- [ ] **Step 7: Express lê a sessão pelo `case_id`**

Em `server/src/index.ts`, trocar

```ts
    let stripe_session: Record<string, unknown> | null = null;
    if (form.stripe_session_id) {
      const { data: ss, error: ssErr } = await supabase
        .from("stripe_sessions")
        .select("id, case_id, payment_status, status")
        .eq("id", form.stripe_session_id)
        .maybeSingle();
      if (!ssErr) stripe_session = ss as Record<string, unknown>;
    }
```

por

```ts
    // Pela sessão do caso, nunca pelo stripe_session_id gravado no formulário,
    // que até 09/10/2026 vinha do navegador (spec 2026-10-09, §5.5).
    let stripe_session: Record<string, unknown> | null = null;
    const { data: ss, error: ssErr } = await supabase
      .from("stripe_sessions")
      .select("id, case_id, payment_status, status")
      .eq("case_id", caseId)
      .maybeSingle();
    if (!ssErr) stripe_session = ss as Record<string, unknown>;
```

- [ ] **Step 8: Verificar**

Run:
```bash
npm run radar:test 2>&1 | grep -E '^# (tests|pass|fail)'
npm run build 2>&1 | tail -2
npm run build --prefix server 2>&1 | tail -2
npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -E "Form.tsx|types.ts|falhaDoEnvio" | head
```
Expected: `# tests 107`, `# pass 107`, `# fail 0`; build do site termina em `✓ built in …`; build do Express sem erro; o `tsc` não aponta erro nesses três arquivos.

- [ ] **Step 9: Commit**

```bash
git add src/lib/falhaDoEnvio.ts src/lib/falhaDoEnvio.test.ts src/pages/Form.tsx src/integrations/supabase/types.ts server/src/index.ts
git commit -m "fix(form): sem exigir a sessão do navegador, mensagem do 503, tipos e Express pela sessão do caso

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011vVJcDsBPjzUaFKyNjNbjp"
```

---

### Task 6: Documentação

**Files:**
- Modify: `CLAUDE.md`
- Modify: `PROGRESSO.md`
- Modify: `PENDENCIAS.md`

**Interfaces:**
- Consumes: nomes e comportamentos dos Tasks 1–5.
- Produces: nada de código.

- [ ] **Step 1: `CLAUDE.md`**

- **Fluxo, passo 2** passa a: "2. `stripe-webhook`: valida assinatura, promove `payment_status` (`shouldPromoteStatus` impede rebaixar `paid`), liga `form_submissions.stripe_session_id` e, se a sessão está paga (promovida agora ou já estava), chama `entregar` (`supabase/functions/_shared/entrega.ts`). Se a entrega falhar, responde 500 e o Stripe reenvia o evento."
- **Fluxo, passo 4** passa a: "4. `form-submit`: CORS por whitelist, 64 KB máx., rate limit 30/min por IP, `dup_guard` SHA-256, insert ou update em `form_submissions` (o `stripe_session_id` gravado é o da sessão do caso; o do navegador é ignorado) e `entregar`: `reservar_entrega` trava o caso (`pending → generating`) e só quem reservou faz o POST assinado para `DISPATCH_PIPELINE_URL`. POST falho → `devolver_entrega` e resposta 503; o clique seguinte (mesmo idêntico) tenta de novo."
- **Contrato do 202** passa a: "**Contrato do 202:** a Edge (pela reserva) só leva o caso a `document_status = generating`. Quem fecha o ciclo é o Express. Se o pipeline responder outro 2xx, a Edge chama `confirm_dispatch` ela mesma (caminho legado); não-2xx, erro de rede ou tempo esgotado (10 s) devolvem o caso a `pending` (`devolver_entrega`). Mexer nesse status code quebra a divisão de responsabilidades."
- **Invariantes do modelo de dados**: trocar a frase "`attempt_dispatch` só cria dispatch se `payment_status = 'paid'` **e** `document_status = 'pending'` — caso contrário retorna conjunto vazio (não é erro)." por "`reservar_entrega` só devolve a chave se a sessão **do caso** (`stripe_sessions` pelo `case_id`) está `paid` **e** o formulário está `pending` — e na mesma transação passa o formulário a `generating`: de dois disparos simultâneos, um só recebe a chave. Caso contrário retorna conjunto vazio (não é erro). A `dispatch_key` é reaproveitada nas novas tentativas — é a chave de idempotência do e-mail. As duas funções da entrega têm `EXECUTE` só para `service_role`: `devolver_entrega` exposta à chave anônima reabriria casos em `generating`."
- **Invariante do `document_status`**: trocar "reescrever `'pending'` sobre um caso em `generating` faz `attempt_dispatch` devolver a mesma `dispatch_key` e o worker mandar um **segundo e-mail ao cliente**." por "reescrever `'pending'` sobre um caso em `generating` reabre a reserva e o worker manda um **segundo e-mail ao cliente**. A única exceção é `devolver_entrega`, chamada só quando o POST ao pipeline falhou — o pipeline não recebeu o trabalho."
- **Migrations**: "O schema vive em nove migrations" → "dez migrations", e acrescentar à enumeração ", e a da entrega única (09/10/2026)".
- **Armadilhas, primeiro item**, passa a: "**`attempt_dispatch` não existe mais** (removida em 09/10/2026, migration `20261009000000_entrega_unica`). A entrega é `reservar_entrega(p_case_id)` e `devolver_entrega(p_dispatch_key)`, chamadas só por `supabase/functions/_shared/entrega.ts`. `confirm_dispatch` tem UMA assinatura, `(dispatch_key, success)`, e devolve se o UPDATE pegou alguma linha — não o eco do argumento `success`, como fazia antes de 11/09/2026."
- **Testes**: depois do bloco do pgTAP do radar, acrescentar:

```bash
# 29 testes da entrega única (pgTAP, transação revertida) e a prova de concorrência
# (dois psql reservando o mesmo caso; cria e apaga um caso de teste no banco local):
docker exec -i supabase_db_<ref> psql -U postgres -d postgres -Xqt \
  -f - < supabase/tests/entrega_test.sql | grep -E '^ *(not )?ok|ERROR'
bash supabase/tests/entrega_concorrencia.sh
```

  e na frase "O `npm run radar:test` cobre também `supabase/functions/form-submit/*.test.ts`" acrescentar "`supabase/functions/_shared/*.test.ts` e `supabase/functions/stripe-webhook/*.test.ts`".

- [ ] **Step 2: `PENDENCIAS.md`**

Apagar os dois itens de "Robustez do fluxo" que começam com "**Formulário enviado antes da confirmação do pagamento fica preso para sempre**" e "**O servidor confia no `stripe_session_id` mandado pelo navegador**". Acrescentar em "Robustez do fluxo":

"- **Publicar e testar a entrega única** — `npx supabase db push` ANTES de `npx supabase functions deploy form-submit` e `… stripe-webhook`; reiniciar Express e Vite; os três testes ponta a ponta da spec (§6): caso preso de 02/10 com o webhook desativado e reenviado, falha com o uvicorn parado e nova tentativa, e formulário numa aba anônima. → Sessão de 09/10/2026 (entrega única)"

- [ ] **Step 3: `PROGRESSO.md`**

Acrescentar ao fim:

```markdown
## Sessão de 09/10/2026 — Entrega única ao pipeline

Spec `docs/superpowers/specs/2026-10-09-entrega-unica-ao-pipeline-design.md`, plano `docs/superpowers/plans/2026-10-09-entrega-unica-ao-pipeline.md`. Resolve as duas lacunas do teste na nuvem de 02/10/2026.

- **Banco:** `reservar_entrega(p_case_id)` confere o pagamento pela sessão do caso, passa o formulário de `pending` a `generating` (a trava) e cria ou reaproveita o dispatch; `devolver_entrega(p_dispatch_key)` desfaz quando o POST falha. `attempt_dispatch` saiu. As duas funções só executam com a service role. 29 testes pgTAP e uma prova de concorrência com dois `psql`.
- **Edge:** `supabase/functions/_shared/entrega.ts` (reserva → POST assinado com tempo-limite de 10 s → devolução), usado pela `form-submit` (503 na falha; o reenvio idêntico tenta de novo) e pela `stripe-webhook` (entrega quando a sessão está paga, mesmo num evento reenviado; 500 na falha, e o Stripe reenvia). O `stripe_session_id` do navegador é ignorado.
- **Formulário:** não exige mais a sessão no `localStorage` (quem abre o link em outro aparelho consegue enviar) e tem mensagem própria para o 503. O Express lê a sessão pelo `case_id`.

**Arquivos:** `supabase/migrations/20261009000000_entrega_unica.sql`, `supabase/tests/{entrega_test.sql,entrega_concorrencia.sh}`, `supabase/functions/_shared/{entrega,entrega.test}.ts`, `supabase/functions/stripe-webhook/{index,pagamento,pagamento.test}.ts`, `supabase/functions/form-submit/index.ts`, `src/lib/{falhaDoEnvio,falhaDoEnvio.test}.ts`, `src/pages/Form.tsx`, `src/integrations/supabase/types.ts`, `server/src/index.ts`, `package.json`, `CLAUDE.md`, `PENDENCIAS.md`.

**Falta:** publicar e os três testes ponta a ponta (no `PENDENCIAS.md`).
```

- [ ] **Step 4: Conferir que não sobrou referência ativa**

Run: `grep -rn "attempt_dispatch" CLAUDE.md README.md src server/src supabase/functions pipeline --include=*.md --include=*.ts --include=*.tsx --include=*.py | grep -v "não existe mais\|removida"`
Expected: nenhuma linha. (Se o `README.md` citar `attempt_dispatch` no fluxo, trocar pela descrição do passo 4 acima.)

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md PROGRESSO.md PENDENCIAS.md
git commit -m "docs: entrega única ao pipeline no CLAUDE.md, PROGRESSO e PENDENCIAS

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011vVJcDsBPjzUaFKyNjNbjp"
```

(Se o `README.md` mudou no Step 4, incluí-lo no `git add`.)

---

### Task 7: Publicação e testes ponta a ponta (com o Klaus)

**Files:** nenhum de código. Ao fim, `PROGRESSO.md` e `PENDENCIAS.md`.

**Interfaces:**
- Consumes: tudo acima, publicado.
- Produces: o registro dos três testes.

- [ ] **Step 1: Pedir ao Klaus a publicação, nesta ordem**

```bash
npx supabase db push
npx supabase functions deploy form-submit
npx supabase functions deploy stripe-webhook
```

e reiniciar o Express (`npm run build --prefix server` e `npm start` de dentro de `server/`), o Vite e o uvicorn (com túnel publicado em `DISPATCH_PIPELINE_URL`).

- [ ] **Step 2: Conferir a publicação pelo conector**

Pelo MCP do Supabase (projeto `tsdzvxgkokrjqayxukud`), `execute_sql`:

```sql
select proname, has_function_privilege('anon', oid, 'EXECUTE') as anon_executa
  from pg_proc where proname in ('reservar_entrega','devolver_entrega','attempt_dispatch');
```
Expected: duas linhas (`reservar_entrega`, `devolver_entrega`), ambas com `anon_executa = false`; nenhuma `attempt_dispatch`.

- [ ] **Step 3: Teste 1 — o caso preso de 02/10** (o Klaus executa; eu confiro banco, logs e e-mail)

Desativar o endpoint do webhook no painel da sandbox; pagar com cartão de teste e enviar o formulário. Conferir: formulário `pending`, sem dispatch, log da `form-submit` `[entrega] nada_a_fazer … origem: formulario`. Reativar o endpoint e reenviar o evento `checkout.session.completed` pelo painel. Esperado: caso `completed`, dispatch `sent`, PDF no bucket, e-mail `delivered` na Resend, log `[entrega] entregue … origem: webhook`.

- [ ] **Step 4: Teste 2 — falha e nova tentativa**

Com o uvicorn parado, pagar e enviar o formulário. Esperado: a tela mostra "Recebemos seus dados, mas não conseguimos começar a gerar a sua peça agora. Tente de novo em um minuto."; formulário `pending`; dispatch `failed`; log `pipeline_recusou` ou `pipeline_inalcancavel` e `devolvido`. Subir o uvicorn e clicar de novo. Esperado: um PDF, um e-mail, dispatch `sent`, a mesma `dispatch_key` da primeira tentativa.

- [ ] **Step 5: Teste 3 — outro aparelho**

Pagar e abrir o `/form?success=true&case_id=…` numa aba anônima (sem nada no `localStorage`). Esperado: nenhum aviso de "pedido não encontrado"; o envio funciona e o caso fecha.

- [ ] **Step 6: Registrar e limpar**

Acrescentar o resultado dos três testes à seção da sessão no `PROGRESSO.md`, tirar o item "Publicar e testar a entrega única" do `PENDENCIAS.md`, e acrescentar os `case_id` de teste à limpeza (apagar só com autorização do Klaus).

```bash
git add PROGRESSO.md PENDENCIAS.md
git commit -m "docs: entrega única publicada e testada ponta a ponta

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011vVJcDsBPjzUaFKyNjNbjp"
```
