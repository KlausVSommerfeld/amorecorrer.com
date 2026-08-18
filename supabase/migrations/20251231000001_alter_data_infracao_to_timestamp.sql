-- Alter data_infracao column from date to timestamp with timezone
-- This allows storing both date and time of the infraction
ALTER TABLE public.form_submissions
ALTER COLUMN data_infracao TYPE timestamp with time zone;
