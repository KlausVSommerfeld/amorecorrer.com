-- Reverse FK relationship: stripe_sessions.case_id becomes the primary reference
-- This allows create-checkout-session to generate case_id independently

-- Step 1: Drop existing FK constraints that reference form_submissions
ALTER TABLE public.form_submissions DROP CONSTRAINT IF EXISTS form_submissions_stripe_session_id_fkey;
ALTER TABLE public.dispatches DROP CONSTRAINT IF EXISTS dispatches_case_id_fkey;
ALTER TABLE public.stripe_sessions DROP CONSTRAINT IF EXISTS stripe_sessions_case_id_fkey;

-- Step 2: Ensure stripe_sessions.case_id has a named UNIQUE constraint for FK references
DO $$
BEGIN
  -- Check if constraint exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'stripe_sessions' AND constraint_name = 'stripe_sessions_case_id_unique'
  ) THEN
    ALTER TABLE public.stripe_sessions
    ADD CONSTRAINT stripe_sessions_case_id_unique UNIQUE (case_id);
  END IF;
END
$$;

-- Step 3: Add FK in form_submissions to reference stripe_sessions.case_id
ALTER TABLE public.form_submissions
ADD CONSTRAINT form_submissions_case_id_fkey
FOREIGN KEY (case_id) REFERENCES public.stripe_sessions(case_id) ON DELETE CASCADE;

-- Step 4: Add FK in dispatches to reference stripe_sessions.case_id
ALTER TABLE public.dispatches
ADD CONSTRAINT dispatches_case_id_fkey
FOREIGN KEY (case_id) REFERENCES public.stripe_sessions(case_id) ON DELETE CASCADE;

-- Comments
COMMENT ON COLUMN public.form_submissions.case_id IS 'Foreign key reference to stripe_sessions.case_id - created during checkout';
COMMENT ON COLUMN public.dispatches.case_id IS 'Foreign key reference to stripe_sessions.case_id';
COMMENT ON TABLE public.stripe_sessions IS 'Primary source of truth for case_id - created by create-checkout-session function';
