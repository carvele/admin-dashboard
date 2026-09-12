-- REVOKE ... FROM PUBLIC does not strip a grant made directly to a named
-- role; this project auto-grants EXECUTE to anon/authenticated on new
-- functions via a default-privileges rule, so anon could still call these
-- security-sensitive RPCs despite the PUBLIC revoke in the prior migration
-- (verified live with has_function_privilege('anon', ...) after applying
-- 20260912040751 -- it returned true for register_device and the new
-- admin_manage_device overload). register_device is meant for
-- authenticated users only (it reads auth.uid()); admin_manage_device/
-- admin_prune_devices are owner/admin-only (enforced inside the function
-- body too, but anon shouldn't reach them at all).
REVOKE EXECUTE ON FUNCTION public.register_device(TEXT, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_manage_device(UUID, TEXT, TEXT, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_prune_devices(TIMESTAMP WITH TIME ZONE) FROM anon;

-- The old 3-arg admin_manage_device(_fingerprint, _action, _value) is
-- superseded by the (user_id, fingerprint)-scoped 4-arg version -- CREATE OR
-- REPLACE with an added parameter creates a new overload rather than
-- replacing it, so the old one was left behind, still anon/authenticated
-- reachable, and semantically wrong against the new schema (fingerprint is
-- no longer globally unique, so WHERE fingerprint = _fingerprint could
-- match the wrong user's row).
DROP FUNCTION IF EXISTS public.admin_manage_device(TEXT, TEXT, TEXT);
