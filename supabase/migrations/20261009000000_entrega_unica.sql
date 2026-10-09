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
