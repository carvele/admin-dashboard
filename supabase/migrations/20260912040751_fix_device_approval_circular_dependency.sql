-- Fixes the device-approval workflow, which has never actually worked:
--
-- ROOT CAUSE (confirmed live): is_staff_or_admin() -- which gates 64 RLS
-- policies across this database, not just `devices` -- requires
-- is_device_approved() to pass for any non-owner. is_device_approved()
-- checks devices.session_id against the caller's JWT session_id claim, but
-- no code anywhere (frontend, edge functions, or this migration history)
-- ever writes to devices.session_id. It is permanently NULL, so
-- is_device_approved() is permanently false, so a staff member can never
-- even SELECT their own devices row to learn its status -- the RLS-filtered
-- read comes back empty and the frontend renders that as "still pending",
-- regardless of what an admin actually approved. This is a circular
-- dependency: reading your own approval status requires already being
-- approved.
--
-- SECONDARY BUG: `devices` is keyed by `fingerprint` alone (global PK), and
-- that fingerprint comes from a browser-fingerprinting library with no
-- guaranteed cross-session stability -- confirmed live: every device row
-- ever recorded (26/26) has a distinct fingerprint, and all 26 share one
-- staff_email regardless of which account actually logged in, because two
-- different accounts on the same browser collide onto the same row (a
-- fingerprint-only PK cannot represent "two accounts, one browser").
--
-- This migration is additive/non-destructive -- it does not delete the 26
-- existing rows, it just stops them being reachable as anyone's *current*
-- device (they have no user_id, so they no longer match any real caller).
-- An admin can clear them later via the existing "Prune Inactive Devices"
-- action if desired.
--
-- Fixes: (1) rescopes device identity to (user_id, fingerprint) via a
-- surrogate PK, so different accounts on one browser no longer collide,
-- (2) fixes is_device_approved() to check something actually populated,
-- (3) breaks the circular RLS dependency so a user can always read their
-- own device rows, (4) moves every write behind audited, ownership-checked
-- RPCs (direct writes from the client can't work anyway -- `authenticated`
-- has no UPDATE/DELETE grant on this table), and (5) adds register_device
-- as the one real registration path, replacing an edge function with no
-- source in this repo and a duplicate client-side helper.

-- ---------------------------------------------------------------------
-- 1. Rescope identity: surrogate PK + (user_id, fingerprint) as the real
--    identity, instead of fingerprint alone.
-- ---------------------------------------------------------------------
ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();
ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE;

UPDATE public.devices SET id = gen_random_uuid() WHERE id IS NULL;
ALTER TABLE public.devices ALTER COLUMN id SET NOT NULL;

ALTER TABLE public.devices DROP CONSTRAINT IF EXISTS devices_pkey;
ALTER TABLE public.devices ADD PRIMARY KEY (id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_devices_user_fingerprint
  ON public.devices(user_id, fingerprint) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_devices_user_id ON public.devices(user_id);
CREATE INDEX IF NOT EXISTS idx_devices_fingerprint ON public.devices(fingerprint);

-- ---------------------------------------------------------------------
-- 2. Fix is_device_approved(): check the user's own approved-device rows,
--    not the never-populated session_id.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_device_approved()
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.devices
    WHERE user_id = auth.uid() AND status = 'approved'
  );
END;
$function$;

-- ---------------------------------------------------------------------
-- 3. Break the circular RLS dependency: a user can always read their own
--    device rows (that's how they discover pending vs approved), separate
--    from is_staff_or_admin()'s broader device-gated logic. Admin/owner
--    keep full visibility for the Device Management page.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Devices staff view" ON public.devices;
CREATE POLICY "Devices self or admin view" ON public.devices FOR SELECT
  USING (user_id = auth.uid() OR public.is_admin_or_owner());

-- Drop any direct-write policy -- every mutation now goes through the
-- SECURITY DEFINER RPCs below, each with its own explicit authorization
-- check and audit log entry, rather than a blanket RLS grant.
DROP POLICY IF EXISTS "Admin or owner can manage devices" ON public.devices;
DROP POLICY IF EXISTS "Owner or owner can manage devices" ON public.devices;

-- ---------------------------------------------------------------------
-- 4. register_device: the one real registration/heartbeat path. Replaces
--    the `register-device` edge function (invoked from the frontend but
--    with no source in this repo) and staffService.js's unused duplicate.
--    Idempotent per (user_id, fingerprint): first call creates a pending
--    row (auto-approved for owners, who bypass this check anyway); repeat
--    calls just touch last_seen/login_history and never regress status.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.register_device(_fingerprint TEXT, _user_agent TEXT DEFAULT NULL)
RETURNS public.devices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user UUID := auth.uid();
  v_email TEXT;
  v_name TEXT;
  v_role TEXT;
  v_row public.devices%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.';
  END IF;
  IF NULLIF(trim(_fingerprint), '') IS NULL THEN
    RAISE EXCEPTION 'Missing device identifier.';
  END IF;

  SELECT email, COALESCE(NULLIF(trim(concat_ws(' ', first_name, last_name)), ''), email), role
  INTO v_email, v_name, v_role
  FROM public.profiles WHERE id = v_user;

  INSERT INTO public.devices (
    fingerprint, user_id, status, user_agent, staff_email, staff_name,
    last_seen, failed_attempts, login_history
  )
  VALUES (
    _fingerprint, v_user,
    CASE WHEN v_role = 'owner' THEN 'approved' ELSE 'pending' END,
    _user_agent, v_email, v_name,
    now(), 0, jsonb_build_array(jsonb_build_object('email', v_email, 'time', now()))
  )
  ON CONFLICT (user_id, fingerprint) WHERE user_id IS NOT NULL DO UPDATE
    SET last_seen = now(),
        updated_at = now(),
        user_agent = COALESCE(EXCLUDED.user_agent, public.devices.user_agent),
        staff_email = v_email,
        staff_name = v_name,
        login_history = (
          COALESCE(public.devices.login_history, '[]'::jsonb)
          || jsonb_build_array(jsonb_build_object('email', v_email, 'time', now()))
        )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$;

REVOKE ALL ON FUNCTION public.register_device(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_device(TEXT, TEXT) TO authenticated;

-- ---------------------------------------------------------------------
-- 5. admin_manage_device: re-scoped to (user_id, fingerprint) so it targets
--    an unambiguous row now that fingerprint alone isn't unique. Same
--    authorization + audit-log shape as before, now version-controlled
--    (it previously existed only live, never in a migration).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_manage_device(_user_id UUID, _fingerprint TEXT, _action TEXT, _value TEXT DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor UUID := auth.uid();
  v_actor_name TEXT;
  v_device public.devices%ROWTYPE;
BEGIN
  IF v_actor IS NULL OR NOT public.is_admin_or_owner() THEN
    RAISE EXCEPTION 'Only administrators can manage devices.';
  END IF;

  SELECT * INTO v_device
  FROM public.devices
  WHERE user_id = _user_id AND fingerprint = _fingerprint
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Device not found.'; END IF;

  SELECT COALESCE(NULLIF(trim(concat_ws(' ', first_name, last_name)), ''), 'Administrator')
  INTO v_actor_name
  FROM public.profiles
  WHERE id = v_actor;

  CASE _action
    WHEN 'approve' THEN
      UPDATE public.devices SET status = 'approved', updated_at = now() WHERE user_id = _user_id AND fingerprint = _fingerprint;
    WHEN 'revoke' THEN
      UPDATE public.devices SET status = 'revoked', updated_at = now() WHERE user_id = _user_id AND fingerprint = _fingerprint;
    WHEN 'rename' THEN
      IF NULLIF(trim(_value), '') IS NULL THEN RAISE EXCEPTION 'Device name cannot be empty.'; END IF;
      UPDATE public.devices SET name = left(trim(_value), 200), updated_at = now() WHERE user_id = _user_id AND fingerprint = _fingerprint;
    WHEN 'delete' THEN
      DELETE FROM public.devices WHERE user_id = _user_id AND fingerprint = _fingerprint;
    ELSE
      RAISE EXCEPTION 'Unsupported device action.';
  END CASE;

  INSERT INTO public.logs (user_id, user_name, action, target_type, target_id, details)
  VALUES (
    v_actor,
    COALESCE(v_actor_name, 'Administrator'),
    initcap(_action) || 'd registered device',
    'device',
    _fingerprint,
    jsonb_strip_nulls(jsonb_build_object(
      'target_user_id', _user_id,
      'previous_status', v_device.status,
      'new_status', CASE _action WHEN 'approve' THEN 'approved' WHEN 'revoke' THEN 'revoked' END,
      'previous_name', CASE WHEN _action = 'rename' THEN v_device.name END,
      'new_name', CASE WHEN _action = 'rename' THEN left(trim(_value), 200) END
    ))
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_manage_device(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_manage_device(UUID, TEXT, TEXT, TEXT) TO authenticated;

-- admin_prune_devices needs no signature change (it deletes by status/
-- last_seen, not by identity), but version-control it too since it
-- previously existed only live.
CREATE OR REPLACE FUNCTION public.admin_prune_devices(_cutoff TIMESTAMP WITH TIME ZONE)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor UUID := auth.uid();
  v_actor_name TEXT;
  v_deleted integer;
BEGIN
  IF v_actor IS NULL OR NOT public.is_admin_or_owner() THEN
    RAISE EXCEPTION 'Only administrators can prune devices.';
  END IF;

  DELETE FROM public.devices
  WHERE status = 'revoked'
     OR (status <> 'approved' AND last_seen < _cutoff)
     OR user_id IS NULL;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  SELECT COALESCE(NULLIF(trim(concat_ws(' ', first_name, last_name)), ''), 'Administrator')
  INTO v_actor_name
  FROM public.profiles
  WHERE id = v_actor;

  INSERT INTO public.logs (user_id, user_name, action, target_type, details)
  VALUES (
    v_actor,
    COALESCE(v_actor_name, 'Administrator'),
    'Pruned inactive registered devices',
    'device',
    jsonb_build_object('cutoff', _cutoff, 'deleted_count', v_deleted)
  );

  RETURN v_deleted;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_prune_devices(TIMESTAMP WITH TIME ZONE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_prune_devices(TIMESTAMP WITH TIME ZONE) TO authenticated;

-- ---------------------------------------------------------------------
-- 6. Drop the orphaned approve_device() trigger function: defined in an
--    earlier migration, never attached to any trigger, dead code that
--    would have silently auto-approved every device had it ever been
--    wired up.
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.approve_device();
