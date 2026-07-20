-- ============================================================================
-- DROP THE INSECURE PROFILE SELF-INSERT POLICY
-- ============================================================================
-- Context: 20260719000000 added a policy letting an invited user insert their
-- own profiles row where role = user_metadata.role. That is unsafe:
-- user_metadata is writable by the user themselves via auth.updateUser({data}),
-- so a logged-in customer could set user_metadata.role = 'admin' and self-insert
-- an admin profile.
--
-- Activation now happens in the activate-staff-account edge function under the
-- service role, reading the role from app_metadata.staff_role (service-role-only,
-- not user-writable). No client-side profile INSERT is needed anymore, so this
-- policy is removed entirely.
--
-- IDEMPOTENT: DROP ... IF EXISTS
-- ============================================================================

BEGIN;

DROP POLICY IF EXISTS "Invited staff can create their own profile"
ON public.profiles;

COMMIT;
