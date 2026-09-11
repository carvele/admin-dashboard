-- Rollback: 20260908140000_inventory_command_boundary.rollback.sql
-- Description: Revert Phase B3 Migration A changes.

-- 1. Re-grant revoked table privileges
GRANT TRUNCATE, REFERENCES, TRIGGER ON TABLE public.inventory, public.products, public.reservations, public.stock_movements TO anon, authenticated;

-- 2. Revoke execute privileges on new functions
REVOKE EXECUTE ON FUNCTION public.recalculate_inventory_stock() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.set_inventory_archive_state(uuid, boolean, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.set_inventory_baseline(uuid, integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.adjust_inventory_on_hand(uuid, integer, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.record_boutique_sale(uuid, integer, numeric) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.can_manage_inventory() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.can_operate_inventory() FROM authenticated;

-- 3. Drop new RPCs
DROP FUNCTION IF EXISTS public.set_inventory_archive_state(uuid, boolean, text);
DROP FUNCTION IF EXISTS public.set_inventory_baseline(uuid, integer);
DROP FUNCTION IF EXISTS public.adjust_inventory_on_hand(uuid, integer, text);
DROP FUNCTION IF EXISTS public.record_boutique_sale(uuid, integer, numeric);
DROP FUNCTION IF EXISTS public.can_manage_inventory();
DROP FUNCTION IF EXISTS public.can_operate_inventory();

-- 4. Restore legacy 5-parameter record_boutique_sale RPC
CREATE OR REPLACE FUNCTION public.record_boutique_sale(
  p_inventory_id uuid,
  p_quantity integer,
  p_sale_price numeric DEFAULT 0,
  p_staff_id uuid DEFAULT NULL::uuid,
  p_staff_name text DEFAULT 'Staff'::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_inv        public.inventory%rowtype;
  v_prev_total integer;
  v_new_total  integer;
  v_now        timestamptz := now();
BEGIN
  IF NOT public.is_staff_or_admin() THEN
    RAISE EXCEPTION 'Staff access required.';
  END IF;

  IF p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be positive.';
  END IF;

  SELECT * INTO v_inv FROM public.inventory WHERE id = p_inventory_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventory row % not found.', p_inventory_id;
  END IF;

  IF COALESCE(v_inv.available, 0) < p_quantity THEN
    RAISE EXCEPTION 'Insufficient stock: % available, % requested.',
      COALESCE(v_inv.available, 0), p_quantity;
  END IF;

  v_prev_total := COALESCE(v_inv.total, 0);
  v_new_total  := v_prev_total - p_quantity;

  UPDATE public.inventory
  SET total     = v_new_total,
      available = GREATEST(0, COALESCE(available, 0) - p_quantity),
      updated_at = v_now
  WHERE id = p_inventory_id;

  INSERT INTO public.stock_movements (
    product_id, previous_stock, new_stock, delta, change_type, note
  ) VALUES (
    v_inv.product_doc_id, v_prev_total, v_new_total, -p_quantity, 'sale',
    format('Walk-in sale: %s× %s (size %s)', p_quantity, v_inv.item, v_inv.size)
  );

  INSERT INTO public.reservations (
    product_id, product_name, size, color, quantity, rental_price, status,
    customer_name, staff_id, hidden_in_history, deleted, created_at, updated_at
  ) VALUES (
    v_inv.product_doc_id, v_inv.item, v_inv.size, COALESCE(v_inv.color, ''),
    p_quantity, p_sale_price, 'Completed', 'Walk-in Customer', p_staff_id, false, false, v_now, v_now
  );

  INSERT INTO public.logs (
    user_id, user_name, action, target_type, target_id, details, timestamp
  ) VALUES (
    p_staff_id, p_staff_name, 'Recorded In-Store Sale', 'product', v_inv.product_doc_id::text,
    jsonb_build_object(
      'itemName', v_inv.item, 'size', v_inv.size, 'color', COALESCE(v_inv.color, ''),
      'quantitySold', p_quantity, 'salePrice', p_sale_price
    ), v_now
  );

  RETURN jsonb_build_object('prevTotal', v_prev_total, 'newTotal', v_new_total, 'success', true);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.record_boutique_sale(uuid, integer, numeric, uuid, text) TO authenticated;

-- 5. Restore legacy recalculate_inventory_stock RPC
CREATE OR REPLACE FUNCTION public.recalculate_inventory_stock()
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_inventory_count integer;
  v_product_count   integer;
BEGIN
  IF NOT public.is_staff_or_admin() THEN
    RAISE EXCEPTION 'staff role required';
  END IF;

  WITH calculated AS (
    SELECT i.id,
           COALESCE(SUM(r.quantity), 0)::integer AS reserved
    FROM public.inventory i
    LEFT JOIN public.reservations r
      ON (r.product_id = i.product_doc_id
          OR r.product_id::text = i.sku
          OR r.product_name = i.item)
      AND r.size = i.size
      AND COALESCE(r.color, '') = COALESCE(i.color, '')
      AND r.status IN ('Approved','Confirmed','To Pay','Preparing','To Pickup','Fitting','Active','Ready')
    WHERE COALESCE(i.deleted, false) = false
    GROUP BY i.id
  ), updated AS (
    UPDATE public.inventory i
       SET reserved   = c.reserved,
           available  = GREATEST(0, COALESCE(i.total, 0) - c.reserved),
           updated_at = now()
      FROM calculated c
     WHERE i.id = c.id
    RETURNING i.id
  )
  SELECT count(*) INTO v_inventory_count FROM updated;

  WITH totals AS (
    SELECT i.product_doc_id,
           COALESCE(SUM(i.available), 0)::integer AS available,
           COALESCE(SUM(i.reserved),  0)::integer AS reserved
      FROM public.inventory i
     WHERE COALESCE(i.deleted, false) = false
       AND i.product_doc_id IS NOT NULL
     GROUP BY i.product_doc_id
  ), updated AS (
    UPDATE public.products p
       SET stock = t.available,
           status = CASE
             WHEN t.available <= 0 THEN
               CASE WHEN t.reserved > 0 THEN 'Reserved' ELSE 'Out of Stock' END
             ELSE 'In Boutique'
           END,
           updated_at = now()
      FROM totals t
     WHERE p.id = t.product_doc_id
    RETURNING p.id
  )
  SELECT count(*) INTO v_product_count FROM updated;

  RETURN jsonb_build_object('inventory_rows', v_inventory_count, 'products', v_product_count);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.recalculate_inventory_stock() TO authenticated;

-- 6. Restore original notify_admin_on_reservation trigger function
CREATE OR REPLACE FUNCTION public.notify_admin_on_reservation()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    v_customer_name TEXT;
BEGIN
    SELECT COALESCE(full_name, 'A customer') INTO v_customer_name FROM public.profiles WHERE id = NEW.customer_id;
    
    INSERT INTO public.admin_notifications (title, message, type)
    VALUES (
        'New Reservation',
        v_customer_name || ' placed a new reservation for ' || COALESCE(NEW.product_name, 'an item') || '.',
        'Reservation'
    );
    RETURN NEW;
END;
$function$;

-- 7. Remove structured variant ledger linkage from stock_movements
DROP INDEX IF EXISTS public.idx_stock_movements_inventory_id;
ALTER TABLE public.stock_movements DROP COLUMN IF EXISTS inventory_id;
