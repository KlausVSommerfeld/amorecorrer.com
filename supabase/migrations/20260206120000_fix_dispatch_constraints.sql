-- Fix dispatch workflow constraints and RPC
-- Restores UNIQUE constraint on dispatches.case_id to allow ON CONFLICT logic
-- Fixes attempt_dispatch RPC to properly join stripe_sessions by case_id

-- Step 1: Ensure dispatches has UNIQUE constraint on case_id (required for ON CONFLICT)
DO $$
BEGIN
  -- Add UNIQUE constraint if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'dispatches' 
    AND constraint_name = 'dispatches_case_id_unique'
    AND constraint_type = 'UNIQUE'
  ) THEN
    ALTER TABLE public.dispatches
    ADD CONSTRAINT dispatches_case_id_unique UNIQUE (case_id);
  END IF;
END
$$;

-- Step 2: Drop and recreate the attempt_dispatch function with corrected logic
DROP FUNCTION IF EXISTS public.attempt_dispatch(case_id text);

CREATE OR REPLACE FUNCTION public.attempt_dispatch(p_case_id text)
 RETURNS TABLE(dispatch_key uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
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
$function$
;

-- Comments
COMMENT ON FUNCTION public.attempt_dispatch(p_case_id text) IS 'Attempts to create a dispatch record if payment is paid and form is pending. Returns dispatch_key if successful, empty result set otherwise.';
