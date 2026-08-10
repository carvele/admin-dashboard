-- Migration: Secure role updates behind a server-side RPC
-- Prevents privilege escalation via direct client-side profiles.role mutation
--
-- This function is SECURITY DEFINER so it runs with elevated privileges,
-- but validates the caller's role before making any changes.

CREATE OR REPLACE FUNCTION public.update_staff_role(
  target_user_id UUID,
  new_role TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role TEXT;
  target_role TEXT;
BEGIN
  -- 1. Identify the caller's role
  SELECT role INTO caller_role
  FROM profiles
  WHERE id = auth.uid() AND deleted IS DISTINCT FROM true;

  IF caller_role IS NULL OR caller_role NOT IN ('owner') THEN
    RAISE EXCEPTION 'Only owners can change staff roles';
  END IF;

  -- 2. Validate the new role
  IF new_role NOT IN ('staff', 'admin') THEN
    RAISE EXCEPTION 'Role must be "staff" or "admin"';
  END IF;

  -- 3. Prevent self-modification
  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot change your own role';
  END IF;

  -- 4. Verify the target is a modifiable staff member (not an owner or customer)
  SELECT role INTO target_role
  FROM profiles
  WHERE id = target_user_id AND deleted IS DISTINCT FROM true;

  IF target_role IS NULL THEN
    RAISE EXCEPTION 'Target user not found or is deleted';
  END IF;

  IF target_role NOT IN ('staff', 'admin') THEN
    RAISE EXCEPTION 'Cannot modify a % role', target_role;
  END IF;

  -- 5. Perform the update
  UPDATE profiles
  SET role = new_role, updated_at = NOW()
  WHERE id = target_user_id;
END;
$$;

-- Restrict access: only authenticated users can call, and the function
-- itself validates they must be an owner.
REVOKE ALL ON FUNCTION public.update_staff_role(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_staff_role(UUID, TEXT) TO authenticated;
