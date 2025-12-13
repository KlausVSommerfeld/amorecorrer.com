-- Create trigger function to calculate dup_guard automatically
-- This ensures idempotency protection without requiring the Edge Function to pre-calculate
CREATE OR REPLACE FUNCTION calculate_dup_guard()
RETURNS TRIGGER AS $$
BEGIN
  -- Calculate dup_guard as SHA256 hash of key identifying fields
  -- This matches the logic in form-submit edge function
  NEW.dup_guard := encode(
    digest(
      json_build_object(
        'case_id', NEW.case_id,
        'form_token', NEW.form_token,
        'nome', NEW.nome,
        'email', LOWER(COALESCE(NEW.email, '')),
        'telefone', COALESCE(
          regexp_replace(COALESCE(NEW.telefone, ''), '\D', '', 'g'),
          ''
        ),
        'cpf', COALESCE(
          regexp_replace(COALESCE(NEW.cpf, ''), '\D', '', 'g'),
          ''
        )
      )::text,
      'sha256'
    ),
    'hex'
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to form_submissions table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'form_submissions_dup_guard_trigger'
      AND tgrelid = 'public.form_submissions'::regclass
  ) THEN
    CREATE TRIGGER form_submissions_dup_guard_trigger
    BEFORE INSERT OR UPDATE ON public.form_submissions
    FOR EACH ROW EXECUTE FUNCTION calculate_dup_guard();
  END IF;
END;
$$;
