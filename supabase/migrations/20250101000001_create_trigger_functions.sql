-- Create trigger functions
-- These are used across multiple tables for timestamp management

-- Function for updating the updated_at column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function for setting updated_at (alias for compatibility)
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to generate unique case IDs
CREATE OR REPLACE FUNCTION generate_case_id()
RETURNS TEXT AS $$
DECLARE
  new_id TEXT;
  counter INT;
BEGIN
  counter := 0;
  LOOP
    new_id := 'CASO_' || TO_CHAR(NOW(), 'YYYYMMDD') || '_' || LPAD((RANDOM() * 9999)::INT::TEXT, 4, '0');
    IF NOT EXISTS (SELECT 1 FROM public.form_submissions WHERE case_id = new_id) THEN
      RETURN new_id;
    END IF;
    counter := counter + 1;
    IF counter > 100 THEN
      RAISE EXCEPTION 'Failed to generate unique case_id after 100 attempts';
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;
