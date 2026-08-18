-- Fix mismatch between dispatches.dispatch_key (text) and confirm_dispatch argument type.
-- Previous version used confirm_dispatch(dispatch_key uuid, success boolean),
-- which can trigger "operator does not exist: text = uuid".

DROP FUNCTION IF EXISTS public.confirm_dispatch(uuid, boolean);
DROP FUNCTION IF EXISTS public.confirm_dispatch(text, boolean);

CREATE OR REPLACE FUNCTION public.confirm_dispatch(dispatch_key text, success boolean)
 RETURNS TABLE(confirmed boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
  UPDATE public.dispatches
  SET
    status = CASE WHEN success THEN 'sent' ELSE 'failed' END,
    updated_at = NOW()
  WHERE public.dispatches.dispatch_key = confirm_dispatch.dispatch_key;

  RETURN QUERY SELECT success;
END;
$function$
;

COMMENT ON FUNCTION public.confirm_dispatch(text, boolean)
  IS 'Confirms and finalizes dispatch by dispatch_key.';
