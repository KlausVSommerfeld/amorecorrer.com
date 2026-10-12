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
