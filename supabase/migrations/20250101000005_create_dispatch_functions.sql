-- Create dispatch workflow functions

-- Function to calculate duplicate guard value
CREATE OR REPLACE FUNCTION calculate_dup_guard(
  p_placa text,
  p_numero_auto text,
  p_cpf text
)
RETURNS text AS $$
BEGIN
  RETURN MD5(COALESCE(p_placa, '') || COALESCE(p_numero_auto, '') || COALESCE(p_cpf, ''));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to attempt dispatch
CREATE OR REPLACE FUNCTION attempt_dispatch(
  p_case_id text
)
RETURNS table(success boolean, message text) AS $$
DECLARE
  v_submission form_submissions;
  v_dispatch dispatches;
BEGIN
  -- Get the submission
  SELECT * INTO v_submission FROM public.form_submissions 
  WHERE case_id = p_case_id LIMIT 1;
  
  IF v_submission IS NULL THEN
    RETURN QUERY SELECT false, 'Case not found'::text;
    RETURN;
  END IF;

  -- Check if dispatch exists and is completed
  SELECT * INTO v_dispatch FROM public.dispatches 
  WHERE case_id = p_case_id LIMIT 1;

  IF v_dispatch.status = 'completed' THEN
    RETURN QUERY SELECT false, 'Dispatch already completed'::text;
    RETURN;
  END IF;

  -- Check payment status
  IF v_submission.payment_status != 'completed' THEN
    RETURN QUERY SELECT false, 'Payment not completed'::text;
    RETURN;
  END IF;

  -- Update dispatch status
  UPDATE public.dispatches 
  SET status = 'in_progress', updated_at = NOW()
  WHERE case_id = p_case_id;

  RETURN QUERY SELECT true, 'Dispatch started'::text;
END;
$$ LANGUAGE plpgsql;

-- Function to confirm dispatch
CREATE OR REPLACE FUNCTION confirm_dispatch(
  p_case_id text
)
RETURNS table(success boolean, message text) AS $$
BEGIN
  UPDATE public.dispatches 
  SET status = 'completed', updated_at = NOW()
  WHERE case_id = p_case_id;

  RETURN QUERY SELECT true, 'Dispatch confirmed'::text;
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON FUNCTION calculate_dup_guard(text, text, text) IS 'Calculates a hash for duplicate detection';
COMMENT ON FUNCTION attempt_dispatch(text) IS 'Attempts to start a dispatch workflow';
COMMENT ON FUNCTION confirm_dispatch(text) IS 'Confirms and completes a dispatch';
