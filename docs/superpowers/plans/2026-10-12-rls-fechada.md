# RLS fechada para a chave anônima — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A chave anônima (que vai no bundle do site) deixa de ler e escrever qualquer tabela do schema `public` e de executar `confirm_dispatch`, sem mudar nada para a Edge, o Express e o pipeline, que usam a `service_role`.

**Architecture:** Uma migration nova com duas travas — políticas só para `service_role` e `REVOKE` dos privilégios de `anon`/`authenticated` — mais a mudança do privilégio padrão do schema para objetos novos. Um teste pgTAP prova as travas, o fluxo da `service_role` e varre o catálogo inteiro (pega objetos futuros). Nenhum código fora do banco muda.

**Tech Stack:** PostgreSQL 15 (Supabase), pgTAP 1.2 rodado por `psql` dentro do container, Supabase CLI (publicação pelo Klaus), MCP da Supabase (conferências em produção, só leitura).

**Spec:** `docs/superpowers/specs/2026-10-12-rls-fechada-design.md`

## Global Constraints

- Migration: `supabase/migrations/20261012000000_rls_fechada.sql` — migration NOVA; a baseline e as anteriores não são editadas.
- Nenhum código fora do banco muda (Edge, Express, pipeline, site).
- Publicação é do Klaus, no terminal dele: só `npx supabase db push`. Nenhuma função publicada, nenhum serviço reiniciado.
- Teste pgTAP pelo `psql` (o `supabase test db` falha sob WSL): `docker exec -i supabase_db_tsdzvxgkokrjqayxukud psql -U postgres -d postgres -Xqt -f - < <arquivo> | grep -E '^ *(not )?ok|ERROR'`. Falha é qualquer linha `not ok` ou `ERROR`.
- Migration aplicada no banco local por `psql` (o banco local não tem histórico de migrations): `docker exec -i supabase_db_tsdzvxgkokrjqayxukud psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f - < supabase/migrations/20261012000000_rls_fechada.sql`.
- Nunca `python3 -m unittest discover` (manda e-mail real).
- `git add` só com caminhos explícitos. Commits terminam com:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` e `Claude-Session: https://claude.ai/code/session_011vVJcDsBPjzUaFKyNjNbjp`.
- Push e merge só quando o Klaus pedir; o push é dele (do WSL volta 403).
- Chaves (anon, service role) nunca impressas em saída: mascarar.
- As três funções de texto (`update_updated_at_column`, `radar_unaccent_imutavel`, `radar_classificar_resultado`) NÃO são revogadas (spec §3.3).

## Review Focus

1. **`authenticated` esquecido em algum ponto** — um usuário logado (a infra de bearer existe, desligada) não pode ter o que a `anon` perdeu: o grupo (a) do teste repete cada caso para `authenticated`.
2. **Gatilho de `updated_at` depois do REVOKE** — a `service_role` faz `UPDATE` em `form_submissions`/`dispatches`/`generated_documents`, que disparam `update_updated_at_column`; tem de continuar funcionando: o grupo (b) inclui um `UPDATE` real como `service_role` numa linha semeada.
3. **Coluna gerada do radar** — a `service_role` grava `radar_instruments` (coluna gerada por `radar_unaccent_imutavel`): o grupo (b) inclui um `INSERT` como `service_role` em `radar_instruments`.
4. **Ordem do teste** — o grupo (e) cria uma tabela sem RLS no `public`; se rodar antes das varreduras (d), a d.3 acusa o próprio teste. O arquivo roda (d) antes de (e).
5. **Resposta da API que parece fechada mas não está** — `[]` com HTTP 200 seria a RLS barrando com o privilégio ainda lá; a conferência em produção exige o erro `42501` (HTTP 401/403), não lista vazia.

---

## Pré-requisito (Klaus)

O Docker Desktop precisa estar aberto, com a integração WSL ligada, e a stack local de pé (`npx supabase start`, da raiz). Confirmar com:

```bash
docker ps --format '{{.Names}}' | grep supabase_db_
```
Expected: `supabase_db_tsdzvxgkokrjqayxukud`

---

### Task 1: Teste pgTAP e migration

**Files:**
- Create: `supabase/tests/rls_test.sql`
- Create: `supabase/migrations/20261012000000_rls_fechada.sql`

**Interfaces:**
- Consumes: tabelas e políticas existentes (nomes exatos abaixo); `public.confirm_dispatch(text, boolean)`.
- Produces: políticas `"Service role gerencia stripe_sessions"`, `"Service role gerencia form_submissions"`, `"Service role gerencia dispatches"`, `"Service role gerencia generated_documents"` (todas `FOR ALL TO service_role`); `supabase/tests/rls_test.sql` com `plan(53)`, usado pela Task 2 (comando no `CLAUDE.md`) e pela Task 3 (as mesmas varreduras em produção).

- [ ] **Step 1: Escrever o teste**

Criar `supabase/tests/rls_test.sql`:

```sql
-- RLS fechada para a chave anônima — spec docs/superpowers/specs/2026-10-12-rls-fechada-design.md, §4.1.
-- Rodar contra o banco LOCAL (o `supabase test db` falha sob WSL pelo helper de credenciais do Docker):
--
--   docker exec -i supabase_db_<project> psql -U postgres -d postgres -Xqt \
--     -f - < supabase/tests/rls_test.sql | grep -E '^ *(not )?ok|ERROR'
--
-- Falha é qualquer linha `not ok` ou `ERROR`. Tudo é desfeito pelo ROLLBACK do fim.
--
-- As tentativas de outro papel não rodam com o pgTAP dentro do SET ROLE: as
-- tabelas temporárias em que o pgTAP guarda os resultados são do postgres, e o
-- anon não as alcança. pg_temp.tentar_como faz a tentativa e devolve só o
-- código do erro ('ok' se passou); o pgTAP compara como postgres.

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(53);

CREATE FUNCTION pg_temp.tentar_como(papel text, comando text) RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format('SET LOCAL ROLE %I', papel);
  EXECUTE comando;
  RESET ROLE;
  RETURN 'ok';
EXCEPTION WHEN OTHERS THEN
  RETURN SQLSTATE;  -- o rollback do bloco desfaz o SET LOCAL ROLE
END $$;

-- Uma linha em cada tabela que o grupo (b) atualiza, para o UPDATE disparar o gatilho.
INSERT INTO public.stripe_sessions (id, case_id, payment_status)
  VALUES ('cs_rls', 'CASO_bbbbbbbb-0000-4000-8000-000000000001', 'paid');
INSERT INTO public.form_submissions (case_id, form_token, nome, email, document_status)
  VALUES ('CASO_bbbbbbbb-0000-4000-8000-000000000001', 'trls', 'Rls', 'rls@exemplo.com', 'pending');

-- (a) A chave anônima é barrada — e um usuário logado também.
SELECT is(pg_temp.tentar_como(p, c), '42501', p || ' barrado: ' || c)
  FROM (VALUES ('anon'), ('authenticated')) AS papeis(p)
 CROSS JOIN (VALUES
   ('SELECT 1 FROM public.stripe_sessions LIMIT 1'),
   ('SELECT 1 FROM public.form_submissions LIMIT 1'),
   ('SELECT 1 FROM public.dispatches LIMIT 1'),
   ('SELECT 1 FROM public.generated_documents LIMIT 1'),
   ('SELECT 1 FROM public.radar_faixas LIMIT 1'),
   ($$INSERT INTO public.form_submissions (case_id, form_token, nome, email, document_status) VALUES ('CASO_x', 't', 'x', 'x@x.com', 'pending')$$),
   ($$UPDATE public.dispatches SET status = status WHERE false$$),
   ($$SELECT public.confirm_dispatch('x', true)$$)
 ) AS comandos(c)
 ORDER BY p, c;

-- (b) O fluxo continua: a service_role lê, grava e confirma.
SELECT is(pg_temp.tentar_como('service_role', c), 'ok', 'service_role: ' || c)
  FROM (VALUES
   ('SELECT 1 FROM public.stripe_sessions LIMIT 1'),
   ('SELECT 1 FROM public.form_submissions LIMIT 1'),
   ('SELECT 1 FROM public.dispatches LIMIT 1'),
   ('SELECT 1 FROM public.generated_documents LIMIT 1'),
   ('SELECT 1 FROM public.radar_consultas_log LIMIT 1'),
   ('SELECT 1 FROM public.radar_snapshots LIMIT 1'),
   ('SELECT 1 FROM public.radar_instruments LIMIT 1'),
   ('SELECT 1 FROM public.radar_faixas LIMIT 1'),
   ('SELECT 1 FROM public.radar_verificacoes LIMIT 1'),
   ($$SELECT public.confirm_dispatch('chave-inexistente', true)$$),
   -- o gatilho de updated_at (update_updated_at_column) continua disparando
   ($$UPDATE public.form_submissions SET nome = 'Rls 2' WHERE case_id = 'CASO_bbbbbbbb-0000-4000-8000-000000000001'$$),
   -- a coluna gerada local_via_norm (radar_unaccent_imutavel) continua calculando
   ($$INSERT INTO public.radar_instruments (id, municipio, local_via) VALUES ('rls-teste', 'Niterói', 'Av. Teste')$$)
 ) AS comandos(c);

-- (c) As políticas são as escritas: uma por tabela, só para a service_role.
SELECT policies_are('public', t::name, ARRAY[pol]::name[], t || ': só a política da service_role')
  FROM (VALUES
   ('stripe_sessions',     'Service role gerencia stripe_sessions'),
   ('form_submissions',    'Service role gerencia form_submissions'),
   ('dispatches',          'Service role gerencia dispatches'),
   ('generated_documents', 'Service role gerencia generated_documents'),
   ('radar_consultas_log', 'Service role gerencia radar_consultas_log'),
   ('radar_snapshots',     'Service role gerencia radar_snapshots'),
   ('radar_instruments',   'Service role gerencia radar_instruments'),
   ('radar_faixas',        'Service role gerencia radar_faixas'),
   ('radar_verificacoes',  'Service role gerencia radar_verificacoes')
 ) AS x(t, pol);

SELECT policy_roles_are('public', t::name, pol::name, ARRAY['service_role']::name[], pol || ': só service_role')
  FROM (VALUES
   ('stripe_sessions',     'Service role gerencia stripe_sessions'),
   ('form_submissions',    'Service role gerencia form_submissions'),
   ('dispatches',          'Service role gerencia dispatches'),
   ('generated_documents', 'Service role gerencia generated_documents'),
   ('radar_consultas_log', 'Service role gerencia radar_consultas_log'),
   ('radar_snapshots',     'Service role gerencia radar_snapshots'),
   ('radar_instruments',   'Service role gerencia radar_instruments'),
   ('radar_faixas',        'Service role gerencia radar_faixas'),
   ('radar_verificacoes',  'Service role gerencia radar_verificacoes')
 ) AS x(t, pol);

-- (d) Varreduras: não citam tabela por nome, então pegam o que ainda não existe.
-- Rodam ANTES do grupo (e), que cria uma tabela sem RLS no public.
SELECT is_empty($$
  SELECT c.relname, r.papel
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   CROSS JOIN (VALUES ('anon'), ('authenticated')) AS r(papel)
   WHERE n.nspname = 'public'
     AND ((c.relkind IN ('r', 'p', 'v', 'm', 'f')
           AND has_table_privilege(r.papel, c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))
       OR (c.relkind = 'S'
           AND has_sequence_privilege(r.papel, c.oid, 'USAGE,SELECT,UPDATE')))
$$, 'd.1 nenhuma tabela ou sequência do public concede privilégio a anon ou authenticated');

SELECT is_empty($$
  SELECT tablename, policyname
    FROM pg_policies
   WHERE schemaname = 'public'
     AND roles && ARRAY['public', 'anon', 'authenticated']::name[]
$$, 'd.2 nenhuma política do public vale para public, anon ou authenticated');

SELECT is_empty($$
  SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relrowsecurity
$$, 'd.3 toda tabela do public tem a RLS ligada');

SELECT is_empty($$
  SELECT p.oid::regprocedure
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.prosecdef
     AND (has_function_privilege('anon', p.oid, 'EXECUTE')
       OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))
$$, 'd.4 nenhuma função SECURITY DEFINER do public executável por anon ou authenticated');

-- (e) O privilégio padrão mudou: objeto novo do postgres nasce sem acesso para a chave anônima.
CREATE TABLE public._rls_teste (id int);
CREATE FUNCTION public._rls_teste_fn() RETURNS int LANGUAGE sql AS 'SELECT 1';

SELECT ok(NOT has_table_privilege('anon', 'public._rls_teste',
          'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),
          'e.1 tabela nova sem privilégio para anon');
SELECT ok(NOT has_table_privilege('authenticated', 'public._rls_teste',
          'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),
          'e.2 tabela nova sem privilégio para authenticated');
-- Pelo PUBLIC a função segue executável (padrão global do Postgres) — por isso a d.4.
SELECT ok(coalesce(array_to_string(proacl, ',') !~ '(^|,)(anon|authenticated)=', true),
          'e.3 função nova sem EXECUTE explícito para anon ou authenticated')
  FROM pg_proc WHERE oid = 'public._rls_teste_fn()'::regprocedure;

SELECT * FROM finish();
ROLLBACK;
```

Contagem do `plan(53)`: (a) 16, (b) 12, (c) 18, (d) 4, (e) 3.

- [ ] **Step 2: Rodar o teste contra o banco sem a migration e ver falhar**

Run:
```bash
docker exec -i supabase_db_tsdzvxgkokrjqayxukud psql -U postgres -d postgres -Xqt -f - < supabase/tests/rls_test.sql | grep -E '^ *(not )?ok|ERROR' > /tmp/claude-1000/-mnt-c-Users-klaus-Coding-Atlas-amorecorrer-com/a097b794-e034-47e8-9676-6cb532157d25/scratchpad/rls_red.txt; grep -c '^ *not ok' /tmp/claude-1000/-mnt-c-Users-klaus-Coding-Atlas-amorecorrer-com/a097b794-e034-47e8-9676-6cb532157d25/scratchpad/rls_red.txt; grep -c 'ERROR' /tmp/claude-1000/-mnt-c-Users-klaus-Coding-Atlas-amorecorrer-com/a097b794-e034-47e8-9676-6cb532157d25/scratchpad/rls_red.txt; grep '^ *ok' /tmp/claude-1000/-mnt-c-Users-klaus-Coding-Atlas-amorecorrer-com/a097b794-e034-47e8-9676-6cb532157d25/scratchpad/rls_red.txt
```
Expected: `34`, depois `0`, depois as 19 linhas `ok`. As 34 falhas: os 16 de (a) (a tentativa volta `ok`, ou um erro de restrição no `INSERT`, em vez de `42501`); 8 `policies_are` (as 4 tabelas do fluxo têm o nome antigo, as 4 do radar público têm duas políticas); 4 `policy_roles_are` (as políticas novas do fluxo ainda não existem); d.1, d.2 e d.4; e.1, e.2 e e.3. Os 19 `ok`: os 12 de (b), `policies_are` de `radar_consultas_log`, os 5 `policy_roles_are` das políticas do radar e d.3. Se a contagem divergir, ler cada linha. Um item de (b) falhando aqui é defeito do teste (semente ou nome de coluna), não da migration: corrigir antes de seguir.

- [ ] **Step 3: Escrever a migration**

Criar `supabase/migrations/20261012000000_rls_fechada.sql`:

```sql
-- RLS fechada para a chave anônima — spec docs/superpowers/specs/2026-10-12-rls-fechada-design.md
--
-- A chave anônima vai no bundle do site, e até aqui lia e escrevia as tabelas
-- do fluxo (CPF, endereço, placa; reabrir um caso é o caminho de um segundo
-- e-mail ao cliente). Duas causas:
--
--   * a baseline escreveu as quatro políticas do fluxo sem TO — e política sem
--     TO vale para PUBLIC, que inclui anon e authenticated (o comentário dela
--     dizia "Nenhuma policy para anon");
--   * o privilégio padrão da Supabase no schema public dá todos os privilégios
--     a anon e authenticated em toda tabela nova, e EXECUTE em toda função.
--
-- Esta migration fecha com duas travas independentes: políticas só para a
-- service_role e REVOKE dos privilégios. Ninguém usava o acesso: o site só usa
-- a chave anônima para supabase.auth e chama as Edge Functions por fetch; a
-- Edge, o Express e o pipeline usam a service_role (que ignora a RLS).
--
-- Limites do privilégio padrão (fim do arquivo):
--   * o EXECUTE de toda função nova para PUBLIC é padrão GLOBAL do Postgres e
--     não sai por schema. A guarda é supabase/tests/rls_test.sql (d.4): nenhuma
--     função SECURITY DEFINER do public executável por anon ou authenticated.
--     Toda função SECURITY DEFINER nova sai com
--     REVOKE ALL ... FROM PUBLIC, anon, authenticated;
--   * os padrões do papel supabase_admin não mudam (a migration roda como
--     postgres, que não pode alterá-los). Nenhum objeto nosso nasce por ele.

-- Fluxo: a mesma política, agora com o papel escrito. A service_role ignora a
-- RLS de qualquer jeito; a política fica por simetria com o radar e como
-- documentação de quem acessa.
DROP POLICY IF EXISTS "Service role can manage stripe sessions"     ON public.stripe_sessions;
DROP POLICY IF EXISTS "Service role can manage form submissions"    ON public.form_submissions;
DROP POLICY IF EXISTS "Service role can manage dispatches"          ON public.dispatches;
DROP POLICY IF EXISTS "Service role can manage generated_documents" ON public.generated_documents;

DROP POLICY IF EXISTS "Service role gerencia stripe_sessions"     ON public.stripe_sessions;
DROP POLICY IF EXISTS "Service role gerencia form_submissions"    ON public.form_submissions;
DROP POLICY IF EXISTS "Service role gerencia dispatches"          ON public.dispatches;
DROP POLICY IF EXISTS "Service role gerencia generated_documents" ON public.generated_documents;

CREATE POLICY "Service role gerencia stripe_sessions"     ON public.stripe_sessions
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role gerencia form_submissions"    ON public.form_submissions
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role gerencia dispatches"          ON public.dispatches
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role gerencia generated_documents" ON public.generated_documents
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Radar: sai a leitura pública (ninguém no site lê essas tabelas; a consulta
-- antes do pagamento, se vier, passa por uma Edge Function com a service_role).
-- As políticas da service_role ficam.
DROP POLICY IF EXISTS "Radar snapshots são legíveis publicamente"    ON public.radar_snapshots;
DROP POLICY IF EXISTS "Radar instruments são legíveis publicamente"  ON public.radar_instruments;
DROP POLICY IF EXISTS "Radar faixas são legíveis publicamente"       ON public.radar_faixas;
DROP POLICY IF EXISTS "Radar verificações são legíveis publicamente" ON public.radar_verificacoes;

-- Segunda trava: sem privilégio, a chave anônima é barrada antes da RLS
-- (inclusive TRUNCATE, que a RLS não cobre). service_role e postgres mantêm tudo.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

-- confirm_dispatch é SECURITY DEFINER: exposta, marcava um caso completed ou
-- failed com a dispatch_key. Chamada só pelo Express e pela Edge (service_role).
-- As outras três funções do public (update_updated_at_column,
-- radar_unaccent_imutavel, radar_classificar_resultado) não são SECURITY
-- DEFINER e só transformam texto; ficam como estão.
REVOKE ALL ON FUNCTION public.confirm_dispatch(text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_dispatch(text, boolean) TO service_role;

-- Objeto novo criado pelo postgres (as migrations) no public nasce sem acesso
-- para a chave anônima. Quem precisar dar acesso escreve o GRANT, à vista.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM anon, authenticated;

COMMENT ON TABLE public.stripe_sessions IS
  'Sessoes do Stripe Checkout, uma por case_id. So a service_role acessa (Edge Functions e Express); o navegador nunca le nem grava.';
COMMENT ON TABLE public.form_submissions IS
  'Formulario do cliente, um por case_id (dados pessoais). So a service_role acessa (Edge Functions e Express); o navegador nunca le nem grava.';
COMMENT ON TABLE public.dispatches IS
  'Entrega do caso ao pipeline, uma por case_id; dispatch_key e a chave de idempotencia. So a service_role acessa; o navegador nunca le nem grava.';
COMMENT ON TABLE public.generated_documents IS
  'Auditoria dos PDFs gerados (bucket, path, sha256, status do e-mail). So a service_role acessa; o navegador nunca le nem grava.';
```

- [ ] **Step 4: Aplicar no banco local**

Run:
```bash
docker exec -i supabase_db_tsdzvxgkokrjqayxukud psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f - < supabase/migrations/20261012000000_rls_fechada.sql
```
Expected: só `DROP POLICY`, `CREATE POLICY`, `REVOKE`, `GRANT`, `ALTER DEFAULT PRIVILEGES` e `COMMENT`, sem `ERROR` (avisos `NOTICE: policy ... does not exist, skipping` são esperados para os `DROP IF EXISTS` dos nomes novos).

Rodar a migration **de novo** (reaplicável):
```bash
docker exec -i supabase_db_tsdzvxgkokrjqayxukud psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f - < supabase/migrations/20261012000000_rls_fechada.sql
```
Expected: o mesmo, sem `ERROR`.

- [ ] **Step 5: Rodar o teste e ver passar**

Run:
```bash
docker exec -i supabase_db_tsdzvxgkokrjqayxukud psql -U postgres -d postgres -Xqt -f - < supabase/tests/rls_test.sql | grep -E '^ *(not )?ok|ERROR' | grep -c -E '^ *ok'; docker exec -i supabase_db_tsdzvxgkokrjqayxukud psql -U postgres -d postgres -Xqt -f - < supabase/tests/rls_test.sql | grep -E '^ *not ok|ERROR'
```
Expected: `53` e nenhuma linha na segunda saída.

- [ ] **Step 6: As suítes que já existem continuam verdes**

Run:
```bash
C=supabase_db_tsdzvxgkokrjqayxukud
docker exec -i $C psql -U postgres -d postgres -Xqt -f - < supabase/tests/entrega_test.sql | grep -E '^ *(not )?ok|ERROR' | grep -c -E '^ *ok'
docker exec -i $C psql -U postgres -d postgres -Xqt -f - < supabase/tests/entrega_test.sql | grep -E '^ *not ok|ERROR'
docker exec -i $C psql -U postgres -d postgres -Xqt -f - < supabase/tests/verificar_medidor_test.sql | grep -E '^ *(not )?ok' | grep -c -E '^ *ok'
docker exec -i $C psql -U postgres -d postgres -Xqt -f - < supabase/tests/verificar_medidor_test.sql | grep -E '^ *not ok|ERROR'
bash supabase/tests/entrega_concorrencia.sh
npx supabase db query --local -f tests/sql/assert_storage_setup.sql
npm run radar:test 2>&1 | grep -E '^# (tests|pass|fail)'
```
Expected: `29` e nada; `26` e nada; a prova de concorrência termina com A=1 e B=0 (a saída de sucesso do script); a asserção do Storage sem erro; `# tests 111`, `# pass 111`, `# fail 0`.

- [ ] **Step 7: Commit**

```bash
git add supabase/tests/rls_test.sql supabase/migrations/20261012000000_rls_fechada.sql
git commit -F - <<'EOF'
fix(db): RLS e privilégios fechados para a chave anônima

Políticas do fluxo só para a service_role, leitura pública do radar
removida, REVOKE de anon e authenticated nas tabelas e em confirm_dispatch,
e privilégio padrão do public sem acesso para a chave anônima.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011vVJcDsBPjzUaFKyNjNbjp
EOF
```

---

### Task 2: Documentação

**Files:**
- Modify: `CLAUDE.md` (seção "Comandos" → bloco de testes; seção "Modelo de dados" → parágrafo "Invariantes" e parágrafo "O schema vive em dez migrations")
- Modify: `PENDENCIAS.md` (item da RLS em "Produção e lançamento"; achado menor adiado da entrega única)
- Modify: `PROGRESSO.md` (seção nova no fim)

**Interfaces:**
- Consumes: `supabase/tests/rls_test.sql` com `plan(53)` (Task 1); nome da migration `20261012000000_rls_fechada`.
- Produces: nada consumido por código.

- [ ] **Step 1: `CLAUDE.md` — comando do teste**

No bloco de testes de "Comandos", logo depois das linhas da entrega única (`bash supabase/tests/entrega_concorrencia.sh`), acrescentar:

```bash

# 53 testes da RLS fechada (pgTAP, transação revertida): a chave anônima barrada, a service_role
# funcionando e varreduras do catálogo que reprovam tabela, política ou função nova aberta:
docker exec -i supabase_db_<ref> psql -U postgres -d postgres -Xqt \
  -f - < supabase/tests/rls_test.sql | grep -E '^ *(not )?ok|ERROR'
```

- [ ] **Step 2: `CLAUDE.md` — invariante de acesso**

No parágrafo "Invariantes:" do "Modelo de dados", trocar a frase:

`RLS habilitada em todas as tabelas com política permissiva para service role.`

por:

`**A chave anônima não tem acesso a nada do schema `public`** (migration `20261012000000_rls_fechada`): `anon` e `authenticated` não têm privilégio em tabela alguma, toda política é `TO service_role`, e só a `service_role` (Edge, Express, pipeline) lê e grava. Tabela nova liga a RLS e nasce sem privilégio para a chave anônima (o privilégio padrão do `public` foi mudado); dar acesso a ela exige um `GRANT` explícito, justificado na migration. Toda função `SECURITY DEFINER` sai com `REVOKE ALL … FROM PUBLIC, anon, authenticated` — o `EXECUTE` para `PUBLIC` é padrão global do Postgres e não sai por schema. O `supabase/tests/rls_test.sql` varre o catálogo e reprova quem esquecer. Até 12/10/2026 a baseline tinha as políticas do fluxo sem `TO` (valiam para `public`) e o radar era legível pela chave anônima.`

- [ ] **Step 3: `CLAUDE.md` — contagem de migrations**

No parágrafo do schema, trocar `**O schema vive em dez migrations**` por `**O schema vive em onze migrations**` e `… e a da entrega única (09/10/2026).` por `…, a da entrega única (09/10/2026) e a da RLS fechada (12/10/2026).`

- [ ] **Step 4: `PENDENCIAS.md`**

Remover o item da RLS aberta (o que começa com `- **RLS aberta` no topo de "Produção e lançamento") e, se existir, a linha do achado menor adiado da entrega única sobre a justificativa do bloqueio da `devolver_entrega` (procurar `devolver_entrega` no arquivo e ler o contexto antes de apagar). Acrescentar em "Robustez" (ou na seção onde estava "Publicar e testar a entrega única"):

```markdown
- **Publicar e conferir a RLS fechada** — `npx supabase db push`; conferências da spec (§4.3): varreduras do catálogo em produção, API REST negando a chave anônima com `42501` e um caso de ponta a ponta até o e-mail. → Sessão de 12/10/2026 (RLS fechada)
```

- [ ] **Step 5: `PROGRESSO.md`**

Acrescentar no fim:

```markdown

## Sessão de 12/10/2026 — RLS fechada para a chave anônima

Spec `docs/superpowers/specs/2026-10-12-rls-fechada-design.md`, plano `docs/superpowers/plans/2026-10-12-rls-fechada.md`. Antes, a `fix/entrega-unica` entrou na `main` por fast-forward (push do Klaus).

Levantamento em produção (11/10): as quatro tabelas do fluxo tinham a política `FOR ALL USING (true)` **sem `TO`** — vale para `public`, logo para a chave anônima, que vai no bundle do site —, e o padrão da Supabase dava todos os privilégios a `anon` e `authenticated`; `confirm_dispatch` (`SECURITY DEFINER`) era executável pela chave anônima; o radar era legível de propósito. Ninguém usava esse acesso: o site só usa a chave anônima para `supabase.auth` e chama as Edge Functions por `fetch`.

- **Migration `20261012000000_rls_fechada`:** políticas do fluxo só para a `service_role`, leitura pública do radar removida (decisão do Klaus: a consulta antes do pagamento, no projeto 2, passaria por uma Edge Function), `REVOKE ALL` de `anon`/`authenticated` nas nove tabelas, `confirm_dispatch` só para a `service_role`, e o privilégio padrão do `public` sem acesso para a chave anônima em tabela, sequência e função novas.
- **Teste:** `supabase/tests/rls_test.sql`, 53 asserções — a chave anônima e `authenticated` barradas (`42501`), a `service_role` lendo, gravando, disparando o gatilho de `updated_at` e a coluna gerada do radar, as políticas, quatro varreduras do catálogo e o privilégio padrão.

**Arquivos:** `supabase/migrations/20261012000000_rls_fechada.sql`, `supabase/tests/rls_test.sql`, `CLAUDE.md`, `PENDENCIAS.md`, `PROGRESSO.md`.

**Falta:** publicar e conferir (no `PENDENCIAS.md`).
```

- [ ] **Step 6: Conferir e commitar**

Run:
```bash
grep -n "RLS habilitada em todas" CLAUDE.md; grep -n "onze migrations" CLAUDE.md; grep -n "rls_test.sql" CLAUDE.md; grep -n -i "RLS aberta" PENDENCIAS.md
```
Expected: a primeira e a última não acham nada; a segunda e a terceira acham uma linha cada (a terceira pode achar duas: o comando e a invariante).

```bash
git add CLAUDE.md PENDENCIAS.md PROGRESSO.md
git commit -F - <<'EOF'
docs: RLS fechada no CLAUDE.md, PROGRESSO e PENDENCIAS

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011vVJcDsBPjzUaFKyNjNbjp
EOF
```

---

### Task 3: Publicação e conferências (com o Klaus)

**Files:**
- Modify: `PROGRESSO.md` (resultado), `PENDENCIAS.md` (remover "Publicar e conferir a RLS fechada"; acrescentar o caso de teste à limpeza)

**Interfaces:**
- Consumes: as quatro varreduras do grupo (d) do `rls_test.sql` (Task 1), copiadas abaixo como consultas avulsas.
- Produces: nada.

- [ ] **Step 1: Logs da API antes de publicar**

Pela MCP da Supabase (`query_logs`, projeto `tsdzvxgkokrjqayxukud`, janela das últimas 24 h), procurar pedidos à API REST:

```sql
select timestamp, event_message
  from logs
 where source = 'edge_logs'
   and event_message like '%/rest/v1/%'
 order by timestamp desc
 limit 50
```

Expected: nenhum pedido a `/rest/v1/` (as Edge Functions chamam a API REST com a service role, então pedidos delas podem aparecer; para cada linha, conferir se vem de uma função — `stripe-webhook` faz `GET/PATCH /rest/v1/stripe_sessions` e `PATCH /rest/v1/form_submissions`). Pedido a `/rest/v1/` que não seja de uma Edge Function nem do Express → **parar** e mostrar ao Klaus antes de publicar.

Se o `event_message` não trouxer o caminho, rodar `select distinct source from logs` e repetir sobre a fonte da API (`edge_logs` costuma ter `metadata` com `request.path`), registrando o que a janela cobre.

- [ ] **Step 2: Pedir ao Klaus a publicação**

Mensagem ao Klaus: rodar no terminal dele, da raiz do repositório, com a branch `fix/rls-fechada` no disco:

```
npx supabase db push
```

Nenhuma função publicada, nenhum serviço reiniciado. Esperar a confirmação.

- [ ] **Step 3: Conferir o catálogo em produção (MCP `execute_sql`)**

```sql
select 'migration' k, version v from supabase_migrations.schema_migrations where version = '20261012000000'
union all
select 'd1', c.relname || ' ' || r.papel
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 cross join (values ('anon'), ('authenticated')) as r(papel)
 where n.nspname = 'public'
   and ((c.relkind in ('r','p','v','m','f')
         and has_table_privilege(r.papel, c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))
     or (c.relkind = 'S' and has_sequence_privilege(r.papel, c.oid, 'USAGE,SELECT,UPDATE')))
union all
select 'd2', tablename || ' / ' || policyname from pg_policies
 where schemaname = 'public' and roles && array['public','anon','authenticated']::name[]
union all
select 'd3', c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind in ('r','p') and not c.relrowsecurity
union all
select 'd4', p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.prosecdef
   and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE'))
union all
select 'pol', tablename || ' / ' || policyname || ' / ' || roles::text from pg_policies where schemaname = 'public';
```

Expected: uma linha `migration 20261012000000`; **nenhuma** linha `d1`, `d2`, `d3` ou `d4`; nove linhas `pol`, cada uma com `{service_role}`.

- [ ] **Step 4: API REST com a chave anônima**

Run (a chave sai do `.env` e não é impressa):
```bash
cd /mnt/c/Users/klaus/Coding/Atlas/amorecorrer.com && set -a && . ./.env >/dev/null 2>&1; set +a
U="$VITE_SUPABASE_URL"; K="${VITE_SUPABASE_PUBLISHABLE_KEY:-$VITE_SUPABASE_ANON_KEY}"
echo "chave: ${K:0:12}…"
curl -s -w "\nHTTP %{http_code}\n" "$U/rest/v1/form_submissions?select=case_id&limit=1" -H "apikey: $K" -H "Authorization: Bearer $K"
curl -s -w "\nHTTP %{http_code}\n" "$U/rest/v1/radar_faixas?limit=1" -H "apikey: $K" -H "Authorization: Bearer $K"
curl -s -w "\nHTTP %{http_code}\n" -X POST "$U/rest/v1/rpc/confirm_dispatch" -H "apikey: $K" -H "Authorization: Bearer $K" -H "Content-Type: application/json" -d '{"dispatch_key":"x","success":true}'
```
Expected: as três respostas com `"code":"42501"` (`permission denied for table form_submissions`, `… radar_faixas`, `permission denied for function confirm_dispatch`) e HTTP 401 ou 403. **`[]` com HTTP 200 é falha** (a RLS barrou, mas o privilégio continua). Se o nome da variável da chave for outro, achar com `grep -o '^VITE_SUPABASE_[A-Z_]*' .env` (sem imprimir valores).

- [ ] **Step 5: Ponta a ponta (Klaus)**

Pedir ao Klaus um caso completo: questionário, pagamento com o cartão de teste da sandbox, formulário. Com o `case_id` dele, conferir pela MCP:

```sql
select
 (select payment_status from stripe_sessions where case_id = '<case_id>') pagamento,
 (select document_status from form_submissions where case_id = '<case_id>') formulario,
 (select status from dispatches where case_id = '<case_id>') dispatch,
 (select status || ' / ' || coalesce(sent_at::text, '-') from generated_documents where case_id = '<case_id>') documento;
```
Expected: `paid`, `completed`, `sent`, `emailed / <data>`. E nos logs das funções (`function_logs`), `[entrega] entregue` para esse caso, sem erro de permissão em `function_logs` nem resposta 500 em `function_edge_logs`.

Lembrar ao Klaus, antes: o túnel do pipeline e a `DISPATCH_PIPELINE_URL` publicada precisam estar em dia (o túnel muda a cada reinício do cloudflared).

- [ ] **Step 6: Registrar e commitar**

`PROGRESSO.md`: na seção de 12/10/2026, trocar a linha `**Falta:** publicar e conferir (no \`PENDENCIAS.md\`).` por um parágrafo com o resultado dos Steps 1, 3, 4 e 5 (o que os logs mostraram e a janela que cobriram, as varreduras vazias, as três respostas `42501` e o `case_id` de ponta a ponta com PDF e e-mail).

`PENDENCIAS.md`: remover `- **Publicar e conferir a RLS fechada** …` e acrescentar o `case_id` do Step 5 ao item "Casos de teste da entrega única no banco e no bucket" (mudar o título do item para "Casos de teste no banco e no bucket").

```bash
git add PROGRESSO.md PENDENCIAS.md
git commit -F - <<'EOF'
docs: RLS fechada publicada e conferida em produção

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011vVJcDsBPjzUaFKyNjNbjp
EOF
```
