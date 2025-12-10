-- Fix: Make dup_guard nullable with default empty string
-- This allows REST API insertions without requiring dup_guard calculation

ALTER TABLE public.form_submissions 
ALTER COLUMN dup_guard SET DEFAULT '';

-- Update existing NULL values to empty string
UPDATE public.form_submissions 
SET dup_guard = '' 
WHERE dup_guard IS NULL;
