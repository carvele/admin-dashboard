-- ============================================================================
-- RESTRICT STAFF WRITES: products + reservations are full-access-only
-- ============================================================================
-- Context: the confirmed RBAC decision is that the 'staff' role is view-only
-- for the catalog and reservations (they monitor; they do not manipulate).
-- The UI already hides these controls from staff, but RLS still allowed the
-- writes: the products and reservations write policies used is_staff_or_admin()
-- (which returns true for staff), so a staff account could bypass the UI and
-- call the REST API directly to create/edit/delete products or reservations.
--
-- This migration swaps those WRITE policies to is_admin_or_owner() (admin +
-- owner only) while preserving:
--   • public / staff READ access (SELECT policies are untouched — staff still
--     view products and reservations),
--   • customers managing their OWN reservations (customer_id = auth.uid()).
--
-- stock_movements and categories are already admin/owner-only and unchanged.
--
-- IDEMPOTENT: DROP ... IF EXISTS before each CREATE.
-- ============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- PRODUCTS — replace the staff-inclusive ALL policy with admin/owner-only.
-- SELECT stays public via the existing "Public read products" /
-- "Enable read access for all users" policies, so staff keep read access.
-- ─────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Enable all access for admin/staff" ON public.products;

DROP POLICY IF EXISTS "Enable write access for admin and owner" ON public.products;
CREATE POLICY "Enable write access for admin and owner"
ON public.products FOR ALL
USING (public.is_admin_or_owner())
WITH CHECK (public.is_admin_or_owner());

-- ─────────────────────────────────────────────────────────────────────────
-- RESERVATIONS — customers keep self-service; staff lose write, keep read.
-- ─────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Enable insert for own reservations or admin" ON public.reservations;
CREATE POLICY "Enable insert for own reservations or admin"
ON public.reservations FOR INSERT
WITH CHECK ((customer_id = auth.uid()) OR public.is_admin_or_owner());

DROP POLICY IF EXISTS "Enable update for own reservations or admin" ON public.reservations;
CREATE POLICY "Enable update for own reservations or admin"
ON public.reservations FOR UPDATE
USING ((customer_id = auth.uid()) OR public.is_admin_or_owner())
WITH CHECK ((customer_id = auth.uid()) OR public.is_admin_or_owner());

DROP POLICY IF EXISTS "Enable delete for admin/staff" ON public.reservations;
CREATE POLICY "Enable delete for admin and owner"
ON public.reservations FOR DELETE
USING (public.is_admin_or_owner());

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════
-- ROLLBACK (restores the prior staff-inclusive behavior):
--
-- CREATE POLICY "Enable all access for admin/staff" ON public.products
--   FOR ALL USING (is_staff_or_admin()) WITH CHECK (is_staff_or_admin());
-- DROP POLICY IF EXISTS "Enable write access for admin and owner" ON public.products;
-- (reservations policies would likewise be recreated with is_staff_or_admin())
-- ═════════════════════════════════════════════════════════════════════════
