-- ============================================================================
-- ADD products.category_id FK -> categories.id
-- ============================================================================
-- Context: products.category / products.sub_category are denormalized text,
-- matched against categories.name by string equality. This drifts silently —
-- live data already has 2 products whose category text doesn't match any row
-- in categories ("Ball Gowns"/"Classic Ball Gowns", "Cocktail & Party"/
-- "Mini Dresses"), and one near-miss ("Bottoms"/"Pants" vs the real
-- "Pants / Trousers" subcategory).
--
-- This adds a real FK, backfills it via best-effort name matching (fixing the
-- near-miss), and leaves it NULL for the 2 products with no matching taxonomy
-- — the UI treats NULL as "Uncategorized" rather than guessing a new category.
-- The old text columns are kept (for display fallback / to avoid a breaking
-- change to product forms in the same migration); category_id is what the new
-- hierarchy UI groups by.
--
-- IDEMPOTENT: safe to re-run.
-- ============================================================================

BEGIN;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL;

-- Backfill: match sub_category text to a categories row by exact name.
UPDATE public.products p
SET category_id = c.id
FROM public.categories c
WHERE p.category_id IS NULL
  AND p.deleted = false
  AND c.name = p.sub_category;

-- Known near-miss: "Pants" (product text) vs "Pants / Trousers" (taxonomy).
UPDATE public.products p
SET category_id = c.id
FROM public.categories c
WHERE p.category_id IS NULL
  AND p.deleted = false
  AND p.sub_category = 'Pants'
  AND c.name = 'Pants / Trousers';

CREATE INDEX IF NOT EXISTS idx_products_category_id ON public.products(category_id);

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════
-- ROLLBACK:
-- ALTER TABLE public.products DROP COLUMN IF EXISTS category_id;
-- ═════════════════════════════════════════════════════════════════════════
