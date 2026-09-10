-- ===========================================================================
-- BASELINE DO SCHEMA — consolida as 12 migrations anteriores e corrige o que
-- elas deixaram errado
-- ===========================================================================
--
-- Substitui:
--   20250101000001_create_trigger_functions
--   20250101000002_create_stripe_sessions
--   20250101000003_create_form_submissions
--   20250101000004_create_dispatch_tables
--   20250101000005_create_dispatch_functions
--   20251231000001_alter_data_infracao_to_timestamp
--   20260109134917_remote_schema
--   20260116120000_revert_fk_stripe_sessions_primary
--   20260206120000_fix_dispatch_constraints
--   20260209130000_generated_documents
--   20260510000000_fix_generated_documents_email_status_and_case_id
--   20260525000000_fix_confirm_dispatch_dispatch_key_type
--
-- POR QUE CONSOLIDAR. As doze descreviam o mesmo schema três vezes:
-- `attempt_dispatch` era definida em três arquivos, `confirm_dispatch` em três,
-- `calculate_dup_guard` em dois com assinaturas diferentes. Duas tinham efeito
-- líquido zero — a `20250101000005` teve suas três funções dropadas pela
-- `20260109134917`, e a `20251231000001` (data_infracao -> timestamptz) foi
-- desfeita pela migration seguinte. Só a `20260109134917` traz vinte comandos
-- `drop` desmontando o que as três anteriores acabaram de montar. Ler o schema
-- exigia simular a fita inteira de cabeça.
--
-- ESTE ARQUIVO NÃO É UM RETRATO. Uma versão anterior dele reproduzia a produção
-- byte a byte, inclusive os erros; a decisão do Klaus em 09/09/2026 foi não
-- preservar erro nenhum. Por isso o schema aqui É O CORRETO, e não o vigente —
-- e por isso o remoto precisa ser RECONSTRUÍDO a partir deste arquivo, não
-- marcado como já aplicado. `migration repair` faria a correção nunca rodar.
-- Reconstruir é viável porque, conferido em 09/09/2026, as tabelas do fluxo em
-- produção estão VAZIAS: zero linhas em form_submissions, stripe_sessions e
-- dispatches.
--
-- O QUE MUDA EM RELAÇÃO AO QUE ESTÁ EM PRODUÇÃO HOJE:
--
--   Removido (lixo inerte, verificado sem nenhum caller no código):
--     * função `trigger_set_updated_at` — duplicata exata de
--       `update_updated_at_column`, sem nenhum trigger a usando.
--     * função `generate_case_id` — o case_id real nasce na Edge
--       `create-checkout-session` como CASO_<uuid>, formato que esta função
--       nem produz. Só aparecia no types.ts gerado.
--     * índice `idx_stripe_sessions_case_id` — duplicava o índice da
--       constraint UNIQUE da mesma coluna.
--     * índice `idx_dispatches_case_id` — idem, duplicava
--       `dispatches_case_id_unique`.
--     * trigger `form_submissions_dup_guard_trigger` e sua função
--       `calculate_dup_guard` — ver o bloco DUP_GUARD abaixo.
--     * coluna `form_submissions.renavam` — nenhum caller em src/, server/,
--       pipeline/ ou supabase/functions/: o formulário não a coleta e
--       `form-submit` não a grava. Aparecia só no types.ts gerado. Se o RENAVAM
--       virar campo do formulário, volta como migration nova.
--     * colunas `dispatches.delivered_at` e `dispatches.payload` — resíduo da
--       arquitetura n8n, que mandava o payload ao banco. Hoje os únicos
--       escritores de `dispatches` são `attempt_dispatch` (INSERT de case_id,
--       dispatch_key, stripe_session_id, status, created_at) e
--       `confirm_dispatch` (UPDATE de status e updated_at); nenhum dos dois as
--       toca, e os quatro acessos no código (server/src/index.ts:189,239,329 e
--       form-submit:426) são `select`. O payload real viaja no POST assinado
--       para o pipeline e nunca chega ao Postgres.
--
--   Restaurado (validações que a 20260109134917 dropou):
--     * CHECK de formato de `case_id` nas três tabelas do fluxo, agora exigindo
--       CASO_<uuid> completo em vez do antigo `^CASO_` frouxo.
--     * CHECK em `dispatches.status`. O original foi dropado porque não previa
--       'sent', que `confirm_dispatch` grava; este prevê.
--
--     * CHECK de formato em `generated_documents.case_id`, que a 20260510000000
--       havia afrouxado para aceitar uuid sem prefixo — agora igual às outras
--       três tabelas.
--
--   Corrigido (defeito visível para o cliente):
--     * `form_submissions.data_infracao` era `date`, mas o formulário exige a
--       HORA e a valida (Form.tsx:553). A hora era descartada no cast e nunca
--       chegava à peça, já que o pipeline monta o contexto da IA a partir das
--       colunas. A migration 20251231000001 tentou consertar isto e a
--       20260109134917 a desfez com `using data_infracao::date`. Agora é
--       `timestamp` SEM fuso — ver o comentário da coluna.
--     * `stripe_sessions.payment_at` era `timestamp` SEM fuso recebendo um
--       instante UTC com sufixo Z de stripe-webhook (index.ts:120). O fuso era
--       descartado no cast e a hora do pagamento ficava 3h à frente do BRT.
--       Agora é `timestamptz` — o inverso de data_infracao, e pelo motivo
--       inverso: aqui o valor É um instante.
--     * `form_submissions.document_status` era nullable. `attempt_dispatch`
--       compara `_document_status = 'pending'`, e NULL faz a comparação virar
--       NULL: o caso pago simplesmente nunca despacharia, sem erro nem log.
--       Agora é NOT NULL e SEM DEFAULT — quem insere a linha DECLARA o estado,
--       em vez de herdá-lo de uma regra invisível no schema. O único inserter
--       é a Edge `form-submit`, que passou a escrever 'pending' explicitamente;
--       os três .ps1 de teste que inserem direto já informavam a coluna, e o
--       `stripe-webhook` só faz PATCH. Qualquer writer novo que esqueça a
--       coluna falha alto, que é o comportamento desejado.
--
--   Corrigido (comentários que descreviam o banco errado):
--     * `stripe_sessions.case_id` dizia apontar para form_submissions — a FK é
--       o contrário desde a 20260116120000.
--     * `form_submissions.stripe_session_id` dizia ser FK — não é, e não pode
--       ser: o valor vem do localStorage do navegador e pode chegar antes da
--       sessão existir.
--     * `form_submissions.dup_guard` descrevia a fórmula da Edge (9 campos)
--       para uma coluna preenchida pelo trigger (6 campos). Ver o bloco
--       DUP_GUARD abaixo.
--
-- NÃO FEITO DE PROPÓSITO, e cada um é uma pendência registrada:
--
--   * UNIQUE em `form_token` — foi pedido, e seria um BUG. `src/pages/Form.tsx`
--     guarda o token em localStorage sob chave fixa e só gera outro se não
--     houver nenhum: um cliente que compre duas vezes no mesmo navegador
--     reenvia o MESMO form_token com case_id novo, e o UNIQUE recusaria o
--     envio de quem já pagou. Foi provavelmente por isso que ele caiu.
--
-- DUP_GUARD — POR QUE O TRIGGER FOI EMBORA (decisão de 09/09/2026).
-- A coluna existe para uma única finalidade: `form-submit` compara o valor
-- gravado com o que ela mesma acabou de calcular, para responder "Duplicate
-- submission (no-op)" a um reenvio idêntico. A Edge calcula sobre NOVE campos
-- com JSON.stringify e GRAVA o valor no upsert (index.ts:361). O trigger
-- calculava sobre SEIS com json_build_object e, sendo BEFORE INSERT OR UPDATE,
-- SOBRESCREVIA o que a Edge tinha acabado de gravar. Os dois nunca batiam:
-- medido com a mesma entrada, trigger 3f39d690…, Edge b8dbb9d5…. O caminho de
-- deduplicação era código morto desde sempre.
--
-- Fazer o trigger imitar a Edge não é viável: `json_build_object(...)::text` do
-- Postgres produz {"a" : "b", "c" : null} — com espaços — e JSON.stringify
-- produz {"a":"b","c":null}. Byte-a-byte só montando a string à mão em SQL, e
-- qualquer acento ou escape voltaria a divergir. A alternativa correta é a
-- inversa: quem consome o valor é a Edge, quem o calcula passa a ser só a
-- Edge, e o banco deixa de opinar. Nenhum outro serviço lê a coluna —
-- conferido em Express, pipeline e front.
--
-- Efeito colateral aceito: linha inserida por SQL direto (testes, seed) fica
-- com dup_guard vazio, o DEFAULT da coluna. Deduplicação é responsabilidade de
-- quem atende a requisição, não do armazenamento.
--
-- REGRA DAQUI EM DIANTE: toda mudança de schema entra como migration NOVA.
-- Este arquivo só volta a ser editado se o remoto for reconstruído de novo.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- Funções de trigger
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- stripe_sessions — a origem do case_id. Criada pela Edge no checkout, antes
-- de existir formulário; por isso é ela que as outras duas referenciam.
-- ---------------------------------------------------------------------------

CREATE TABLE public.stripe_sessions (
  id             text NOT NULL,
  case_id        text NOT NULL,
  status         text NOT NULL DEFAULT 'created'::text,
  payment_status text NOT NULL DEFAULT 'pending'::text,
  url            text,
  metadata       jsonb,
  created_at     timestamp with time zone NOT NULL DEFAULT now(),
  event_payload  jsonb,
  -- timestamptz, e não timestamp: em produção esta coluna era `timestamp
  -- without time zone` enquanto stripe-webhook (index.ts:120) grava
  -- `new Date(ts * 1000).toISOString()` -- um instante UTC com sufixo Z. O
  -- Postgres descartava o fuso e guardava o relógio UTC, 3h à frente do BRT,
  -- em silêncio. É o caso OPOSTO ao de form_submissions.data_infracao: ali o
  -- valor é relógio de parede copiado de um papel, aqui é o instante em que o
  -- Stripe confirmou o pagamento. Corrigido em 09/09/2026.
  payment_at     timestamp with time zone,

  CONSTRAINT stripe_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT stripe_sessions_case_id_unique UNIQUE (case_id),
  CONSTRAINT stripe_sessions_payment_status_check CHECK (
    payment_status = ANY (ARRAY['pending'::text, 'paid'::text, 'cancelled'::text, 'failed'::text])
  ),
  CONSTRAINT stripe_sessions_case_id_format CHECK (
    case_id ~ '^CASO_[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  )
);

CREATE INDEX idx_stripe_sessions_created_at ON public.stripe_sessions USING btree (created_at);
CREATE INDEX idx_stripe_sessions_payment_status ON public.stripe_sessions USING btree (payment_status);


-- ---------------------------------------------------------------------------
-- form_submissions — um registro por case_id, com os dados do auto de infração.
-- A ordem das colunas segue a da produção, menos a `renavam` que ficava no fim
-- e foi removida — ver o cabeçalho.
-- ---------------------------------------------------------------------------

CREATE TABLE public.form_submissions (
  id                     uuid NOT NULL DEFAULT gen_random_uuid(),
  case_id                text NOT NULL,
  form_token             text NOT NULL,

  nome                   text NOT NULL,
  email                  text NOT NULL,
  telefone               text,
  cpf                    text,
  endereco               text,
  cidade                 text,
  estado                 text,
  cep                    text,

  placa                  text,
  renainf                text,
  cnh                    text,

  data_infracao          timestamp without time zone,
  numero_auto            text,
  notificacao_penalidade text,
  local_infracao         text,
  velocidade_permitida   integer,
  velocidade_aferida     integer,
  orgao_autuador         text,
  artigo_ctb             text,
  descricao_infracao     text,
  amparo_legal           text,

  especie_documento      text,
  marca_modelo_especie   text,
  expedida_em            text,

  justificativa          text,

  dup_guard              text DEFAULT ''::text,
  stripe_session_id      text,
  -- NOT NULL é obrigatório aqui, não cosmético: attempt_dispatch testa
  -- `_document_status = 'pending'` e, com NULL, a comparação resulta NULL, cai
  -- no ELSE e o dispatch NUNCA acontece -- sem erro, sem log, sem linha em
  -- dispatches. O CHECK abaixo também não barra NULL. Em produção a coluna era
  -- nullable; corrigido em 09/09/2026.
  document_status        text NOT NULL,
  document_url           text,
  created_at             timestamp with time zone NOT NULL DEFAULT now(),
  updated_at             timestamp with time zone NOT NULL DEFAULT now(),

  CONSTRAINT form_submissions_pkey PRIMARY KEY (id),
  CONSTRAINT form_submissions_case_id_key UNIQUE (case_id),
  CONSTRAINT form_submissions_case_id_fkey
    FOREIGN KEY (case_id) REFERENCES public.stripe_sessions(case_id) ON DELETE CASCADE,
  CONSTRAINT form_submissions_document_status_check CHECK (
    document_status = ANY (ARRAY['pending'::text, 'generating'::text, 'completed'::text, 'failed'::text])
  ),
  CONSTRAINT form_submissions_case_id_format CHECK (
    case_id ~ '^CASO_[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  )
);

-- `stripe_session_id` NÃO tem FK: a coluna é preenchida pelo navegador a partir
-- do localStorage e pode chegar antes da linha correspondente existir.
CREATE INDEX idx_form_submissions_case_id ON public.form_submissions USING btree (case_id);
CREATE INDEX idx_form_submissions_email ON public.form_submissions USING btree (email);
CREATE INDEX idx_form_submissions_stripe_session ON public.form_submissions USING btree (stripe_session_id);


-- ---------------------------------------------------------------------------
-- dispatches — um por caso. `dispatch_key` UNIQUE é a chave de idempotência do
-- pipeline. Sem CHECK em `status`: 'sent' e 'failed' são gravados por
-- confirm_dispatch e não constavam do CHECK original, que por isso foi dropado.
-- ---------------------------------------------------------------------------

CREATE TABLE public.dispatches (
  id                uuid NOT NULL DEFAULT gen_random_uuid(),
  case_id           text NOT NULL,
  status            text NOT NULL DEFAULT 'pending'::text,
  created_at        timestamp with time zone NOT NULL DEFAULT now(),
  updated_at        timestamp with time zone NOT NULL DEFAULT now(),
  dispatch_key      text NOT NULL,
  stripe_session_id text,

  CONSTRAINT dispatches_pkey PRIMARY KEY (id),
  CONSTRAINT dispatches_case_id_unique UNIQUE (case_id),
  CONSTRAINT dispatches_dispatch_key_key UNIQUE (dispatch_key),
  CONSTRAINT dispatches_case_id_fkey
    FOREIGN KEY (case_id) REFERENCES public.stripe_sessions(case_id) ON DELETE CASCADE,
  CONSTRAINT dispatches_stripe_session_id_fkey
    FOREIGN KEY (stripe_session_id) REFERENCES public.stripe_sessions(id),
  CONSTRAINT dispatches_case_id_format CHECK (
    case_id ~ '^CASO_[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  ),
  -- 'sent' e 'failed' são o que confirm_dispatch grava; 'in_progress' é
  -- consultado por form-submit (index.ts:409) ainda que nada o escreva hoje.
  CONSTRAINT dispatches_status_check CHECK (
    status = ANY (ARRAY['pending'::text, 'in_progress'::text, 'sent'::text, 'failed'::text])
  )
);

CREATE INDEX idx_dispatches_stripe_session_id ON public.dispatches USING btree (stripe_session_id);


-- ---------------------------------------------------------------------------
-- generated_documents — auditoria do PDF. O binário vive no Storage; aqui
-- ficam bucket, caminho, sha256 e o desfecho do e-mail.
-- ---------------------------------------------------------------------------

CREATE TABLE public.generated_documents (
  id                  uuid NOT NULL DEFAULT gen_random_uuid(),
  dispatch_key        text NOT NULL,
  case_id             text NOT NULL,
  stripe_session_id   text,
  email_to            text NOT NULL,
  storage_bucket      text NOT NULL,
  storage_path        text NOT NULL,
  sha256              text,
  status              text NOT NULL DEFAULT 'generated'::text,
  provider            text,
  provider_message_id text,
  sent_at             timestamp with time zone,
  error_detail        text,
  created_at          timestamp with time zone NOT NULL DEFAULT now(),
  updated_at          timestamp with time zone NOT NULL DEFAULT now(),

  CONSTRAINT generated_documents_pkey PRIMARY KEY (id),
  CONSTRAINT generated_documents_dispatch_key_fkey
    FOREIGN KEY (dispatch_key) REFERENCES public.dispatches(dispatch_key) ON DELETE RESTRICT,
  CONSTRAINT generated_documents_stripe_session_id_fkey
    FOREIGN KEY (stripe_session_id) REFERENCES public.stripe_sessions(id) ON DELETE SET NULL,
  -- Mesmo formato exigido nas três tabelas do fluxo. A 20260510000000 havia
  -- afrouxado isto para aceitar também uuid sem o prefixo CASO_, o que deixava
  -- esta tabela mais permissiva que as outras três sem nenhuma razão de
  -- produto: o case_id que o pipeline devolve é sempre o que a Edge gerou.
  CONSTRAINT generated_documents_case_id_format CHECK (
    case_id ~ '^CASO_[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  ),
  CONSTRAINT generated_documents_status_check CHECK (
    status = ANY (ARRAY['generated'::text, 'emailed'::text, 'email_failed'::text, 'email_skipped'::text])
  )
);

-- Índices únicos, não constraints — é assim que estão em produção.
CREATE UNIQUE INDEX generated_documents_dispatch_key_key
  ON public.generated_documents USING btree (dispatch_key);
CREATE UNIQUE INDEX generated_documents_bucket_path_key
  ON public.generated_documents USING btree (storage_bucket, storage_path);

CREATE INDEX idx_generated_documents_case_id ON public.generated_documents USING btree (case_id);
CREATE INDEX idx_generated_documents_status ON public.generated_documents USING btree (status);
CREATE INDEX idx_generated_documents_created_at ON public.generated_documents USING btree (created_at DESC);
CREATE INDEX idx_generated_documents_email_to ON public.generated_documents USING btree (email_to);


-- ---------------------------------------------------------------------------
-- RLS — ligada nas quatro tabelas, com policy permissiva para a service role.
-- Nenhuma policy para `anon`: o produto não expõe leitura direta ao navegador.
-- ---------------------------------------------------------------------------

ALTER TABLE public.stripe_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generated_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage stripe sessions"
  ON public.stripe_sessions FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role can manage form submissions"
  ON public.form_submissions FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role can manage dispatches"
  ON public.dispatches FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role can manage generated_documents"
  ON public.generated_documents FOR ALL USING (true) WITH CHECK (true);


-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

CREATE TRIGGER update_form_submissions_updated_at
  BEFORE UPDATE ON public.form_submissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER dispatches_set_updated_at
  BEFORE UPDATE ON public.dispatches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER generated_documents_set_updated_at
  BEFORE UPDATE ON public.generated_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ---------------------------------------------------------------------------
-- RPCs do fluxo de dispatch, chamadas pelas Edge Functions e pelo Express.
--
-- ATENÇÃO: só existe UMA assinatura de attempt_dispatch — `p_case_id`. A
-- variante `case_id` que o CLAUDE.md descreve como "dívida técnica consciente"
-- foi dropada pela 20260206120000 e não existe nem em produção nem aqui. Os
-- callers em form-submit e stripe-webhook tentam as duas, em ordem oposta; a
-- tentativa com `case_id` sempre falha em silêncio antes de acertar a certa.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.attempt_dispatch(p_case_id text)
RETURNS TABLE(dispatch_key uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _payment_status TEXT;
  _document_status TEXT;
  _dispatch_key UUID;
  _stripe_session_id TEXT;
BEGIN
  -- Get form submission details
  SELECT fs.document_status, fs.stripe_session_id
  INTO _document_status, _stripe_session_id
  FROM form_submissions fs
  WHERE fs.case_id = p_case_id;

  -- If form doesn't exist, return nothing (empty result set)
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Get payment status from stripe_sessions
  -- Try join by stripe_session_id first (most reliable)
  IF _stripe_session_id IS NOT NULL THEN
    SELECT ss.payment_status
    INTO _payment_status
    FROM stripe_sessions ss
    WHERE ss.id = _stripe_session_id;
  END IF;

  -- Fallback: if no payment_status found, try by case_id
  IF _payment_status IS NULL THEN
    SELECT ss.payment_status
    INTO _payment_status
    FROM stripe_sessions ss
    WHERE ss.case_id = p_case_id;
  END IF;

  -- Payment must be 'paid' AND document status must be 'pending' to dispatch
  IF _payment_status = 'paid' AND _document_status = 'pending' THEN
    -- Create dispatch record with idempotency key
    -- ON CONFLICT ensures idempotency: if case_id already exists, just update timestamp
    INSERT INTO dispatches (case_id, dispatch_key, stripe_session_id, status, created_at)
    VALUES (p_case_id, gen_random_uuid(), _stripe_session_id, 'pending', NOW())
    ON CONFLICT (case_id) DO UPDATE
    SET updated_at = NOW()
    RETURNING dispatches.dispatch_key INTO _dispatch_key;

    -- Return the dispatch_key (either new or existing)
    RETURN QUERY SELECT _dispatch_key;
  ELSE
    -- Preconditions not met: return empty result set (no rows)
    -- This signals to the calling function that dispatch was not attempted
    RETURN;
  END IF;
END;
$$;

-- `confirmed` diz se o UPDATE pegou alguma linha. Até 09/09/2026 esta função
-- devolvia o próprio argumento `success` — ecoava de volta o que o caller já
-- sabia. Chamar com um dispatch_key inexistente respondia "confirmado" e
-- ninguém percebia; o `confirm_dispatch_ok` do Express era sempre verdadeiro.
--
-- Os nomes dos parâmetros colidem com as colunas homônimas, e é por isso que o
-- WHERE é qualificado dos dois lados. Sem a qualificação o Postgres recusa com
-- 'column reference "dispatch_key" is ambiguous' — alto, não em silêncio. Foi
-- essa checagem do Postgres que dispensou renomear os parâmetros e quebrar o
-- contrato da RPC com Express e Edge.
CREATE OR REPLACE FUNCTION public.confirm_dispatch(dispatch_key text, success boolean)
RETURNS TABLE(confirmed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _linhas integer;
BEGIN
  UPDATE public.dispatches
  SET
    status = CASE WHEN success THEN 'sent' ELSE 'failed' END,
    updated_at = NOW()
  WHERE public.dispatches.dispatch_key = confirm_dispatch.dispatch_key;

  GET DIAGNOSTICS _linhas = ROW_COUNT;
  RETURN QUERY SELECT _linhas > 0;
END;
$$;


-- ---------------------------------------------------------------------------
-- Comentários. Os três que descreviam o banco errado foram corrigidos aqui —
-- ver o cabeçalho.
-- ---------------------------------------------------------------------------

COMMENT ON TABLE public.stripe_sessions IS 'Primary source of truth for case_id - created by create-checkout-session function';
COMMENT ON COLUMN public.stripe_sessions.case_id IS 'Origem do case_id, gerado pela Edge create-checkout-session como CASO_<uuid>. form_submissions.case_id e dispatches.case_id referenciam ESTA coluna.';
COMMENT ON COLUMN public.stripe_sessions.payment_status IS 'Status of Stripe payment: pending, paid, cancelled, failed';

COMMENT ON TABLE public.form_submissions IS 'Core table storing all appeal form submissions from drivers contesting traffic violations';
COMMENT ON COLUMN public.form_submissions.case_id IS 'Foreign key reference to stripe_sessions.case_id - created during checkout';
COMMENT ON COLUMN public.form_submissions.renainf IS 'RENAINF identifier for the infraction';
COMMENT ON COLUMN public.form_submissions.data_infracao IS 'Data e HORA da infracao como impressas na notificacao. E timestamp SEM fuso de proposito: e relogio de parede transcrito de um papel, nao um instante. Como timestamptz, a string local que o formulario envia seria lida como UTC e voltaria 3h deslocada em BRT. Quem precisar so do dia usa data_infracao::date -- e o caso do RPC verificar_medidor do radar.';
COMMENT ON COLUMN public.form_submissions.numero_auto IS 'Infraction ticket number';
COMMENT ON COLUMN public.form_submissions.notificacao_penalidade IS 'Penalty notification number';
COMMENT ON COLUMN public.form_submissions.amparo_legal IS 'Legal justification/article cited in appeal';
COMMENT ON COLUMN public.form_submissions.justificativa IS 'User''s detailed justification for the appeal';
COMMENT ON COLUMN public.form_submissions.dup_guard IS 'SHA256 calculado e gravado pela Edge form-submit sobre case_id, form_token, nome, email, telefone, cpf, renainf, cnh, placa (JSON.stringify + SHA-256). O banco NAO recalcula: um trigger que recalculava foi removido em 09/09/2026 porque sobrescrevia o valor da Edge com outra formula e matava a deteccao de duplicata.';
COMMENT ON COLUMN public.form_submissions.stripe_session_id IS 'Id da sessao Stripe, enviado pelo navegador a partir do localStorage. NAO tem FK de proposito: pode chegar antes da linha em stripe_sessions existir.';
COMMENT ON COLUMN public.form_submissions.document_status IS 'Estado do documento: pending, generating, completed, failed. NOT NULL e sem DEFAULT de proposito -- quem insere declara. So a Edge form-submit insere, e so no caminho de INSERT: reescrever esta coluna num UPDATE reabriria um caso em generating e provocaria segundo e-mail ao cliente.';

COMMENT ON TABLE public.dispatches IS 'Manages the dispatch workflow for appeal cases';
COMMENT ON COLUMN public.dispatches.case_id IS 'Foreign key reference to stripe_sessions.case_id';
COMMENT ON COLUMN public.dispatches.status IS 'Current dispatch status in the workflow';

COMMENT ON TABLE public.generated_documents IS 'Metadata for PDFs generated by the pipeline; binaries live in Supabase Storage.';
COMMENT ON COLUMN public.generated_documents.email_to IS 'Snapshot of form_submissions.email at generation time';

COMMENT ON FUNCTION public.attempt_dispatch(p_case_id text) IS 'Attempts to create a dispatch record if payment is paid and form is pending. Returns dispatch_key if successful, empty result set otherwise.';
COMMENT ON FUNCTION public.confirm_dispatch(dispatch_key text, success boolean) IS 'Finaliza o dispatch por dispatch_key. O booleano devolvido (confirmed) diz se alguma linha foi atualizada — NAO e o eco do argumento success.';
