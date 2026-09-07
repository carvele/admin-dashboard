-- ============================================================================
-- Migration: 20260907190000_revoke_transitional_profile_grants.sql
-- Phase: B2A-4 (Migration B - Permanent Transitional Grant Revocation)
-- Description:
--   Permanently revokes transitional UPDATE column grants for is_blocked and
--   deleted on public.profiles from the authenticated role.
--   Direct client mutation of moderation/lifecycle fields is now impossible.
--   All status, block, and deletion changes must route through dedicated RPCs:
--     - set_customer_block_state
--     - set_customer_archive_state
--     - update_staff_status_v2
--     - set_staff_archive_state
--     - process_account_deletion
-- ============================================================================

REVOKE UPDATE (is_blocked, deleted) ON TABLE public.profiles FROM authenticated;

COMMENT ON TABLE public.profiles IS 'B2A-4: User profiles table. Privileged columns (role, employment_status, is_blocked, deleted, email) are strictly protected; mutations must route through dedicated command RPCs.';
