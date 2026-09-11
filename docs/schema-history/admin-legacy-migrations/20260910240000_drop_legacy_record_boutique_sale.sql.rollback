-- Recreates the legacy three-argument record_boutique_sale exactly as
-- recovered live (pg_get_functiondef) before the drop -- byte-for-byte,
-- including its original grants.
CREATE OR REPLACE FUNCTION public.record_boutique_sale(p_inventory_id uuid, p_quantity integer, p_sale_price numeric DEFAULT 0)
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

REVOKE EXECUTE ON FUNCTION public.record_boutique_sale(uuid, integer, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_boutique_sale(uuid, integer, numeric) TO authenticated;
