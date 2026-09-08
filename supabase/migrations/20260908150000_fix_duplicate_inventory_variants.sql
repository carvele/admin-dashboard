-- Migration: Fix duplicate inventory variants and prevent recurrence
--
-- Root cause: inventory's natural key is (product_doc_id, size, color, pattern),
-- but the Inventory list view groups and displays swatches by (size, color)
-- ALONE, ignoring pattern. The original seed data stamps pattern='Solid' on
-- every row; the manual "add a color" flow in variantService.js's
-- createVariant() inserts new rows with pattern='' and does no existence
-- check of its own (the doc comment on buildVariantMatrix says the CALLER is
-- responsible for that check, but nothing enforced it at the DB level). So
-- adding a color that already existed under the seed's pattern='Solid'
-- silently created a second, empty (total=0, sku='') row for the SAME
-- (product,size,color) that the list view then renders as a duplicate swatch.
--
-- Confirmed live: every one of 14 duplicate (product,size,color) groups across
-- 3 different products has exactly this ["", "Solid"] pattern pair, with the
-- ""-pattern row always sku='' and total=0 (junk) and the "Solid" row always
-- holding the real stock. No product anywhere uses pattern as a genuine second
-- axis -- this is a pure accidental collision, not a case with legitimate
-- same-color/different-pattern variants to preserve.

-- ── 1. Clean up existing junk duplicates ───────────────────────────────────
-- Soft-delete (matches this table's existing deleted/deleted_at convention,
-- reversible unlike a hard delete) only rows that exactly match the junk
-- signature AND have a real, stocked sibling for the same variant -- never
-- touches a legitimate solo blank-pattern row that has no duplicate.
UPDATE public.inventory dup
SET deleted = true,
    deleted_at = now(),
    updated_at = now()
WHERE dup.deleted = false
  AND dup.pattern = ''
  AND dup.sku = ''
  AND dup.total = 0
  AND EXISTS (
    SELECT 1 FROM public.inventory keeper
    WHERE keeper.id <> dup.id
      AND keeper.product_doc_id = dup.product_doc_id
      AND keeper.size = dup.size
      AND keeper.color = dup.color
      AND keeper.deleted = false
  );

-- ── 2. Prevent recurrence at the schema level ──────────────────────────────
-- (product_doc_id, size, color) is the key the UI actually treats as unique
-- (that's what the list view groups by), so this is the correct invariant to
-- enforce -- not (product_doc_id, size, color, pattern), which would just let
-- the same collision happen again with a different pattern value. Partial
-- index scoped to deleted=false so a soft-deleted/archived variant never
-- blocks re-adding the same color later.
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_unique_active_variant
ON public.inventory (product_doc_id, size, color)
WHERE deleted = false;
