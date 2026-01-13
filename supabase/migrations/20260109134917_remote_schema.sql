drop extension if exists "pg_net";

drop trigger if exists "dispatches_update_updated_at" on "public"."dispatches";

drop trigger if exists "form_submissions_update_updated_at" on "public"."form_submissions";

alter table "public"."dispatches" drop constraint "dispatches_case_id_fkey";

alter table "public"."dispatches" drop constraint "dispatches_case_id_format";

alter table "public"."dispatches" drop constraint "dispatches_case_id_key";

alter table "public"."dispatches" drop constraint "dispatches_status_check";

alter table "public"."form_submissions" drop constraint "form_submissions_case_id_format";

alter table "public"."form_submissions" drop constraint "form_submissions_form_token_key";

alter table "public"."stripe_sessions" drop constraint "stripe_sessions_case_id_format";

alter table "public"."stripe_sessions" drop constraint "stripe_sessions_case_id_key";

alter table "public"."form_submissions" drop constraint "form_submissions_payment_status_check";

drop function if exists "public"."attempt_dispatch"(p_case_id text);

drop function if exists "public"."calculate_dup_guard"(p_placa text, p_numero_auto text, p_cpf text);

drop function if exists "public"."confirm_dispatch"(p_case_id text);

drop index if exists "public"."dispatches_case_id_key";

drop index if exists "public"."form_submissions_form_token_key";

drop index if exists "public"."idx_dispatches_created_at";

drop index if exists "public"."idx_dispatches_status";

drop index if exists "public"."idx_form_submissions_cpf";

drop index if exists "public"."idx_form_submissions_created_at";

drop index if exists "public"."idx_form_submissions_document_status";

drop index if exists "public"."idx_form_submissions_numero_auto";

drop index if exists "public"."idx_form_submissions_placa";

drop index if exists "public"."idx_form_submissions_renainf";

drop index if exists "public"."idx_form_submissions_stripe_session_id";

drop index if exists "public"."idx_stripe_sessions_status";

drop index if exists "public"."stripe_sessions_case_id_key";

drop index if exists "public"."idx_dispatches_case_id";

alter table "public"."dispatches" add column "delivered_at" timestamp with time zone;

alter table "public"."dispatches" add column "dispatch_key" text not null;

alter table "public"."dispatches" add column "payload" jsonb;

alter table "public"."dispatches" add column "stripe_session_id" text;

alter table "public"."form_submissions" add column "renavam" text;

alter table "public"."form_submissions" alter column "data_infracao" set data type date using "data_infracao"::date;

alter table "public"."form_submissions" alter column "document_status" drop not null;

alter table "public"."form_submissions" alter column "payment_status" drop not null;

alter table "public"."stripe_sessions" add column "payment_at" timestamp without time zone;

CREATE UNIQUE INDEX dispatches_dispatch_key_key ON public.dispatches USING btree (dispatch_key);

CREATE INDEX idx_form_submissions_stripe_session ON public.form_submissions USING btree (stripe_session_id);

CREATE UNIQUE INDEX idx_dispatches_case_id ON public.dispatches USING btree (case_id);

alter table "public"."dispatches" add constraint "dispatches_dispatch_key_key" UNIQUE using index "dispatches_dispatch_key_key";

alter table "public"."form_submissions" add constraint "form_submissions_payment_status_check" CHECK ((payment_status = ANY (ARRAY['pending'::text, 'paid'::text, 'failed'::text, 'cancelled'::text]))) not valid;

alter table "public"."form_submissions" validate constraint "form_submissions_payment_status_check";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.attempt_dispatch(case_id uuid)
 RETURNS TABLE(dispatch_key uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.calculate_dup_guard()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.confirm_dispatch(dispatch_key uuid, success boolean)
 RETURNS TABLE(confirmed boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  UPDATE dispatches
  SET 
    status = CASE WHEN success THEN 'sent' ELSE 'failed' END,
    updated_at = NOW()
  WHERE dispatches.dispatch_key = confirm_dispatch.dispatch_key;

  RETURN QUERY SELECT success;
END;
$function$
;

CREATE TRIGGER dispatches_set_updated_at BEFORE UPDATE ON public.dispatches FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER form_submissions_dup_guard_trigger BEFORE INSERT OR UPDATE ON public.form_submissions FOR EACH ROW EXECUTE FUNCTION public.calculate_dup_guard();

CREATE TRIGGER update_form_submissions_updated_at BEFORE UPDATE ON public.form_submissions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


