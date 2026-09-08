-- Rollback for 20260908150000_fix_duplicate_inventory_variants.sql.
-- Drops the uniqueness guard. Does NOT un-delete the cleaned-up junk rows --
-- restoring known-empty (total=0, sku='') duplicate rows serves no purpose.

DROP INDEX IF EXISTS public.idx_inventory_unique_active_variant;
