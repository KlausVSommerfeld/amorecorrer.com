DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'stripe_sessions'
  ) THEN
    CREATE TABLE public.stripe_sessions (
      id TEXT NOT NULL,
      case_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'created'::TEXT,
      url TEXT NULL,
      metadata JSONB NULL,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      CONSTRAINT stripe_sessions_pkey PRIMARY KEY (id)
    ) TABLESPACE pg_default;
  END IF;
END;
$$;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_stripe_sessions_case_id 
  ON public.stripe_sessions USING BTREE (case_id) 
  TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_stripe_sessions_created_at 
  ON public.stripe_sessions USING BTREE (created_at) 
  TABLESPACE pg_default;

ALTER TABLE public.stripe_sessions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'stripe_sessions'
      AND policyname = 'Service role can manage stripe sessions'
  ) THEN
    CREATE POLICY "Service role can manage stripe sessions"
      ON public.stripe_sessions FOR ALL USING (TRUE) WITH CHECK (TRUE);
  END IF;
END;
$$;

COMMENT ON TABLE public.stripe_sessions IS 'Stores Stripe checkout sessions linked to appeal cases';
