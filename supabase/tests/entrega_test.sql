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
