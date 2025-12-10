-- RPC Function: attempt_dispatch
-- Called by form-submit edge function to check if both payment and form are ready
-- Returns: dispatch_key (UUID) if case is ready for dispatch, NULL otherwise

CREATE OR REPLACE FUNCTION attempt_dispatch(case_id UUID)
RETURNS TABLE(dispatch_key UUID) AS $$
DECLARE
  _payment_status TEXT;
  _document_status TEXT;
  _dispatch_key UUID;
BEGIN
  -- Check if both payment and form are complete
  SELECT payment_status, document_status
  INTO _payment_status, _document_status
  FROM form_submissions
  WHERE form_submissions.case_id = attempt_dispatch.case_id;

  -- If form doesn't exist, return null
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Both must be "completed" or "approved" to dispatch
  IF _payment_status = 'paid' AND _document_status = 'completed' THEN
    -- Create dispatch record with idempotency key
    INSERT INTO dispatches (case_id, dispatch_key, status, created_at)
    VALUES (case_id, gen_random_uuid(), 'pending', NOW())
    ON CONFLICT (case_id) DO UPDATE
    SET updated_at = NOW()
    RETURNING dispatch_key INTO _dispatch_key;

    RETURN QUERY SELECT _dispatch_key;
  ELSE
    RETURN;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC Function: confirm_dispatch
-- Called by form-submit edge function after sending webhook to n8n
-- Updates dispatch record with success/failure status

CREATE OR REPLACE FUNCTION confirm_dispatch(dispatch_key UUID, success BOOLEAN)
RETURNS TABLE(confirmed BOOLEAN) AS $$
BEGIN
  UPDATE dispatches
  SET 
    status = CASE WHEN success THEN 'sent' ELSE 'failed' END,
    updated_at = NOW()
  WHERE dispatches.dispatch_key = confirm_dispatch.dispatch_key;

  RETURN QUERY SELECT success;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
