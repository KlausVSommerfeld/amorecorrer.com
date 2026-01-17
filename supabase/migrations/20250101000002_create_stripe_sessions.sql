-- Create stripe_sessions table
-- Stores Stripe checkout sessions linked to appeal cases

CREATE TABLE public.stripe_sessions (
  id TEXT NOT NULL PRIMARY KEY,
  case_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'created',
  payment_status TEXT NOT NULL DEFAULT 'pending',
  url TEXT,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT stripe_sessions_case_id_format CHECK (case_id ~ '^CASO_'),
  CONSTRAINT stripe_sessions_case_id_unique UNIQUE (case_id),
  CONSTRAINT stripe_sessions_payment_status_check CHECK (
    payment_status = ANY(ARRAY['pending', 'completed', 'failed', 'refunded'])
  )
);

-- Create indexes for common queries
CREATE INDEX idx_stripe_sessions_case_id ON public.stripe_sessions(case_id);
CREATE INDEX idx_stripe_sessions_created_at ON public.stripe_sessions(created_at);
CREATE INDEX idx_stripe_sessions_status ON public.stripe_sessions(status);
CREATE INDEX idx_stripe_sessions_payment_status ON public.stripe_sessions(payment_status);

-- Enable RLS
ALTER TABLE public.stripe_sessions ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Service role can manage stripe sessions
CREATE POLICY "Service role can manage stripe sessions"
  ON public.stripe_sessions FOR ALL USING (TRUE) WITH CHECK (TRUE);

-- Comments
COMMENT ON TABLE public.stripe_sessions IS 'Stores Stripe checkout sessions linked to appeal cases';
COMMENT ON COLUMN public.stripe_sessions.case_id IS 'Foreign reference to form_submissions.case_id';
COMMENT ON COLUMN public.stripe_sessions.payment_status IS 'Status of Stripe payment: pending, completed, failed, refunded';
