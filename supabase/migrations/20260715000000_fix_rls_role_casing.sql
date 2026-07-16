-- ============================================================================
-- INVENTORY FEATURE: FIX RLS ROLE CASING
-- ============================================================================
-- Migration: Correct all admin-role checks from Title Case to lowercase
--
-- Root cause: profiles.role values are stored as lowercase ('admin', 'owner',
-- 'staff', 'customer') throughout the entire application. The original RLS
-- migration was written with IN ('Admin', 'Owner') which never matches live
-- data, blocking every admin write operation.
--
-- Fix: Replace all role IN ('Admin', 'Owner') with IN ('admin', 'owner')
-- across stock_movements, products, color_list, and pattern_list policies.
--
-- IDEMPOTENT: All DROP ... IF EXISTS before CREATE
-- ============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. STOCK_MOVEMENTS — INSERT policy
-- ─────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Allow admins to create stock_movements"
ON public.stock_movements;

CREATE POLICY "Allow admins to create stock_movements"
ON public.stock_movements FOR INSERT
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
-- 2. PRODUCTS — UPDATE policy (inventory columns: stockbaseline, pattern, color)
-- ─────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Allow admins to edit inventory columns on products"
ON public.products;

CREATE POLICY "Allow admins to edit inventory columns on products"
ON public.products FOR UPDATE
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
-- 3. COLOR_LIST — INSERT, UPDATE, DELETE policies
-- ─────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Allow admins to create colors"
ON public.color_list;

CREATE POLICY "Allow admins to create colors"
ON public.color_list FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('admin', 'owner')
    AND profiles.deleted = false
    AND profiles.is_blocked = false
  )
);

DROP POLICY IF EXISTS "Allow admins to update colors"
ON public.color_list;

CREATE POLICY "Allow admins to update colors"
ON public.color_list FOR UPDATE
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

DROP POLICY IF EXISTS "Allow admins to delete colors"
ON public.color_list;

CREATE POLICY "Allow admins to delete colors"
ON public.color_list FOR DELETE
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
-- 4. PATTERN_LIST — INSERT, UPDATE, DELETE policies
-- ─────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Allow admins to create patterns"
ON public.pattern_list;

CREATE POLICY "Allow admins to create patterns"
ON public.pattern_list FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('admin', 'owner')
    AND profiles.deleted = false
    AND profiles.is_blocked = false
  )
);

DROP POLICY IF EXISTS "Allow admins to update patterns"
ON public.pattern_list;

CREATE POLICY "Allow admins to update patterns"
ON public.pattern_list FOR UPDATE
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

DROP POLICY IF EXISTS "Allow admins to delete patterns"
ON public.pattern_list;

CREATE POLICY "Allow admins to delete patterns"
ON public.pattern_list FOR DELETE
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
-- 5. COMMIT
-- ─────────────────────────────────────────────────────────────────────────

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════
-- ROLLBACK (if needed — restores original broken Title Case policies):
--
-- DROP POLICY IF EXISTS "Allow admins to create stock_movements" ON public.stock_movements;
-- DROP POLICY IF EXISTS "Allow admins to edit inventory columns on products" ON public.products;
-- DROP POLICY IF EXISTS "Allow admins to create colors" ON public.color_list;
-- DROP POLICY IF EXISTS "Allow admins to update colors" ON public.color_list;
-- DROP POLICY IF EXISTS "Allow admins to delete colors" ON public.color_list;
-- DROP POLICY IF EXISTS "Allow admins to create patterns" ON public.pattern_list;
-- DROP POLICY IF EXISTS "Allow admins to update patterns" ON public.pattern_list;
-- DROP POLICY IF EXISTS "Allow admins to delete patterns" ON public.pattern_list;
-- ═════════════════════════════════════════════════════════════════════════
