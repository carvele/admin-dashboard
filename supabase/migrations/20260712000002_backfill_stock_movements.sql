-- ============================================================================
-- INVENTORY FEATURE: DATA MIGRATION — BACKFILL STOCK MOVEMENTS
-- ============================================================================
-- Migration: Convert legacy stock values to initial stock_movements records
-- 
-- IDEMPOTENT: Uses WHERE NOT EXISTS to prevent duplicate backfills
-- SAFE: Each product gets exactly ONE backfill movement (if none exists)
-- REVERSIBLE: Can DELETE all movements created by this migration via timestamp
--
-- ============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. BACKFILL: Insert initial stock_movements for all products
-- ─────────────────────────────────────────────────────────────────────────
--
-- For each product with NO existing stock_movements:
--   - Create a single record with changeType='correction'
--   - new_stock = products.stock (current stock value)
--   - previous_stock = 0 (assumed initial state)
--   - delta = new_stock (since 0 → new_stock)
--   - Timestamp = products.created_at if it exists, else now()
--   - Note: "Initial backfill from legacy stock field"
--
-- The WHERE NOT EXISTS ensures idempotency:
--   - On first run: all products get a backfill
--   - On second run: no products have movements created, nothing happens

INSERT INTO public.stock_movements (
  product_id,
  previous_stock,
  new_stock,
  delta,
  change_type,
  note,
  created_at,
  updated_at
)
SELECT
  products.id,
  0 AS previous_stock,
  COALESCE(products.stock, 0) AS new_stock,
  COALESCE(products.stock, 0) AS delta,
  'correction' AS change_type,
  'Initial backfill from legacy stock field' AS note,
  COALESCE(products.created_at, now()) AS created_at,
  COALESCE(products.created_at, now()) AS updated_at
FROM public.products
WHERE NOT EXISTS (
  SELECT 1 FROM public.stock_movements
  WHERE stock_movements.product_id = products.id
)
AND products.deleted = false;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. VERIFY: Check backfill results
-- ─────────────────────────────────────────────────────────────────────────
--
-- These queries help confirm the backfill worked correctly.
-- Run them after applying the migration.

-- Query 1: How many products got backfilled?
-- SELECT COUNT(*) AS products_backfilled
-- FROM public.stock_movements
-- WHERE change_type = 'correction'
-- AND note = 'Initial backfill from legacy stock field';

-- Query 2: Do all active products have at least one movement?
-- SELECT COUNT(*) AS products_without_movements
-- FROM public.products p
-- LEFT JOIN public.stock_movements sm ON p.id = sm.product_id
-- WHERE p.deleted = false
-- AND sm.id IS NULL;
-- (Should return 0 if backfill was successful)

-- Query 3: Verify currentStock calculations are correct
-- SELECT 
--   p.id,
--   p.name,
--   p.stock AS legacy_stock_value,
--   SUM(sm.delta) AS calculated_current_stock,
--   CASE 
--     WHEN COALESCE(p.stockBaseline, 10) = 0 THEN 'ERROR'
--     WHEN SUM(sm.delta) = 0 THEN 'NO_STOCK'
--     WHEN (SUM(sm.delta)::float / COALESCE(p.stockBaseline, 10)) * 100 <= 25 THEN 'CRITICAL'
--     WHEN (SUM(sm.delta)::float / COALESCE(p.stockBaseline, 10)) * 100 <= 50 THEN 'VERY_LOW'
--     WHEN (SUM(sm.delta)::float / COALESCE(p.stockBaseline, 10)) * 100 <= 75 THEN 'LOW'
--     WHEN (SUM(sm.delta)::float / COALESCE(p.stockBaseline, 10)) * 100 < 200 THEN 'HEALTHY'
--     ELSE 'OVERSTOCK'
--   END AS stock_status
-- FROM public.products p
-- LEFT JOIN public.stock_movements sm ON p.id = sm.product_id
-- WHERE p.deleted = false
-- GROUP BY p.id, p.name, p.stock, p.stockBaseline
-- ORDER BY p.created_at DESC;

-- Query 4: Sample of backfill records
-- SELECT 
--   id,
--   product_id,
--   previous_stock,
--   new_stock,
--   delta,
--   change_type,
--   note,
--   created_at
-- FROM public.stock_movements
-- WHERE change_type = 'correction'
-- LIMIT 10;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. COMMIT
-- ─────────────────────────────────────────────────────────────────────────

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════
-- ROLLBACK (if needed):
--
-- DELETE FROM public.stock_movements
-- WHERE change_type = 'correction'
-- AND note = 'Initial backfill from legacy stock field';
--
-- ═════════════════════════════════════════════════════════════════════════
