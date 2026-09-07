-- Rollback runbook for migration 20260907082717_harden_staff_rbac.sql
-- Restores previous permissions, policies, triggers, and function definitions.

-- 1. Restore previous table-level privileges on public.profiles
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.profiles TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.profiles TO anon;

-- 2. Drop restrictive insert policy
DROP POLICY IF EXISTS "restrict_profile_insert_to_own_auth" ON public.profiles;

-- 3. Drop auth email synchronization trigger and function
DROP TRIGGER IF EXISTS on_auth_user_email_changed ON auth.users;
DROP FUNCTION IF EXISTS public.handle_user_email_change();

-- 4. Restore original compatibility wrappers
CREATE OR REPLACE FUNCTION public.update_staff_role(target_user_id uuid, new_role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.profiles
  SET role = new_role,
      updated_at = now()
  WHERE id = target_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_staff_role(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_staff_status(
  target_staff_id uuid,
  new_employment_status text,
  new_is_blocked boolean,
  change_note text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM set_config('app.current_change_note', change_note, true);
  UPDATE public.profiles
  SET employment_status = new_employment_status,
      is_blocked = new_is_blocked,
      updated_at = now()
  WHERE id = target_staff_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_staff_status(uuid, text, boolean, text) TO authenticated;

-- 5. Drop new v2 RPCs and authorization helpers
DROP FUNCTION IF EXISTS public.set_staff_archive_state(uuid, boolean, text);
DROP FUNCTION IF EXISTS public.update_staff_status_v2(uuid, text, boolean, text);
DROP FUNCTION IF EXISTS public.update_staff_role_v2(uuid, text);
DROP FUNCTION IF EXISTS public.can_manage_staff();

-- 6. Restore original is_device_approved search path
CREATE OR REPLACE FUNCTION public.is_device_approved()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
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
$$;

GRANT EXECUTE ON FUNCTION public.is_device_approved() TO authenticated;
