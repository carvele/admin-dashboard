-- ============================================================================
-- Rollback: rollback-b2a4-migration-b.sql
-- Phase: B2A-4 (Migration B Reversal)
-- Description:
--   Restores transitional UPDATE column grants for is_blocked and deleted
--   to the authenticated role on public.profiles.
-- ============================================================================

GRANT UPDATE (is_blocked, deleted) ON TABLE public.profiles TO authenticated;
