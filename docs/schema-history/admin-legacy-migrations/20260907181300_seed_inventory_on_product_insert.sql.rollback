-- Rollback: 20260907181300_seed_inventory_on_product_insert.sql
-- Removes the trigger and function. Does NOT remove the backfilled rows
-- (reversing a data backfill is destructive and must be done manually).

DROP TRIGGER IF EXISTS trg_seed_inventory_on_product_insert ON public.products;
DROP FUNCTION IF EXISTS public.seed_inventory_for_new_product();
