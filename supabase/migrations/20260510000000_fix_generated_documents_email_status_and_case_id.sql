ALTER TABLE public.generated_documents
  DROP CONSTRAINT IF EXISTS generated_documents_case_id_format;

ALTER TABLE public.generated_documents
  ADD CONSTRAINT generated_documents_case_id_format
  CHECK (
    case_id ~ '^CASO_[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    OR case_id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  );

ALTER TABLE public.generated_documents
  DROP CONSTRAINT IF EXISTS generated_documents_status_check;

ALTER TABLE public.generated_documents
  ADD CONSTRAINT generated_documents_status_check
  CHECK (
    status = ANY (
      ARRAY[
        'generated'::text,
        'emailed'::text,
        'email_failed'::text,
        'email_skipped'::text
      ]
    )
  );
