-- Rollback Migration: 20260908150000_inventory_grant_revocation.rollback.sql
-- Description: Restores pre-Migration-B grants and legacy adjust_inventory_stock compatibility RPC.

-- ── 1. Restore Legacy Clamping Function ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.adjust_inventory_stock(
  p_inventory_id uuid,
  p_total_delta integer DEFAULT 0,
  p_available_delta integer DEFAULT 0,
  p_reserved_delta integer DEFAULT 0
)
RETURNS TABLE(
  prev_total integer,
  prev_available integer,
  prev_reserved integer,
  new_total integer,
  new_available integer,
  new_reserved integer,
  out_product_doc_id uuid
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_before public.inventory%rowtype;
  v_after public.inventory%rowtype;
BEGIN
  IF NOT public.is_staff_or_admin() THEN
    RAISE EXCEPTION 'Staff access required.';
  END IF;

  SELECT * INTO v_before FROM public.inventory WHERE id = p_inventory_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventory row % not found.', p_inventory_id;
  END IF;

  UPDATE public.inventory
  SET total = GREATEST(0, total + p_total_delta),
      available = GREATEST(0, available + p_available_delta),
      reserved = GREATEST(0, reserved + p_reserved_delta),
      updated_at = now()
  WHERE id = p_inventory_id
  RETURNING * INTO v_after;

  RETURN QUERY SELECT v_before.total, v_before.available, v_before.reserved,
                      v_after.total, v_after.available, v_after.reserved,
                      v_after.product_doc_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.adjust_inventory_stock(uuid, integer, integer, integer) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.adjust_inventory_stock(uuid, integer, integer, integer) FROM anon, PUBLIC;

-- ── 2. Restore stock_movements Direct Client INSERT ────────────────────────────

GRANT INSERT, UPDATE, DELETE ON public.stock_movements TO authenticated, anon;

-- ── 3. Restore inventory Table-Level UPDATE ────────────────────────────────────

-- Revoke specific column-level grant
REVOKE UPDATE (
  item,
  category,
  sku,
  variant_sku,
  demand_score,
  stock_tier,
  adjusted_score,
  demand_scored_at,
  updated_at
) ON public.inventory FROM authenticated;

-- Restore broad table-level UPDATE
GRANT UPDATE ON public.inventory TO authenticated, anon;
