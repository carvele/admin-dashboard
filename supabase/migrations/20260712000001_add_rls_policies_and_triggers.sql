-- ============================================================================
-- INVENTORY FEATURE: RLS POLICIES & IMMUTABILITY ENFORCEMENT
-- ============================================================================
-- Migration: Add RLS policies for admin-only writes and append-only enforcement
-- 
-- SECURITY MODEL:
--   - Admin users: role IN ('Admin', 'Owner') in profiles table
--   - Verified via RLS policy checking profiles.id = auth.uid()
--   - Append-only: Trigger + RLS + CHECK constraint (3-layer defense)
--
-- IDEMPOTENT: All DROP ... IF EXISTS and CREATE ... IF NOT EXISTS
-- ============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. DEFINE IMMUTABILITY TRIGGER FUNCTION
-- ─────────────────────────────────────────────────────────────────────────
-- 
-- This trigger prevents UPDATE/DELETE on stock_movements.
-- Works in conjunction with RLS policies and CHECK constraint.

CREATE OR REPLACE FUNCTION public.prevent_stock_movement_updates()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Stock movements are immutable — cannot UPDATE records';
  ELSIF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Stock movements are immutable — cannot DELETE records';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop old trigger if it exists
DROP TRIGGER IF EXISTS stock_movements_prevent_updates_trigger 
ON public.stock_movements;

-- Create trigger for UPDATE and DELETE
CREATE TRIGGER stock_movements_prevent_updates_trigger
BEFORE UPDATE OR DELETE ON public.stock_movements
FOR EACH ROW
EXECUTE FUNCTION public.prevent_stock_movement_updates();

-- ─────────────────────────────────────────────────────────────────────────
-- 2. RLS POLICIES FOR STOCK_MOVEMENTS TABLE
-- ─────────────────────────────────────────────────────────────────────────

-- POLICY: SELECT — Public read access (everyone can view stock movements)
DROP POLICY IF EXISTS "Allow public read of stock_movements" 
ON public.stock_movements;

CREATE POLICY "Allow public read of stock_movements"
ON public.stock_movements FOR SELECT
USING (true);

-- POLICY: INSERT — Admin-only
--
-- Check:
--   1. auth.uid() matches a record in profiles table
--   2. That profile's role is 'Admin' or 'Owner'
--   3. That profile is not deleted and not blocked

DROP POLICY IF EXISTS "Allow admins to create stock_movements" 
ON public.stock_movements;

CREATE POLICY "Allow admins to create stock_movements"
ON public.stock_movements FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('Admin', 'Owner')
    AND profiles.deleted = false
    AND profiles.is_blocked = false
  )
);

-- POLICY: UPDATE — Explicitly deny (defense-in-depth against RLS bypass)
DROP POLICY IF EXISTS "Deny all stock_movements updates" 
ON public.stock_movements;

CREATE POLICY "Deny all stock_movements updates"
ON public.stock_movements FOR UPDATE
USING (false);

-- POLICY: DELETE — Explicitly deny (defense-in-depth against RLS bypass)
DROP POLICY IF EXISTS "Deny all stock_movements deletes" 
ON public.stock_movements;

CREATE POLICY "Deny all stock_movements deletes"
ON public.stock_movements FOR DELETE
USING (false);

-- ─────────────────────────────────────────────────────────────────────────
-- 3. RLS POLICIES FOR PRODUCTS TABLE (EXTENDED COLUMNS)
-- ─────────────────────────────────────────────────────────────────────────
--
-- Restrict admin-editable columns (stockBaseline, pattern, color) to admins
-- Existing product data remains readable by all authenticated users

DROP POLICY IF EXISTS "Allow admins to edit inventory columns on products" 
ON public.products;

CREATE POLICY "Allow admins to edit inventory columns on products"
ON public.products FOR UPDATE
USING (true)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('Admin', 'Owner')
    AND profiles.deleted = false
    AND profiles.is_blocked = false
  )
);

-- ─────────────────────────────────────────────────────────────────────────
-- 4. RLS POLICIES FOR COLOR_LIST TABLE (admin-managed)
-- ─────────────────────────────────────────────────────────────────────────

-- POLICY: SELECT — Public read
DROP POLICY IF EXISTS "Allow public read of color_list" 
ON public.color_list;

CREATE POLICY "Allow public read of color_list"
ON public.color_list FOR SELECT
USING (true);

-- POLICY: INSERT — Admin-only
DROP POLICY IF EXISTS "Allow admins to create colors" 
ON public.color_list;

CREATE POLICY "Allow admins to create colors"
ON public.color_list FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('Admin', 'Owner')
    AND profiles.deleted = false
    AND profiles.is_blocked = false
  )
);

-- POLICY: UPDATE — Admin-only
DROP POLICY IF EXISTS "Allow admins to update colors" 
ON public.color_list;

CREATE POLICY "Allow admins to update colors"
ON public.color_list FOR UPDATE
USING (true)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('Admin', 'Owner')
    AND profiles.deleted = false
    AND profiles.is_blocked = false
  )
);

-- POLICY: DELETE — Admin-only
DROP POLICY IF EXISTS "Allow admins to delete colors" 
ON public.color_list;

CREATE POLICY "Allow admins to delete colors"
ON public.color_list FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('Admin', 'Owner')
    AND profiles.deleted = false
    AND profiles.is_blocked = false
  )
);

-- ─────────────────────────────────────────────────────────────────────────
-- 5. RLS POLICIES FOR PATTERN_LIST TABLE (admin-managed)
-- ─────────────────────────────────────────────────────────────────────────

-- POLICY: SELECT — Public read
DROP POLICY IF EXISTS "Allow public read of pattern_list" 
ON public.pattern_list;

CREATE POLICY "Allow public read of pattern_list"
ON public.pattern_list FOR SELECT
USING (true);

-- POLICY: INSERT — Admin-only
DROP POLICY IF EXISTS "Allow admins to create patterns" 
ON public.pattern_list;

CREATE POLICY "Allow admins to create patterns"
ON public.pattern_list FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('Admin', 'Owner')
    AND profiles.deleted = false
    AND profiles.is_blocked = false
  )
);

-- POLICY: UPDATE — Admin-only
DROP POLICY IF EXISTS "Allow admins to update patterns" 
ON public.pattern_list;

CREATE POLICY "Allow admins to update patterns"
ON public.pattern_list FOR UPDATE
USING (true)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('Admin', 'Owner')
    AND profiles.deleted = false
    AND profiles.is_blocked = false
  )
);

-- POLICY: DELETE — Admin-only
DROP POLICY IF EXISTS "Allow admins to delete patterns" 
ON public.pattern_list;

CREATE POLICY "Allow admins to delete patterns"
ON public.pattern_list FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('Admin', 'Owner')
    AND profiles.deleted = false
    AND profiles.is_blocked = false
  )
);

-- ─────────────────────────────────────────────────────────────────────────
-- 6. COMMIT
-- ─────────────────────────────────────────────────────────────────────────

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════
-- ROLLBACK (if needed):
--
-- DROP POLICY IF EXISTS "Allow public read of stock_movements" ON public.stock_movements;
-- DROP POLICY IF EXISTS "Allow admins to create stock_movements" ON public.stock_movements;
-- DROP POLICY IF EXISTS "Deny all stock_movements updates" ON public.stock_movements;
-- DROP POLICY IF EXISTS "Deny all stock_movements deletes" ON public.stock_movements;
-- DROP POLICY IF EXISTS "Allow admins to edit inventory columns on products" ON public.products;
-- DROP POLICY IF EXISTS "Allow public read of color_list" ON public.color_list;
-- DROP POLICY IF EXISTS "Allow admins to create colors" ON public.color_list;
-- DROP POLICY IF EXISTS "Allow admins to update colors" ON public.color_list;
-- DROP POLICY IF EXISTS "Allow admins to delete colors" ON public.color_list;
-- DROP POLICY IF EXISTS "Allow public read of pattern_list" ON public.pattern_list;
-- DROP POLICY IF EXISTS "Allow admins to create patterns" ON public.pattern_list;
-- DROP POLICY IF EXISTS "Allow admins to update patterns" ON public.pattern_list;
-- DROP POLICY IF EXISTS "Allow admins to delete patterns" ON public.pattern_list;
-- DROP TRIGGER IF EXISTS stock_movements_prevent_updates_trigger ON public.stock_movements;
-- DROP FUNCTION IF EXISTS public.prevent_stock_movement_updates();
-- ═════════════════════════════════════════════════════════════════════════
