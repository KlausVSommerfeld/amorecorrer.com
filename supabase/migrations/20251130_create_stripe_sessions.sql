-- Create stripe_sessions table for persisting checkout sessions
-- Mirrors the definition created in Supabase Studio
-- This table stores the relationship between Stripe sessions and case_id for tracking

CREATE TABLE public.stripe_sessions (
  id TEXT NOT NULL,
  case_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'created'::TEXT,
  url TEXT NULL,
  metadata JSONB NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT stripe_sessions_pkey PRIMARY KEY (id)
) TABLESPACE pg_default;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_stripe_sessions_case_id 
  ON public.stripe_sessions USING BTREE (case_id) 
  TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_stripe_sessions_created_at 
  ON public.stripe_sessions USING BTREE (created_at) 
  TABLESPACE pg_default;

-- Enable RLS (Row Level Security) for security
ALTER TABLE public.stripe_sessions ENABLE ROW LEVEL SECURITY;

-- Create policy allowing service role to insert/select/update
CREATE POLICY "Service role can manage stripe sessions" 
  ON public.stripe_sessions
  FOR ALL
  USING (TRUE)
  WITH CHECK (TRUE);

-- Add comment
COMMENT ON TABLE public.stripe_sessions IS 'Stores Stripe checkout sessions linked to appeal cases';
