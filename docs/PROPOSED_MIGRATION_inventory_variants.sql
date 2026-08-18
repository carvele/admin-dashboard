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
--
-- BEFORE YOU RUN BEGIN BELOW: run the 4a query once now, in its own
-- statement, and save the output. By the time you reach section 4 you are
-- already inside the transaction that made the change, so this is the only
-- chance to capture genuine "before" numbers to diff against.
--
--   SELECT product_doc_id, SUM(total) AS total_units,
--          SUM(reserved) AS reserved_units, SUM(available) AS available_units,
--          COUNT(*) AS variant_rows
--   FROM public.inventory WHERE deleted = false
--   GROUP BY product_doc_id ORDER BY product_doc_id;
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
-- products.color is a comma-joined list, so base_color (the primary colour)
-- is the correct single value to adopt here.
--
-- COLUMN NAME WARNING: the app's generic write path (addDocument /
-- updateDocument in src/lib/supabaseService.js) runs every payload through a
-- camelCase -> snake_case converter before it reaches Postgres, so the JS
-- field `baseColor` is stored as `base_color`. This is NOT universal, though:
-- `stockbaseline` on `products` is a documented exception (see the comment on
-- updateStockBaseline in src/services/inventoryService.js) that bypasses the
-- converter and lives as one lowercase word. Do not assume either convention
-- for a column you have not confirmed — run
--   SELECT column_name FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='products'
--   ORDER BY column_name;
-- and adjust `base_color` below if it disagrees. Silently matching zero rows
-- here would backfill every variant to '' instead of erroring, so section 2a
-- checks the column exists before proceeding.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'base_color'
  ) THEN
    RAISE EXCEPTION
      'Expected public.products.base_color — run the information_schema query above and fix the column name in this migration before proceeding.';
  END IF;
END $$;

UPDATE public.inventory AS i
SET color   = COALESCE(NULLIF(TRIM(p.base_color), ''), ''),
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
-- The old one-row-per-(product, size) constraint has to go, or it keeps
-- silently enforcing itself alongside the new index below: a second
-- colourway in an already-used size would still get rejected, just by a
-- constraint nobody's looking for anymore.
--
-- A hardcoded `DROP CONSTRAINT IF EXISTS <guessed name>` is exactly how that
-- would happen — guess wrong and IF EXISTS makes it a silent no-op, so the
-- migration reports success while the real constraint is still live. This
-- looks the constraint up by what it actually enforces (a unique index on
-- exactly (product_doc_id, size)) instead of by a name anyone assumed.

DO $$
DECLARE
  old_constraint text;
BEGIN
  SELECT con.conname INTO old_constraint
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace ns ON ns.oid = rel.relnamespace
  WHERE ns.nspname = 'public'
    AND rel.relname = 'inventory'
    AND con.contype = 'u'
    AND (
      SELECT array_agg(attname ORDER BY attname)
      FROM unnest(con.conkey) AS k(attnum)
      JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum
    ) = ARRAY['product_doc_id', 'size']::text[];

  IF old_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.inventory DROP CONSTRAINT %I', old_constraint);
    RAISE NOTICE 'Dropped old unique constraint: %', old_constraint;
  ELSE
    RAISE NOTICE 'No (product_doc_id, size) unique CONSTRAINT found. Checking for a bare unique INDEX (no owning constraint) next.';
  END IF;
END $$;

-- A unique constraint always has a backing index, but Postgres also allows a
-- bare `CREATE UNIQUE INDEX` with no constraint behind it — the block above
-- would not see one of those. Catch that case too, the same way: by what it
-- enforces, not by an assumed name.
DO $$
DECLARE
  old_index text;
BEGIN
  SELECT ic.relname INTO old_index
  FROM pg_index idx
  JOIN pg_class rel ON rel.oid = idx.indrelid
  JOIN pg_class ic ON ic.oid = idx.indexrelid
  JOIN pg_namespace ns ON ns.oid = rel.relnamespace
  WHERE ns.nspname = 'public'
    AND rel.relname = 'inventory'
    AND idx.indisunique
    AND NOT EXISTS ( -- already-handled constraint-backed indexes
      SELECT 1 FROM pg_constraint c WHERE c.conindid = idx.indexrelid
    )
    AND (
      SELECT array_agg(attname ORDER BY attname)
      FROM unnest(idx.indkey) AS k(attnum)
      JOIN pg_attribute a ON a.attrelid = idx.indrelid AND a.attnum = k.attnum
    ) = ARRAY['product_doc_id', 'size']::text[];

  IF old_index IS NOT NULL THEN
    EXECUTE format('DROP INDEX public.%I', old_index);
    RAISE NOTICE 'Dropped old unique index: %', old_index;
  ELSE
    RAISE NOTICE 'No bare (product_doc_id, size) unique index found either. If you know one exists under a name this could not find, drop it manually before continuing.';
  END IF;
END $$;

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
