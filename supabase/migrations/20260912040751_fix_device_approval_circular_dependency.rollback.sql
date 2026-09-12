-- Rollback for 20260912040751_fix_device_approval_circular_dependency.sql
-- Restores the pre-fix shape. Does not restore the circular RLS bug's
-- session_id-based is_device_approved() body verbatim -- that version was
-- never in a migration to begin with (it was live-only), so this restores
-- the table/policy shape and leaves is_device_approved() pointed at the
-- (still broken) session_id check only if you truly need to revert.

DROP FUNCTION IF EXISTS public.admin_prune_devices(TIMESTAMP WITH TIME ZONE);
DROP FUNCTION IF EXISTS public.admin_manage_device(UUID, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.register_device(TEXT, TEXT);

DROP POLICY IF EXISTS "Devices self or admin view" ON public.devices;
CREATE POLICY "Devices staff view" ON public.devices FOR SELECT
  USING (public.is_staff_or_admin());

CREATE OR REPLACE FUNCTION public.is_device_approved()
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_session_id uuid;
BEGIN
  v_session_id := (current_setting('request.jwt.claims', true)::jsonb ->> 'session_id')::uuid;
  IF v_session_id IS NULL THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.devices
    WHERE session_id = v_session_id
      AND status = 'approved'
  );
END;
$function$;

DROP INDEX IF EXISTS idx_devices_user_fingerprint;
DROP INDEX IF EXISTS idx_devices_user_id;
DROP INDEX IF EXISTS idx_devices_fingerprint;

ALTER TABLE public.devices DROP CONSTRAINT IF EXISTS devices_pkey;
ALTER TABLE public.devices ADD PRIMARY KEY (fingerprint);
ALTER TABLE public.devices DROP COLUMN IF EXISTS id;
ALTER TABLE public.devices DROP COLUMN IF EXISTS user_id;
