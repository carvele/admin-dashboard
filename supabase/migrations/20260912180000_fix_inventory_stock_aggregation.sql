-- ============================================================================
-- Migration: Fix Inventory Stock Aggregation (INV-001)
--
-- Objective:
-- The `adjust_inventory_on_hand` and `record_boutique_sale` RPCs mutate
-- inventory rows directly but fail to recalculate the parent `products.stock`
-- and `products.status`. This leaves the UI/UX in a stale state until a
-- manual sync is triggered. This migration adds a trigger to auto-sync.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trigger_sync_product_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_product_id uuid;
  v_available  integer;
  v_reserved   integer;
  v_status     text;
BEGIN
  -- Determine the product ID being affected
  IF TG_OP = 'DELETE' THEN
    v_product_id := OLD.product_doc_id;
  ELSE
    v_product_id := NEW.product_doc_id;
  END IF;

  IF v_product_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Aggregate the current totals for this product
  SELECT COALESCE(SUM(i.available), 0)::integer,
         COALESCE(SUM(i.reserved), 0)::integer
  INTO v_available, v_reserved
  FROM public.inventory i
  WHERE i.product_doc_id = v_product_id
    AND COALESCE(i.deleted, false) = false;

  -- Determine new status
  IF v_available <= 0 THEN
    IF v_reserved > 0 THEN
      v_status := 'Reserved';
    ELSE
      v_status := 'Out of Stock';
    END IF;
  ELSE
    v_status := 'In Boutique';
  END IF;

  -- Update the product
  UPDATE public.products
  SET stock = v_available,
      status = v_status,
      updated_at = now()
  WHERE id = v_product_id
    AND (stock IS DISTINCT FROM v_available OR status IS DISTINCT FROM v_status);

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_product_stock ON public.inventory;

CREATE TRIGGER trg_sync_product_stock
AFTER INSERT OR UPDATE OF total, available, reserved, deleted OR DELETE
ON public.inventory
FOR EACH ROW
EXECUTE FUNCTION public.trigger_sync_product_stock();
