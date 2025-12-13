-- Create form_submissions table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'form_submissions'
  ) THEN
    CREATE TABLE public.form_submissions (
      id uuid not null default gen_random_uuid (),
      case_id text not null,
      form_token text not null,
      nome text not null,
      email text not null,
      telefone text null,
      cpf text null,
      endereco text null,
      cidade text null,
      estado text null,
      cep text null,
      placa text null,
      renavam text null,
      cnh text null,
      data_infracao date null,
      numero_auto text null,
      local_infracao text null,
      velocidade_permitida integer null,
      velocidade_aferida integer null,
      orgao_autuador text null,
      artigo_ctb text null,
      dup_guard text default ''::text,
      stripe_session_id text null,
      payment_status text not null default 'pending'::text,
      document_status text not null default 'pending'::text,
      document_url text null,
      created_at timestamp with time zone not null default now(),
      updated_at timestamp with time zone not null default now(),
      constraint form_submissions_pkey primary key (id),
      constraint form_submissions_case_id_key unique (case_id),
      constraint form_submissions_document_status_check check (
        (
          document_status = any (
            array[
              'pending'::text,
              'generating'::text,
              'completed'::text,
              'failed'::text
            ]
          )
        )
      ),
      constraint form_submissions_payment_status_check check (
        (
          payment_status = any (
            array[
              'pending'::text,
              'paid'::text,
              'failed'::text,
              'cancelled'::text
            ]
          )
        )
      )
    ) TABLESPACE pg_default;
  END IF;
END;
$$;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_form_submissions_case_id 
  ON public.form_submissions USING btree (case_id) 
  TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_form_submissions_email 
  ON public.form_submissions USING btree (email) 
  TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_form_submissions_stripe_session 
  ON public.form_submissions USING btree (stripe_session_id) 
  TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_form_submissions_payment_status 
  ON public.form_submissions USING btree (payment_status) 
  TABLESPACE pg_default;

-- Create trigger for updated_at
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'update_form_submissions_updated_at'
      AND tgrelid = 'public.form_submissions'::regclass
  ) THEN
    CREATE TRIGGER update_form_submissions_updated_at 
      BEFORE UPDATE ON form_submissions 
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END;
$$;

-- Enable Row Level Security
ALTER TABLE public.form_submissions ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for service role
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' 
      AND tablename = 'form_submissions'
      AND policyname = 'Service role can manage form submissions'
  ) THEN
    CREATE POLICY "Service role can manage form submissions" 
      ON public.form_submissions 
      FOR ALL 
      USING (TRUE) 
      WITH CHECK (TRUE);
  END IF;
END;
$$;

-- Add comment
COMMENT ON TABLE public.form_submissions IS 'Stores form submissions for traffic violation appeals';