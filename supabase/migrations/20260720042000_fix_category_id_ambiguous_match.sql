-- ============================================================================
-- FIX: category_id backfill matched a TOP-LEVEL category instead of its subcategory
-- ============================================================================
-- Context: the "Dresses" top-level category has a subcategory also named
-- "Dresses" (top-level "Dresses" > subcategory "Dresses"). The backfill in
-- 20260720040000 matched products.sub_category to categories.name without
-- requiring parent_id IS NOT NULL, so "Little Black Ribbed Dress" and
-- "Floral Summer Midi Dress" (sub_category = 'Dresses') got category_id set
-- to the TOP-LEVEL row instead of the subcategory row. Since the inventory
-- hierarchy UI groups by matching category_id against subcategory ids only,
-- these 2 products (7 inventory rows) silently vanished from every group.
--
-- This repoints category_id to the correct subcategory (parent_id IS NOT NULL)
-- for any product where it was set to a top-level category by mistake.
--
-- IDEMPOTENT: only touches rows where category_id currently points at a
-- top-level (parent_id IS NULL) category.
-- ============================================================================

BEGIN;

UPDATE public.products p
SET category_id = sub.id
FROM public.categories wrong, public.categories sub
WHERE p.category_id = wrong.id
  AND wrong.parent_id IS NULL          -- currently pointing at a top-level row
  AND sub.parent_id IS NOT NULL        -- the correct target is a subcategory
  AND sub.name = p.sub_category
  AND sub.parent_id = wrong.id;        -- under the same top-level category

COMMIT;
