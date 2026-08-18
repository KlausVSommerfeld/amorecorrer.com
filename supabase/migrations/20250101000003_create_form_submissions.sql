-- Create form_submissions table
-- Core table for storing appeal form data

CREATE TABLE public.form_submissions (
  -- Identifiers
  id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id text NOT NULL UNIQUE,
  form_token text NOT NULL UNIQUE,

  -- Personal Information
  nome text NOT NULL,
  email text NOT NULL,
  telefone text,
  cpf text,
  endereco text,
  cidade text,
  estado text,
  cep text,

  -- Vehicle Information
  placa text,
  renainf text,
  cnh text,

  -- Infraction Details
  data_infracao date,
  numero_auto text,
  notificacao_penalidade text,
  local_infracao text,
  velocidade_permitida integer,
  velocidade_aferida integer,
  orgao_autuador text,
  artigo_ctb text,
  descricao_infracao text,
  amparo_legal text,

  -- Document Information
  especie_documento text,
  marca_modelo_especie text,
  expedida_em text,

  -- User Justification
  justificativa text,

  -- System Fields
  dup_guard text DEFAULT '',
  stripe_session_id text REFERENCES public.stripe_sessions(id),
  document_status text NOT NULL DEFAULT 'pending',
  document_url text,
  created_at timestamp with time zone NOT NULL DEFAULT NOW(),
  updated_at timestamp with time zone NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT form_submissions_case_id_format CHECK (case_id ~ '^CASO_'),
  CONSTRAINT form_submissions_document_status_check CHECK (
    document_status = ANY(ARRAY['pending', 'generating', 'completed', 'failed'])
  )
);

-- Create indexes
CREATE INDEX idx_form_submissions_case_id ON public.form_submissions(case_id);
CREATE INDEX idx_form_submissions_email ON public.form_submissions(email);
CREATE INDEX idx_form_submissions_cpf ON public.form_submissions(cpf);
CREATE INDEX idx_form_submissions_placa ON public.form_submissions(placa);
CREATE INDEX idx_form_submissions_numero_auto ON public.form_submissions(numero_auto);
CREATE INDEX idx_form_submissions_renainf ON public.form_submissions(renainf);
CREATE INDEX idx_form_submissions_created_at ON public.form_submissions(created_at);
CREATE INDEX idx_form_submissions_document_status ON public.form_submissions(document_status);
CREATE INDEX idx_form_submissions_stripe_session_id ON public.form_submissions(stripe_session_id);

-- Enable RLS
ALTER TABLE public.form_submissions ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Service role can manage form submissions
CREATE POLICY "Service role can manage form submissions"
  ON public.form_submissions FOR ALL USING (TRUE) WITH CHECK (TRUE);

-- Trigger for updated_at
CREATE TRIGGER form_submissions_update_updated_at
  BEFORE UPDATE ON public.form_submissions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE public.form_submissions IS 'Core table storing all appeal form submissions from drivers contesting traffic violations';
COMMENT ON COLUMN public.form_submissions.dup_guard IS 'SHA256 hash for duplicate detection based on case_id, form_token, nome, email, telefone, cpf, renavam, cnh, placa';
COMMENT ON COLUMN public.form_submissions.stripe_session_id IS 'Foreign key reference to stripe_sessions.id';
COMMENT ON COLUMN public.form_submissions.document_status IS 'Status of generated document: pending, generating, completed, failed';
COMMENT ON COLUMN public.form_submissions.numero_auto IS 'Infraction ticket number';
COMMENT ON COLUMN public.form_submissions.notificacao_penalidade IS 'Penalty notification number';
COMMENT ON COLUMN public.form_submissions.renainf IS 'RENAINF identifier for the infraction';
COMMENT ON COLUMN public.form_submissions.amparo_legal IS 'Legal justification/article cited in appeal';
COMMENT ON COLUMN public.form_submissions.justificativa IS 'User''s detailed justification for the appeal';
