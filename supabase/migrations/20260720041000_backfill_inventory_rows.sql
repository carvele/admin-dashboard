-- ============================================================================
-- BACKFILL inventory ROWS FOR PRODUCTS MISSING PER-SIZE STOCK
-- ============================================================================
-- Context: the `inventory` table (per-size total/reserved/available) is now
-- the canonical stock model (product decision 2026-07-19 — see the RBAC/
-- inventory spec discussion). Only 3 of 21 active products had any inventory
-- rows; the other 18 had no per-size stock at all, so the mature inventory UI
-- (catalog/Inventory.jsx) couldn't show or manage their stock.
--
-- This inserts one placeholder row per (product, size) that doesn't already
-- have one, seeded at total=0/reserved=0/available=0 — an explicit "not yet
-- stocked" state rather than the product silently not appearing. Owners/admins
-- restock from there. Existing rows (e.g. White Dress) are left untouched.
-- `products.stock` was NOT used as a seed value — it's already provably stale
-- (White Dress shows stock=32 on products but its real inventory row has
-- total=40/available=32/reserved=8; they're only coincidentally close).
--
-- SKU pattern matches the existing seeded rows (JZ-XX-NNNN): 2-letter prefix
-- from the product name's initials + 4 hex chars from the product id for
-- uniqueness.
--
-- IDEMPOTENT: only inserts rows that don't already exist for (product, size).
-- ============================================================================

BEGIN;

WITH product_sizes AS (
  SELECT
    p.id AS product_id,
    p.name,
    p.category,
    unnest(p.sizes) AS size
  FROM public.products p
  WHERE p.deleted = false
    AND p.sizes IS NOT NULL
    AND array_length(p.sizes, 1) > 0
)
INSERT INTO public.inventory (product_doc_id, sku, item, category, size, total, reserved, available)
SELECT
  ps.product_id,
  'JZ-' ||
    upper(left(regexp_replace(ps.name, '[^A-Za-z ]', '', 'g'), 1)) ||
    upper(coalesce(substring(split_part(ps.name, ' ', 2) from 1 for 1), 'X')) ||
    '-' || upper(right(ps.product_id::text, 4)),
  ps.name,
  ps.category,
  ps.size,
  0, 0, 0
FROM product_sizes ps
WHERE NOT EXISTS (
  SELECT 1 FROM public.inventory i
  WHERE i.product_doc_id = ps.product_id AND i.size = ps.size
);

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════
-- ROLLBACK: no generic rollback (would need to identify exactly the rows this
-- inserted). If needed: DELETE FROM inventory WHERE total=0 AND reserved=0
-- AND available=0 AND created_at > '<time this migration ran>';
-- ═════════════════════════════════════════════════════════════════════════
