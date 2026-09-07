-- ============================================================================
-- Migration: Auto-seed inventory rows for products that have none
--
-- Objective:
-- 1. Backfill missing inventory rows for existing products (idempotent).
-- 2. Install a BEFORE INSERT trigger so every new product automatically
--    gets at least one inventory row per declared size, preventing the
--    "Catalog products missing inventory rows" warning permanently.
--
-- Contract:
-- - Only creates rows that don't already exist (LEFT JOIN / NOT EXISTS).
-- - Trigger fires AFTER INSERT on products; safe to re-run.
-- - Does not touch products managed by the variant-aware path (those get
--   their rows from createVariant() in ProductForm). The trigger acts as
--   a safety net for any path that bypasses the frontend.
-- ============================================================================

-- 1. Backfill: insert one inventory row per size for every active product
--    that currently has zero inventory rows.
INSERT INTO public.inventory (
  product_doc_id,
  item,
  category,
  size,
  total,
  reserved,
  available,
  deleted,
  created_at,
  updated_at
)
SELECT
  p.id              AS product_doc_id,
  p.name            AS item,
  p.category        AS category,
  sz                AS size,
  0                 AS total,
  0                 AS reserved,
  0                 AS available,
  false             AS deleted,
  now()             AS created_at,
  now()             AS updated_at
FROM public.products p
-- Expand the sizes array into individual rows
CROSS JOIN LATERAL unnest(COALESCE(p.sizes, ARRAY[]::text[])) AS sz
-- Only products with zero active inventory rows
WHERE p.deleted = false
  AND NOT EXISTS (
    SELECT 1 FROM public.inventory i
    WHERE i.product_doc_id = p.id
      AND (i.deleted IS NULL OR i.deleted = false)
  )
  -- Only process rows where sizes array is non-empty
  AND array_length(p.sizes, 1) > 0;

-- 2. Trigger function: seed inventory for a product with declared sizes
--    that arrives via any write path (admin, migration, script).
CREATE OR REPLACE FUNCTION public.seed_inventory_for_new_product()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  sz text;
BEGIN
  -- Skip if the product has no sizes declared
  IF NEW.sizes IS NULL OR array_length(NEW.sizes, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  -- One inventory row per declared size (skip if already exists)
  FOREACH sz IN ARRAY NEW.sizes LOOP
    INSERT INTO public.inventory (
      product_doc_id, item, category, size,
      total, reserved, available, deleted, created_at, updated_at
    )
    SELECT
      NEW.id, NEW.name, NEW.category, sz,
      0, 0, 0, false, now(), now()
    WHERE NOT EXISTS (
      SELECT 1 FROM public.inventory i
      WHERE i.product_doc_id = NEW.id AND i.size = sz
        AND (i.deleted IS NULL OR i.deleted = false)
    );
  END LOOP;

  RETURN NEW;
END;
$$;

-- 3. Attach trigger: fires after every product INSERT
DROP TRIGGER IF EXISTS trg_seed_inventory_on_product_insert ON public.products;
CREATE TRIGGER trg_seed_inventory_on_product_insert
AFTER INSERT ON public.products
FOR EACH ROW
EXECUTE FUNCTION public.seed_inventory_for_new_product();

-- 4. Verify: show any remaining products with zero inventory (should be 0)
-- SELECT p.id, p.name, COUNT(i.id) AS inv_count
-- FROM public.products p
-- LEFT JOIN public.inventory i ON i.product_doc_id = p.id AND (i.deleted IS NULL OR i.deleted = false)
-- WHERE p.deleted = false
-- GROUP BY p.id, p.name HAVING COUNT(i.id) = 0;
