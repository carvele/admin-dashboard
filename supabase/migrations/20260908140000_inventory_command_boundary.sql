-- Migration: 20260908140000_inventory_command_boundary.sql
-- Description: Phase B3 Migration A - Establish authoritative stock invariants,
--              dual capability predicates (can_operate_inventory, can_manage_inventory),
--              hardened atomic record_boutique_sale RPC, adjust_inventory_on_hand RPC,
--              set_inventory_baseline RPC, set_inventory_archive_state RPC with hold safety,
--              hardened recalculate_inventory_stock RPC, structured inventory_id on stock_movements,
--              reservation notification trigger null-guard for walk-in sales,
--              and revocation of dangerous table privileges (TRUNCATE, REFERENCES, TRIGGER).

-- ── 1. Structured Variant Ledger Linkage ───────────────────────────────────────

ALTER TABLE public.stock_movements
ADD COLUMN IF NOT EXISTS inventory_id uuid REFERENCES public.inventory(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_stock_movements_inventory_id
ON public.stock_movements(inventory_id);

-- ── 2. Dual Capability Predicates ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.can_operate_inventory()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles AS p
    WHERE p.id = auth.uid()
      AND p.role IN ('staff', 'admin', 'owner')
      AND p.deleted = false
      AND p.is_blocked = false
      AND p.employment_status = 'active'
      AND (
        p.role = 'owner'
        OR public.is_device_approved()
      )
  );
$function$;

CREATE OR REPLACE FUNCTION public.can_manage_inventory()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles AS p
    WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'owner')
      AND p.deleted = false
      AND p.is_blocked = false
      AND p.employment_status = 'active'
      AND (
        p.role = 'owner'
        OR public.is_device_approved()
      )
  );
$function$;

-- ── 3. Hardened Atomic Walk-in Sale RPC ────────────────────────────────────────

-- Explicitly drop legacy 5-parameter signature with caller-supplied identity
DROP FUNCTION IF EXISTS public.record_boutique_sale(uuid, integer, numeric, uuid, text);

CREATE OR REPLACE FUNCTION public.record_boutique_sale(
  p_inventory_id uuid,
  p_quantity integer,
  p_sale_price numeric DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_actor      uuid := auth.uid();
  v_actor_name text;
  v_inv        public.inventory%rowtype;
  v_prev_total integer;
  v_new_total  integer;
  v_prev_avail integer;
  v_new_avail  integer;
  v_now        timestamptz := now();
  v_res_id     uuid;
BEGIN
  IF NOT public.can_operate_inventory() THEN
    RAISE EXCEPTION 'Inventory operational access required.' USING ERRCODE = '42501';
  END IF;

  IF p_inventory_id IS NULL THEN
    RAISE EXCEPTION 'Inventory ID is required.';
  END IF;

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be a positive integer.';
  END IF;

  IF p_sale_price IS NULL OR p_sale_price < 0 THEN
    RAISE EXCEPTION 'Sale price must be non-negative.';
  END IF;

  SELECT coalesce(nullif(trim(concat_ws(' ', first_name, last_name)), ''), email, 'Staff')
  INTO v_actor_name
  FROM public.profiles
  WHERE id = v_actor;

  SELECT * INTO v_inv
  FROM public.inventory
  WHERE id = p_inventory_id AND deleted = false
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active inventory variant % not found.', p_inventory_id;
  END IF;

  IF coalesce(v_inv.available, 0) < p_quantity THEN
    RAISE EXCEPTION 'Insufficient stock: % available, % requested.',
      coalesce(v_inv.available, 0), p_quantity;
  END IF;

  v_prev_total := coalesce(v_inv.total, 0);
  v_new_total  := v_prev_total - p_quantity;
  v_prev_avail := coalesce(v_inv.available, 0);
  v_new_avail  := v_prev_avail - p_quantity;

  UPDATE public.inventory
  SET total      = v_new_total,
      available  = v_new_avail,
      updated_at = v_now
  WHERE id = p_inventory_id;

  INSERT INTO public.stock_movements (
    product_id, inventory_id, previous_stock, new_stock, delta, change_type, note, created_at, updated_at
  ) VALUES (
    v_inv.product_doc_id, v_inv.id, v_prev_total, v_new_total, -p_quantity, 'sale',
    format('Walk-in sale: %s× %s (size %s)', p_quantity, coalesce(v_inv.item, 'Item'), coalesce(v_inv.size, '')),
    v_now, v_now
  );

  INSERT INTO public.reservations (
    product_id, product_name, size, color, quantity, rental_price, status,
    customer_name, staff_id, hidden_in_history, deleted, created_at, updated_at
  ) VALUES (
    v_inv.product_doc_id, v_inv.item, v_inv.size, coalesce(v_inv.color, ''),
    p_quantity, p_sale_price, 'Completed', 'Walk-in Customer', v_actor,
    false, false, v_now, v_now
  ) RETURNING id INTO v_res_id;

  INSERT INTO public.logs (
    user_id, user_name, action, target_type, target_id, details, timestamp
  ) VALUES (
    v_actor, coalesce(v_actor_name, 'Staff'), 'Recorded In-Store Sale', 'product', v_inv.product_doc_id::text,
    jsonb_build_object(
      'inventoryId', v_inv.id,
      'reservationId', v_res_id,
      'itemName', v_inv.item,
      'size', v_inv.size,
      'color', coalesce(v_inv.color, ''),
      'quantitySold', p_quantity,
      'salePrice', p_sale_price
    ),
    v_now
  );

  RETURN jsonb_build_object(
    'success', true,
    'reservationId', v_res_id,
    'inventoryId', v_inv.id,
    'prevTotal', v_prev_total,
    'newTotal', v_new_total,
    'prevAvailable', v_prev_avail,
    'newAvailable', v_new_avail
  );
END;
$function$;

-- ── 3.1. Reservation Notification Trigger NULL-Guard ─────────────────────────

-- Walk-in sales set customer_name = 'Walk-in Customer' with customer_id = NULL.
-- The existing notify_admin_on_reservation trigger fails if customer_id lookup returns NULL,
-- causing NULL || '...' = NULL which violates admin_notifications.message NOT NULL constraint.
CREATE OR REPLACE FUNCTION public.notify_admin_on_reservation()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_customer_name text;
BEGIN
  SELECT COALESCE(full_name, 'A customer')
  INTO v_customer_name
  FROM public.profiles
  WHERE id = NEW.customer_id;

  -- Fall back to the stored customer_name when customer_id is absent (e.g. walk-in sales).
  v_customer_name := COALESCE(v_customer_name, NEW.customer_name, 'A customer');

  INSERT INTO public.admin_notifications (title, message, type)
  VALUES (
    'New Reservation',
    v_customer_name || ' placed a new reservation for ' || COALESCE(NEW.product_name, 'an item') || '.',
    'Reservation'
  );

  RETURN NEW;
END;
$function$;

-- ── 4. Business-Level Stock Adjustment RPC ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.adjust_inventory_on_hand(
  p_inventory_id uuid,
  p_delta integer,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_actor        uuid := auth.uid();
  v_actor_name   text;
  v_inv          public.inventory%rowtype;
  v_prev_total   integer;
  v_new_total    integer;
  v_prev_avail   integer;
  v_new_avail    integer;
  v_change_type  text;
  v_clean_reason text;
  v_now          timestamptz := now();
BEGIN
  IF NOT public.can_operate_inventory() THEN
    RAISE EXCEPTION 'Inventory operational access required.' USING ERRCODE = '42501';
  END IF;

  IF p_inventory_id IS NULL THEN
    RAISE EXCEPTION 'Inventory ID is required.';
  END IF;

  IF p_delta IS NULL OR p_delta = 0 THEN
    RAISE EXCEPTION 'Delta must be a non-zero integer.';
  END IF;

  v_clean_reason := trim(coalesce(p_reason, ''));
  IF v_clean_reason = '' THEN
    RAISE EXCEPTION 'Reason is required for inventory adjustment.';
  END IF;

  IF length(v_clean_reason) > 255 THEN
    RAISE EXCEPTION 'Reason cannot exceed 255 characters.';
  END IF;

  SELECT coalesce(nullif(trim(concat_ws(' ', first_name, last_name)), ''), email, 'Staff')
  INTO v_actor_name
  FROM public.profiles
  WHERE id = v_actor;

  SELECT * INTO v_inv
  FROM public.inventory
  WHERE id = p_inventory_id AND deleted = false
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active inventory variant % not found.', p_inventory_id;
  END IF;

  v_prev_total := coalesce(v_inv.total, 0);
  v_new_total  := v_prev_total + p_delta;
  v_prev_avail := coalesce(v_inv.available, 0);
  v_new_avail  := v_new_total - coalesce(v_inv.reserved, 0);

  IF v_new_total < 0 THEN
    RAISE EXCEPTION 'Cannot reduce total inventory below 0 (current: %, delta: %).',
      v_prev_total, p_delta;
  END IF;

  IF v_new_avail < 0 THEN
    RAISE EXCEPTION 'Cannot adjust stock below active reservation holds (current total: %, reserved: %, requested delta: %).',
      v_prev_total, coalesce(v_inv.reserved, 0), p_delta;
  END IF;

  v_change_type := CASE WHEN p_delta > 0 THEN 'restock' ELSE 'manual_adjustment' END;

  UPDATE public.inventory
  SET total      = v_new_total,
      available  = v_new_avail,
      updated_at = v_now
  WHERE id = p_inventory_id;

  INSERT INTO public.stock_movements (
    product_id, inventory_id, previous_stock, new_stock, delta, change_type, note, created_at, updated_at
  ) VALUES (
    v_inv.product_doc_id, v_inv.id, v_prev_total, v_new_total, p_delta, v_change_type,
    format('%s: %s units of %s (size %s) - %s',
      initcap(v_change_type), abs(p_delta), coalesce(v_inv.item, 'item'), coalesce(v_inv.size, ''), v_clean_reason),
    v_now, v_now
  );

  INSERT INTO public.logs (
    user_id, user_name, action, target_type, target_id, details, timestamp
  ) VALUES (
    v_actor, coalesce(v_actor_name, 'Staff'), 'Adjusted Inventory On Hand', 'product', v_inv.product_doc_id::text,
    jsonb_build_object(
      'inventoryId', v_inv.id,
      'itemName', v_inv.item,
      'size', v_inv.size,
      'color', coalesce(v_inv.color, ''),
      'delta', p_delta,
      'changeType', v_change_type,
      'prevTotal', v_prev_total,
      'newTotal', v_new_total,
      'reason', v_clean_reason
    ),
    v_now
  );

  RETURN jsonb_build_object(
    'success', true,
    'inventoryId', v_inv.id,
    'prevTotal', v_prev_total,
    'newTotal', v_new_total,
    'prevAvailable', v_prev_avail,
    'newAvailable', v_new_avail,
    'changeType', v_change_type
  );
END;
$function$;

-- ── 5. Administrative Control RPCs ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_inventory_baseline(
  p_product_id uuid,
  p_baseline integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_actor         uuid := auth.uid();
  v_actor_name    text;
  v_prod          public.products%rowtype;
  v_prev_baseline integer;
  v_now           timestamptz := now();
BEGIN
  IF NOT public.can_manage_inventory() THEN
    RAISE EXCEPTION 'Inventory management access required.' USING ERRCODE = '42501';
  END IF;

  IF p_product_id IS NULL THEN
    RAISE EXCEPTION 'Product ID is required.';
  END IF;

  IF p_baseline IS NULL OR p_baseline < 0 THEN
    RAISE EXCEPTION 'Baseline must be a non-negative integer.';
  END IF;

  SELECT coalesce(nullif(trim(concat_ws(' ', first_name, last_name)), ''), email, 'Administrator')
  INTO v_actor_name
  FROM public.profiles
  WHERE id = v_actor;

  SELECT * INTO v_prod
  FROM public.products
  WHERE id = p_product_id AND deleted = false
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active product % not found.', p_product_id;
  END IF;

  v_prev_baseline := v_prod.stockbaseline;

  IF v_prev_baseline IS NOT DISTINCT FROM p_baseline THEN
    RETURN jsonb_build_object('success', true, 'productId', p_product_id, 'baseline', p_baseline, 'changed', false);
  END IF;

  UPDATE public.products
  SET stockbaseline = p_baseline,
      updated_at    = v_now
  WHERE id = p_product_id;

  INSERT INTO public.logs (
    user_id, user_name, action, target_type, target_id, details, timestamp
  ) VALUES (
    v_actor, coalesce(v_actor_name, 'Administrator'), 'Updated Stock Baseline', 'product', p_product_id::text,
    jsonb_build_object(
      'productName', v_prod.name,
      'prevBaseline', v_prev_baseline,
      'newBaseline', p_baseline
    ),
    v_now
  );

  RETURN jsonb_build_object(
    'success', true,
    'productId', p_product_id,
    'prevBaseline', v_prev_baseline,
    'newBaseline', p_baseline,
    'changed', true
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_inventory_archive_state(
  p_inventory_id uuid,
  p_deleted boolean,
  p_reason text DEFAULT ''::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_actor        uuid := auth.uid();
  v_actor_name   text;
  v_inv          public.inventory%rowtype;
  v_action       text;
  v_now          timestamptz := now();
  v_clean_reason text;
BEGIN
  IF NOT public.can_manage_inventory() THEN
    RAISE EXCEPTION 'Inventory management access required.' USING ERRCODE = '42501';
  END IF;

  IF p_inventory_id IS NULL THEN
    RAISE EXCEPTION 'Inventory ID is required.';
  END IF;

  IF p_deleted IS NULL THEN
    RAISE EXCEPTION 'Deleted flag must be true or false.';
  END IF;

  v_clean_reason := trim(coalesce(p_reason, ''));

  SELECT coalesce(nullif(trim(concat_ws(' ', first_name, last_name)), ''), email, 'Administrator')
  INTO v_actor_name
  FROM public.profiles
  WHERE id = v_actor;

  SELECT * INTO v_inv
  FROM public.inventory
  WHERE id = p_inventory_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventory variant % not found.', p_inventory_id;
  END IF;

  IF p_deleted AND coalesce(v_inv.reserved, 0) > 0 THEN
    RAISE EXCEPTION 'Cannot archive an inventory variant with reserved stock.';
  END IF;

  IF v_inv.deleted IS NOT DISTINCT FROM p_deleted THEN
    RETURN jsonb_build_object('success', true, 'inventoryId', p_inventory_id, 'deleted', p_deleted, 'changed', false);
  END IF;

  UPDATE public.inventory
  SET deleted    = p_deleted,
      deleted_at = CASE WHEN p_deleted THEN v_now ELSE NULL END,
      updated_at = v_now
  WHERE id = p_inventory_id;

  v_action := CASE WHEN p_deleted THEN 'Archived inventory item' ELSE 'Restored inventory item' END;

  INSERT INTO public.logs (
    user_id, user_name, action, target_type, target_id, details, timestamp
  ) VALUES (
    v_actor, coalesce(v_actor_name, 'Administrator'), v_action, 'product', v_inv.product_doc_id::text,
    jsonb_build_object(
      'inventoryId', v_inv.id,
      'itemName', v_inv.item,
      'size', v_inv.size,
      'color', coalesce(v_inv.color, ''),
      'total', v_inv.total,
      'reserved', v_inv.reserved,
      'available', v_inv.available,
      'reason', nullif(v_clean_reason, '')
    ),
    v_now
  );

  RETURN jsonb_build_object(
    'success', true,
    'inventoryId', p_inventory_id,
    'deleted', p_deleted,
    'changed', true
  );
END;
$function$;

-- ── 6. Hardened Stock Healing RPC ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.recalculate_inventory_stock()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_actor           uuid := auth.uid();
  v_actor_name      text;
  v_inventory_count integer;
  v_product_count   integer;
  v_now             timestamptz := now();
BEGIN
  IF NOT public.can_manage_inventory() THEN
    RAISE EXCEPTION 'Inventory management access required.' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(nullif(trim(concat_ws(' ', first_name, last_name)), ''), email, 'Administrator')
  INTO v_actor_name
  FROM public.profiles
  WHERE id = v_actor;

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
      AND COALESCE(r.deleted, false) = false
    WHERE COALESCE(i.deleted, false) = false
    GROUP BY i.id
  ), updated AS (
    UPDATE public.inventory i
       SET reserved   = c.reserved,
           available  = GREATEST(0, COALESCE(i.total, 0) - c.reserved),
           updated_at = v_now
      FROM calculated c
     WHERE i.id = c.id
       AND (i.reserved IS DISTINCT FROM c.reserved OR i.available IS DISTINCT FROM GREATEST(0, COALESCE(i.total, 0) - c.reserved))
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
           updated_at = v_now
      FROM totals t
     WHERE p.id = t.product_doc_id
       AND (p.stock IS DISTINCT FROM t.available OR p.status IS DISTINCT FROM CASE
             WHEN t.available <= 0 THEN
               CASE WHEN t.reserved > 0 THEN 'Reserved' ELSE 'Out of Stock' END
             ELSE 'In Boutique'
           END)
    RETURNING p.id
  )
  SELECT count(*) INTO v_product_count FROM updated;

  INSERT INTO public.logs (
    user_id, user_name, action, target_type, target_id, details, timestamp
  ) VALUES (
    v_actor, coalesce(v_actor_name, 'Administrator'), 'Recalculated Inventory Stock', 'system', 'inventory',
    jsonb_build_object('inventoryUpdated', v_inventory_count, 'productsUpdated', v_product_count),
    v_now
  );

  RETURN jsonb_build_object('inventory_rows', v_inventory_count, 'products', v_product_count);
END;
$function$;

-- ── 7. Dangerous Privilege Revocation (Migration A) ───────────────────────────

REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.inventory, public.products, public.reservations, public.stock_movements FROM anon, authenticated, PUBLIC;

REVOKE EXECUTE ON FUNCTION public.can_operate_inventory() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_operate_inventory() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.can_manage_inventory() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_inventory() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.record_boutique_sale(uuid, integer, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_boutique_sale(uuid, integer, numeric) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.adjust_inventory_on_hand(uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adjust_inventory_on_hand(uuid, integer, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.set_inventory_baseline(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_inventory_baseline(uuid, integer) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.set_inventory_archive_state(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_inventory_archive_state(uuid, boolean, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.recalculate_inventory_stock() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recalculate_inventory_stock() TO authenticated;
