-- Create dispatch tables for managing case dispatch workflow

CREATE TABLE public.dispatches (
  id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamp with time zone NOT NULL DEFAULT NOW(),
  updated_at timestamp with time zone NOT NULL DEFAULT NOW(),

  CONSTRAINT dispatches_case_id_format CHECK (case_id ~ '^CASO_'),
  CONSTRAINT dispatches_status_check CHECK (
    status = ANY(ARRAY['pending', 'in_progress', 'completed', 'failed'])
  ),
  FOREIGN KEY (case_id) REFERENCES public.form_submissions(case_id) ON DELETE CASCADE
);

-- Create indexes
CREATE INDEX idx_dispatches_case_id ON public.dispatches(case_id);
CREATE INDEX idx_dispatches_status ON public.dispatches(status);
CREATE INDEX idx_dispatches_created_at ON public.dispatches(created_at);

-- Enable RLS
ALTER TABLE public.dispatches ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Service role can manage dispatches
CREATE POLICY "Service role can manage dispatches"
  ON public.dispatches FOR ALL USING (TRUE) WITH CHECK (TRUE);

-- Trigger for updated_at
CREATE TRIGGER dispatches_update_updated_at
  BEFORE UPDATE ON public.dispatches
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE public.dispatches IS 'Manages the dispatch workflow for appeal cases';
COMMENT ON COLUMN public.dispatches.status IS 'Current dispatch status in the workflow';
