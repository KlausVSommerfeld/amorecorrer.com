-- Create dispatches table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'dispatches'
  ) THEN
    CREATE TABLE public.dispatches (
      id uuid not null default gen_random_uuid (),
      case_id text not null,
      stripe_session_id text null,
      dispatch_key text not null,
      status text not null default 'pending'::text,
      payload jsonb null,
      delivered_at timestamp with time zone null,
      created_at timestamp with time zone not null default now(),
      updated_at timestamp with time zone not null default now(),
      constraint dispatches_pkey primary key (id),
      constraint dispatches_dispatch_key_key unique (dispatch_key)
    ) TABLESPACE pg_default;
  END IF;
END;
$$;

-- Create indexes
create unique INDEX IF not exists idx_dispatches_case_id on public.dispatches using btree (case_id) TABLESPACE pg_default;

-- Create trigger for updated_at
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'dispatches_set_updated_at'
      AND tgrelid = 'public.dispatches'::regclass
  ) THEN
    create trigger dispatches_set_updated_at BEFORE
    update on dispatches for EACH row
    execute FUNCTION update_updated_at_column ();
  END IF;
END;
$$;

-- Enable Row Level Security
ALTER TABLE public.dispatches ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for service role
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'dispatches'
      AND policyname = 'Service role can manage dispatches'
  ) THEN
    CREATE POLICY "Service role can manage dispatches" ON public.dispatches FOR ALL USING (TRUE) WITH CHECK (TRUE);
  END IF;
END;
$$;
