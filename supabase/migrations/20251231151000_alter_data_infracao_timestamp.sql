-- Store date + time for infraction
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'form_submissions'
      AND column_name = 'data_infracao'
      AND data_type = 'date'
  ) THEN
    ALTER TABLE public.form_submissions
      ALTER COLUMN data_infracao TYPE timestamp without time zone
      USING data_infracao::timestamp;
  END IF;
END $$;
