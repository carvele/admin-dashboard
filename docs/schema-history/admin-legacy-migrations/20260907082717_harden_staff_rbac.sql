-- Harden profiles table privileges, staff RBAC functions, and auth email synchronization

-- 1. Table and column privileges on public.profiles
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.profiles FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.profiles FROM authenticated;

GRANT UPDATE (
  first_name, last_name, username, phone, gender, date_of_birth,
  address_line, barangay, city, province, zip_code,
  fit_preference, is_wardrobe_shared, wardrobe_privacy,
  wishlist_privacy, outfit_privacy, profile_visibility,
  expo_push_token, updated_at,
  is_blocked, deleted
) ON TABLE public.profiles TO authenticated;

GRANT INSERT (
  id, email, updated_at,
  first_name, last_name, username, phone, gender, date_of_birth,
  address_line, barangay, city, province, zip_code,
  fit_preference, is_wardrobe_shared, wardrobe_privacy,
  wishlist_privacy, outfit_privacy, profile_visibility,
  expo_push_token
) ON TABLE public.profiles TO authenticated;

-- 2. Restrictive insert policy enforcing own-id and jwt email claim
DROP POLICY IF EXISTS "restrict_profile_insert_to_own_auth" ON public.profiles;
CREATE POLICY "restrict_profile_insert_to_own_auth"
ON public.profiles
AS RESTRICTIVE
FOR INSERT
TO authenticated
WITH CHECK (
  id = auth.uid()
  AND email = (auth.jwt() ->> 'email')
);

-- 3. Device approval helper hardened with empty search path
CREATE OR REPLACE FUNCTION public.is_device_approved()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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

REVOKE ALL ON FUNCTION public.is_device_approved() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_device_approved() TO authenticated;

-- 4. Canonical staff management authorization check
CREATE OR REPLACE FUNCTION public.can_manage_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles AS p
    WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'owner')
      AND p.deleted = false
      AND p.is_blocked = false
      AND p.employment_status = 'active'
      AND (
        p.role = 'owner'
        OR public.is_device_approved()
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_manage_staff() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_staff() TO authenticated;

-- 5. Hardened status management RPC
CREATE OR REPLACE FUNCTION public.update_staff_status_v2(
  target_user_id uuid,
  employment_status text,
  is_blocked boolean,
  change_note text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_new_employment_status text := employment_status;
  v_new_is_blocked boolean := is_blocked;
  v_target record;
  v_active_count integer;
BEGIN
  IF NOT public.can_manage_staff() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'target_user_id cannot be null';
  END IF;

  IF v_new_employment_status IS NULL OR v_new_employment_status NOT IN ('active', 'on_leave', 'resigned', 'terminated') THEN
    RAISE EXCEPTION 'Invalid employment_status value';
  END IF;

  IF v_new_is_blocked IS NULL THEN
    RAISE EXCEPTION 'is_blocked cannot be null';
  END IF;

  IF change_note IS NULL OR trim(change_note) = '' OR length(trim(change_note)) > 500 THEN
    RAISE EXCEPTION 'change_note must be between 1 and 500 characters';
  END IF;

  SELECT * INTO v_target
  FROM public.profiles
  WHERE id = target_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target user not found';
  END IF;

  IF v_target.role NOT IN ('staff', 'admin') THEN
    RAISE EXCEPTION 'Target user is not a staff member or administrator';
  END IF;

  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot modify your own status';
  END IF;

  IF v_target.role = 'owner' THEN
    RAISE EXCEPTION 'Cannot modify owner account status';
  END IF;

  IF v_target.deleted IS NOT FALSE THEN
    RAISE EXCEPTION 'Cannot update status of an archived staff member';
  END IF;

  IF v_target.employment_status = 'resigned' AND v_new_employment_status <> 'resigned' THEN
    RAISE EXCEPTION 'Cannot change employment status of a resigned staff member';
  END IF;

  IF v_target.employment_status = 'terminated' AND v_new_employment_status <> 'terminated' THEN
    RAISE EXCEPTION 'Cannot change employment status of a terminated staff member';
  END IF;

  IF v_target.employment_status = v_new_employment_status AND v_target.is_blocked = v_new_is_blocked THEN
    RETURN jsonb_build_object(
      'ok', true,
      'status', 'no_change',
      'target_user_id', target_user_id,
      'employment_status', v_new_employment_status,
      'is_blocked', v_new_is_blocked
    );
  END IF;

  IF (v_target.role IN ('admin', 'owner') AND v_target.deleted = false AND v_target.is_blocked = false AND v_target.employment_status = 'active')
     AND (v_new_employment_status <> 'active' OR v_new_is_blocked = true) THEN
    PERFORM pg_advisory_xact_lock(7421, 1);
    SELECT count(*) INTO v_active_count
    FROM public.profiles AS p
    WHERE p.role IN ('admin', 'owner')
      AND p.deleted = false
      AND p.is_blocked = false
      AND p.employment_status = 'active'
      AND p.id <> target_user_id;

    IF v_active_count < 1 THEN
      RAISE EXCEPTION 'Cannot deactivate or block the last active privileged account';
    END IF;
  END IF;

  PERFORM set_config('app.current_change_note', trim(change_note), true);

  UPDATE public.profiles AS p
  SET employment_status = v_new_employment_status,
      is_blocked = v_new_is_blocked,
      updated_at = now()
  WHERE p.id = target_user_id;

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'updated',
    'target_user_id', target_user_id,
    'previous_status', v_target.employment_status,
    'new_status', v_new_employment_status,
    'previous_blocked', v_target.is_blocked,
    'new_blocked', v_new_is_blocked
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_staff_status_v2(uuid, text, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_staff_status_v2(uuid, text, boolean, text) TO authenticated;

-- 6. Hardened role management RPC
CREATE OR REPLACE FUNCTION public.update_staff_role_v2(
  target_user_id uuid,
  new_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_target record;
  v_active_count integer;
  v_actor_name text;
BEGIN
  IF NOT public.can_manage_staff() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'target_user_id cannot be null';
  END IF;

  IF new_role IS NULL OR new_role NOT IN ('staff', 'admin') THEN
    RAISE EXCEPTION 'Invalid role specified';
  END IF;

  SELECT * INTO v_target
  FROM public.profiles
  WHERE id = target_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target user not found';
  END IF;

  IF v_target.role NOT IN ('staff', 'admin') THEN
    RAISE EXCEPTION 'Target user is not a staff member or administrator';
  END IF;

  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot modify your own role';
  END IF;

  IF v_target.role = 'owner' THEN
    RAISE EXCEPTION 'Cannot modify owner account role';
  END IF;

  IF v_target.deleted IS NOT FALSE THEN
    RAISE EXCEPTION 'Cannot update role of an archived staff member';
  END IF;

  IF v_target.role = new_role THEN
    RETURN jsonb_build_object(
      'ok', true,
      'status', 'no_change',
      'target_user_id', target_user_id,
      'role', new_role
    );
  END IF;

  IF (v_target.role = 'admin' AND v_target.deleted = false AND v_target.is_blocked = false AND v_target.employment_status = 'active')
     AND new_role = 'staff' THEN
    PERFORM pg_advisory_xact_lock(7421, 1);
    SELECT count(*) INTO v_active_count
    FROM public.profiles AS p
    WHERE p.role IN ('admin', 'owner')
      AND p.deleted = false
      AND p.is_blocked = false
      AND p.employment_status = 'active'
      AND p.id <> target_user_id;

    IF v_active_count < 1 THEN
      RAISE EXCEPTION 'Cannot demote the last active privileged account';
    END IF;
  END IF;

  UPDATE public.profiles AS p
  SET role = new_role,
      updated_at = now()
  WHERE p.id = target_user_id;

  SELECT COALESCE( NULLIF(trim(concat_ws(' ', first_name, last_name)), ''), 'Staff' )
  INTO v_actor_name
  FROM public.profiles
  WHERE id = auth.uid();

  INSERT INTO public.logs (user_id, user_name, action, target_type, target_id, details)
  VALUES (
    auth.uid(),
    v_actor_name,
    'staff_role_updated',
    'staff',
    target_user_id::text,
    jsonb_build_object('previous_role', v_target.role, 'new_role', new_role)
  );

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'updated',
    'target_user_id', target_user_id,
    'previous_role', v_target.role,
    'new_role', new_role
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_staff_role_v2(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_staff_role_v2(uuid, text) TO authenticated;

-- 7. Hardened staff archive and restore RPC
CREATE OR REPLACE FUNCTION public.set_staff_archive_state(
  target_user_id uuid,
  archived boolean,
  change_note text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_target record;
  v_active_count integer;
  v_actor_name text;
BEGIN
  IF NOT public.can_manage_staff() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'target_user_id cannot be null';
  END IF;

  IF archived IS NULL THEN
    RAISE EXCEPTION 'archived cannot be null';
  END IF;

  IF change_note IS NULL OR trim(change_note) = '' OR length(trim(change_note)) > 500 THEN
    RAISE EXCEPTION 'change_note must be between 1 and 500 characters';
  END IF;

  SELECT * INTO v_target
  FROM public.profiles
  WHERE id = target_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target user not found';
  END IF;

  IF v_target.role NOT IN ('staff', 'admin') THEN
    RAISE EXCEPTION 'Target user is not a staff member or administrator';
  END IF;

  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot archive your own account';
  END IF;

  IF v_target.role = 'owner' THEN
    RAISE EXCEPTION 'Cannot archive owner account';
  END IF;

  IF (v_target.deleted IS TRUE AND archived IS TRUE) OR (v_target.deleted IS FALSE AND archived IS FALSE) THEN
    RETURN jsonb_build_object(
      'ok', true,
      'status', 'no_change',
      'state', CASE WHEN archived THEN 'archived' ELSE 'restored' END,
      'target_user_id', target_user_id
    );
  END IF;

  IF (v_target.role IN ('admin', 'owner') AND v_target.deleted = false AND v_target.is_blocked = false AND v_target.employment_status = 'active')
     AND archived IS TRUE THEN
    PERFORM pg_advisory_xact_lock(7421, 1);
    SELECT count(*) INTO v_active_count
    FROM public.profiles AS p
    WHERE p.role IN ('admin', 'owner')
      AND p.deleted = false
      AND p.is_blocked = false
      AND p.employment_status = 'active'
      AND p.id <> target_user_id;

    IF v_active_count < 1 THEN
      RAISE EXCEPTION 'Cannot archive the last active privileged account';
    END IF;
  END IF;

  UPDATE public.profiles AS p
  SET deleted = archived,
      updated_at = now()
  WHERE p.id = target_user_id;

  SELECT COALESCE( NULLIF(trim(concat_ws(' ', first_name, last_name)), ''), 'Staff' )
  INTO v_actor_name
  FROM public.profiles
  WHERE id = auth.uid();

  INSERT INTO public.logs (user_id, user_name, action, target_type, target_id, details)
  VALUES (
    auth.uid(),
    v_actor_name,
    CASE WHEN archived THEN 'staff_archived' ELSE 'staff_restored' END,
    'staff',
    target_user_id::text,
    jsonb_build_object(
      'archived', archived,
      'previous_deleted', v_target.deleted,
      'new_deleted', archived,
      'note', trim(change_note)
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'status', CASE WHEN archived THEN 'archived' ELSE 'restored' END,
    'state', CASE WHEN archived THEN 'archived' ELSE 'restored' END,
    'target_user_id', target_user_id,
    'previous_deleted', v_target.deleted,
    'new_deleted', archived
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_staff_archive_state(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_staff_archive_state(uuid, boolean, text) TO authenticated;

-- 8. Backwards-compatibility wrappers delegating to v2 implementations
CREATE OR REPLACE FUNCTION public.update_staff_role(target_user_id uuid, new_role text)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.update_staff_role_v2(target_user_id, new_role);
END;
$$;

REVOKE ALL ON FUNCTION public.update_staff_role(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_staff_role(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_staff_status(target_staff_id uuid, new_employment_status text, new_is_blocked boolean, change_note text)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.update_staff_status_v2(
    target_user_id => target_staff_id,
    employment_status => new_employment_status,
    is_blocked => new_is_blocked,
    change_note => change_note
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_staff_status(uuid, text, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_staff_status(uuid, text, boolean, text) TO authenticated;

-- 9. Trigger synchronizing email updates on auth.users to public.profiles
CREATE OR REPLACE FUNCTION public.handle_user_email_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.profiles AS p
  SET email = NEW.email
  WHERE p.id = NEW.id;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_user_email_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_email_changed ON auth.users;
CREATE TRIGGER on_auth_user_email_changed
AFTER UPDATE OF email ON auth.users
FOR EACH ROW
WHEN (OLD.email IS DISTINCT FROM NEW.email)
EXECUTE FUNCTION public.handle_user_email_change();
