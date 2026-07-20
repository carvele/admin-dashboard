-- ============================================================================
-- ALLOW INVITED STAFF TO CREATE THEIR OWN PROFILE ROW ON SET-PASSWORD
-- ============================================================================
-- Context: The invite flow no longer creates a profiles row when the invite
-- is sent (create-staff-account only calls auth.admin.inviteUserByEmail).
-- The row is created client-side, once, on the SetPassword page — the moment
-- the invited user finishes verifying their email (via the invite link) and
-- chooses a password. Until then they have a Supabase Auth session but no
-- profiles row, so they don't appear in Team Management and can't log in.
--
-- Security: role is NOT trusted from the client payload. It must match the
-- role embedded in user_metadata, which was set server-side (service role)
-- by create-staff-account at invite time and cannot be forged by the client.
-- This also blocks self-inserting as 'owner' or 'customer'.
--
-- IDEMPOTENT: DROP ... IF EXISTS before CREATE
-- ============================================================================

BEGIN;

DROP POLICY IF EXISTS "Invited staff can create their own profile"
ON public.profiles;

CREATE POLICY "Invited staff can create their own profile"
ON public.profiles FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = id
  AND role IN ('staff', 'admin')
  AND role = (auth.jwt() -> 'user_metadata' ->> 'role')
);

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════
-- ROLLBACK (if needed):
--
-- DROP POLICY IF EXISTS "Invited staff can create their own profile" ON public.profiles;
-- ═════════════════════════════════════════════════════════════════════════
