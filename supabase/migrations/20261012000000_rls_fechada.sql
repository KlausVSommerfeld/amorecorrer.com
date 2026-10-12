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
