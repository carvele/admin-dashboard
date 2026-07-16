-- ============================================================================
-- ADD RLS POLICIES FOR CATEGORIES TABLE
-- ============================================================================
-- Context: The categories table has RLS enabled but no write policies for
-- admin users. This migration adds SELECT (public), INSERT, UPDATE, DELETE
-- (admin-only) policies using lowercase role values to match the live
-- profiles.role data ('admin', 'owner').
--
-- IDEMPOTENT: All DROP ... IF EXISTS before CREATE
-- ============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- SELECT — Public read (anyone can see the category list)
-- ─────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Allow public read of categories"
ON public.categories;

CREATE POLICY "Allow public read of categories"
ON public.categories FOR SELECT
USING (true);

-- ─────────────────────────────────────────────────────────────────────────
-- INSERT — Admin-only
-- ─────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Allow admins to create categories"
ON public.categories;

CREATE POLICY "Allow admins to create categories"
ON public.categories FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('admin', 'owner')
    AND profiles.deleted = false
    AND profiles.is_blocked = false
  )
);

-- ─────────────────────────────────────────────────────────────────────────
-- UPDATE — Admin-only
-- ─────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Allow admins to update categories"
ON public.categories;

CREATE POLICY "Allow admins to update categories"
ON public.categories FOR UPDATE
USING (true)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('admin', 'owner')
    AND profiles.deleted = false
    AND profiles.is_blocked = false
  )
);

-- ─────────────────────────────────────────────────────────────────────────
-- DELETE — Admin-only
-- ─────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Allow admins to delete categories"
ON public.categories;

CREATE POLICY "Allow admins to delete categories"
ON public.categories FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('admin', 'owner')
    AND profiles.deleted = false
    AND profiles.is_blocked = false
  )
);

-- ─────────────────────────────────────────────────────────────────────────
-- COMMIT
-- ─────────────────────────────────────────────────────────────────────────

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════
-- ROLLBACK (if needed):
--
-- DROP POLICY IF EXISTS "Allow public read of categories" ON public.categories;
-- DROP POLICY IF EXISTS "Allow admins to create categories" ON public.categories;
-- DROP POLICY IF EXISTS "Allow admins to update categories" ON public.categories;
-- DROP POLICY IF EXISTS "Allow admins to delete categories" ON public.categories;
-- ═════════════════════════════════════════════════════════════════════════
