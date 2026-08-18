-- ============================================================================
-- PROPOSED MIGRATION — inventory variants (size x colour x pattern)
--
-- STATUS: NOT APPLIED. This is a review artefact.
--
-- WHERE THIS BELONGS: supabase/README.md in this repo states the mobile repo
-- (carvele/jezsy-mobile-app) is the sole owner of supabase/migrations/. Do NOT
-- add this file there — copy the reviewed SQL into the mobile repo's migration
-- directory and run it from there, or a `supabase db push` from either side
-- will fight the other's history.
--
-- WHAT IT DOES: adds colour and pattern as stock-tracked dimensions on the
-- existing `inventory` table, so stock can be held per (product, size, colour,
-- pattern) instead of per (product, size) only.
--
-- SAFETY PROPERTIES:
--   * Purely additive. No column is dropped or retyped.
--   * No quantity (total / reserved / available) is recalculated or moved.
--   * Every existing row keeps its exact stock numbers.
--   * Reversible — see the ROLLBACK section at the bottom.
--
-- RUN ORDER: sections 1 -> 2 -> 3, then section 4 to verify, inside one
-- transaction. Section 5 is the rollback, run only if verification fails.
-- ============================================================================

BEGIN;

-- ── 1. Schema: add the two new dimensions ───────────────────────────────────
--
-- NOT NULL DEFAULT '' rather than nullable: an empty string means "this
-- product does not vary along this dimension", which is a real state we want
-- to be able to index and group by. NULL would make the uniqueness constraint
-- in section 3 useless, because NULL != NULL in Postgres and duplicate
-- (product, size, NULL, NULL) rows would all be permitted.

ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS color       text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS pattern     text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS variant_sku text;

COMMENT ON COLUMN public.inventory.color IS
  'Stock-tracked colourway. Empty string = product does not vary by colour.';
COMMENT ON COLUMN public.inventory.pattern IS
  'Stock-tracked pattern. Empty string = product does not vary by pattern.';
COMMENT ON COLUMN public.inventory.variant_sku IS
  'Human-readable per-variant SKU, e.g. GOWN01-RED-SOLID-M. Display/scanning aid.';


-- ── 2. Backfill: map every existing row to its equivalent variant ───────────
--
-- Each existing inventory row currently represents (product, size) with the
-- product's own colour/pattern implied. We make that implication explicit.
-- products.color is a comma-joined list, so baseColor (the primary colour) is
-- the correct single value to adopt here.
--
-- Quantities are untouched: this statement sets only colour/pattern.

UPDATE public.inventory AS i
SET color   = COALESCE(NULLIF(TRIM(p."baseColor"), ''), ''),
    pattern = COALESCE(NULLIF(TRIM(p.pattern), ''), 'Solid')
FROM public.products AS p
WHERE i.product_doc_id = p.id
  AND i.color = ''
  AND i.pattern = '';

-- Rows with no matching product (orphans) keep colour='' / pattern='' and are
-- reported by the verification query in section 4 rather than silently altered.

-- Backfill a readable variant SKU where we can build one.
UPDATE public.inventory
SET variant_sku = UPPER(
      CONCAT_WS('-',
        NULLIF(TRIM(sku), ''),
        NULLIF(REGEXP_REPLACE(color,   '[^A-Za-z0-9]+', '', 'g'), ''),
        NULLIF(REGEXP_REPLACE(pattern, '[^A-Za-z0-9]+', '', 'g'), ''),
        NULLIF(REGEXP_REPLACE(size,    '[^A-Za-z0-9]+', '', 'g'), '')
      )
    )
WHERE variant_sku IS NULL
  AND COALESCE(TRIM(sku), '') <> '';


-- ── 3. Uniqueness: one row per (product, size, colour, pattern) ─────────────
--
-- IMPORTANT: inspect the existing constraint name first. The statement below
-- assumes `inventory_product_doc_id_size_key`; adjust to whatever
--   \d public.inventory
-- actually reports. Dropping a constraint that does not exist is a no-op with
-- IF EXISTS, but the OLD constraint MUST be gone or the new dimensions cannot
-- be used (a second colourway in the same size would be rejected).

ALTER TABLE public.inventory
  DROP CONSTRAINT IF EXISTS inventory_product_doc_id_size_key;

-- Partial index: soft-deleted rows are excluded so archiving a variant and
-- re-creating it later does not collide.
CREATE UNIQUE INDEX IF NOT EXISTS inventory_variant_unique
  ON public.inventory (product_doc_id, size, color, pattern)
  WHERE deleted = false;

-- Supports the per-product variant matrix read path.
CREATE INDEX IF NOT EXISTS inventory_product_variant_lookup
  ON public.inventory (product_doc_id, deleted);


-- ── 4. VERIFICATION — run BEFORE COMMIT ────────────────────────────────────
--
-- 4a. Stock totals must be identical to the pre-migration values. Capture the
--     "before" numbers by running this same query prior to the migration and
--     diffing the two outputs. Any row that differs is a blocking failure.

--   SELECT product_doc_id,
--          SUM(total)     AS total_units,
--          SUM(reserved)  AS reserved_units,
--          SUM(available) AS available_units,
--          COUNT(*)       AS variant_rows
--   FROM public.inventory
--   WHERE deleted = false
--   GROUP BY product_doc_id
--   ORDER BY product_doc_id;

-- 4b. Expect 0 rows — any duplicate would have blocked the unique index.

--   SELECT product_doc_id, size, color, pattern, COUNT(*)
--   FROM public.inventory
--   WHERE deleted = false
--   GROUP BY product_doc_id, size, color, pattern
--   HAVING COUNT(*) > 1;

-- 4c. Orphaned inventory rows (no parent product). Expect 0. These are not
--     touched by the backfill and need a human decision.

--   SELECT i.id, i.sku, i.item, i.size
--   FROM public.inventory i
--   LEFT JOIN public.products p ON p.id = i.product_doc_id
--   WHERE p.id IS NULL AND i.deleted = false;

-- 4d. Rows the backfill could not resolve to a colour. Review before shipping
--     the variant UI; they will show as "no colourway" in the matrix.

--   SELECT COUNT(*) AS rows_without_colour
--   FROM public.inventory
--   WHERE deleted = false AND color = '';

COMMIT;


-- ============================================================================
-- 5. ROLLBACK
--
-- Safe to run at any point after the migration: it removes only the objects
-- this migration created. No quantity is touched, so no stock can be lost by
-- rolling back.
-- ============================================================================

-- BEGIN;
--
-- DROP INDEX IF EXISTS public.inventory_variant_unique;
-- DROP INDEX IF EXISTS public.inventory_product_variant_lookup;
--
-- ALTER TABLE public.inventory
--   DROP COLUMN IF EXISTS color,
--   DROP COLUMN IF EXISTS pattern,
--   DROP COLUMN IF EXISTS variant_sku;
--
-- -- Restore the original one-row-per-size constraint. Only succeeds if no
-- -- product has since gained a second colourway in the same size; if it
-- -- fails, those extra variants must be merged or archived first.
-- ALTER TABLE public.inventory
--   ADD CONSTRAINT inventory_product_doc_id_size_key
--   UNIQUE (product_doc_id, size);
--
-- COMMIT;


-- ============================================================================
-- 6. FOLLOW-UP — reservations (SEPARATE migration, do not bundle)
--
-- recalculateAllInventoryStock() in src/services/productService.js matches
-- reservations to inventory rows on size alone. Once two variants share a
-- size that match is ambiguous and will mis-assign reserved stock. Before any
-- product is given a second colourway in the same size, reservations need:
--
--   ALTER TABLE public.reservations
--     ADD COLUMN IF NOT EXISTS variant_id uuid REFERENCES public.inventory(id),
--     ADD COLUMN IF NOT EXISTS color   text NOT NULL DEFAULT '',
--     ADD COLUMN IF NOT EXISTS pattern text NOT NULL DEFAULT '';
--
-- plus a backfill linking each existing reservation to the single matching
-- variant for its (product, size) — unambiguous only while one variant per
-- size still exists, so this must land BEFORE the variant matrix UI is
-- enabled for staff.
-- ============================================================================
