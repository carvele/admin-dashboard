-- POS v1 (Migration-1, part 2 of 2): new five-argument record_boutique_sale
-- overload adding payment method and idempotency to walk-in sales.
--
-- Built directly from the live three-argument record_boutique_sale
-- (20260908140000_inventory_command_boundary.sql), not from assumed helper
-- functions -- this database has no lock_inventory_for_update,
-- check_inventory_available, deduct_inventory, insert_stock_movement, or
-- write_audit_log. Everything stays inline, matching that function's own
-- style: public.can_operate_inventory() for authorization, a direct
-- SELECT ... FOR UPDATE on inventory, a direct UPDATE, direct INSERTs into
-- stock_movements/reservations/logs, and SET search_path TO '' with every
-- reference schema-qualified.
--
-- The three-argument overload is NOT touched by this migration (no
-- CREATE OR REPLACE, no forwarding wrapper) -- it stays exactly as it is
-- until a later migration drops it once the front-end is fully cut over.
--
-- reservations has no inventory_id column (only product_id/product_name/
-- size/color) -- the header insert keeps that exact shape; inventory_id
-- belongs on the new reservation_items row instead, matching the actual
-- schema. Both reservations.id and reservation_items.id already default to
-- gen_random_uuid(), so id is omitted from both inserts -- this also avoids
-- calling uuid_generate_v4() unqualified under the empty search_path
-- (uuid-ossp lives in the extensions schema, not public).
CREATE OR REPLACE FUNCTION public.record_boutique_sale(
  p_inventory_id UUID,
  p_quantity INTEGER,
  p_unit_price NUMERIC,
  p_payment_method TEXT,
  p_idempotency_key UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor      uuid := auth.uid();
  v_actor_name text;
  v_inv        public.inventory%rowtype;
  v_row        public.reservations%rowtype;
  v_item_inventory_id uuid;
  v_prev_total integer;
  v_new_total  integer;
  v_prev_avail integer;
  v_new_avail  integer;
  v_now        timestamptz := now();
  v_res_id     uuid;
BEGIN
  -- ---------- Authorization ----------
  IF NOT public.can_operate_inventory() THEN
    RAISE EXCEPTION 'Inventory operational access required.' USING ERRCODE = '42501';
  END IF;

  -- ---------- Input validation (before any lock or mutation) ----------
  IF p_inventory_id IS NULL THEN
    RAISE EXCEPTION 'Inventory ID is required.';
  END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be a positive integer.';
  END IF;
  IF p_unit_price IS NULL OR p_unit_price < 0 THEN
    RAISE EXCEPTION 'Sale price must be non-negative.';
  END IF;
  IF p_payment_method NOT IN ('cash','card','ewallet') THEN
    RAISE EXCEPTION 'Invalid payment method.';
  END IF;
  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'idempotency_key cannot be NULL.';
  END IF;

  -- ---------- Fast idempotency pre-check (before taking any lock) ----------
  SELECT * INTO v_row FROM public.reservations WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN
    SELECT ri.inventory_id INTO v_item_inventory_id
    FROM public.reservation_items ri WHERE ri.reservation_id = v_row.id LIMIT 1;

    IF v_item_inventory_id IS DISTINCT FROM p_inventory_id
       OR v_row.quantity IS DISTINCT FROM p_quantity
       OR v_row.rental_price IS DISTINCT FROM (p_unit_price * p_quantity)
       OR v_row.payment_method IS DISTINCT FROM p_payment_method
    THEN
      RAISE EXCEPTION 'idempotency key reuse with different payload';
    END IF;

    RETURN jsonb_build_object('status', 'duplicate', 'reservationId', v_row.id);
  END IF;

  -- ---------- Inventory lock (same as the live 3-arg function) ----------
  SELECT * INTO v_inv
  FROM public.inventory
  WHERE id = p_inventory_id AND deleted = false
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active inventory variant % not found.', p_inventory_id;
  END IF;

  -- ---------- Idempotency re-check, now holding the lock ----------
  -- Closes the race where two identical calls target the last unit: call A
  -- could commit while call B was waiting for this lock, in which case B
  -- must see "duplicate", not "insufficient stock".
  SELECT * INTO v_row FROM public.reservations WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN
    SELECT ri.inventory_id INTO v_item_inventory_id
    FROM public.reservation_items ri WHERE ri.reservation_id = v_row.id LIMIT 1;

    IF v_item_inventory_id IS DISTINCT FROM p_inventory_id
       OR v_row.quantity IS DISTINCT FROM p_quantity
       OR v_row.rental_price IS DISTINCT FROM (p_unit_price * p_quantity)
       OR v_row.payment_method IS DISTINCT FROM p_payment_method
    THEN
      RAISE EXCEPTION 'idempotency key reuse with different payload';
    END IF;

    RETURN jsonb_build_object('status', 'duplicate', 'reservationId', v_row.id);
  END IF;

  -- ---------- Stock availability ----------
  IF coalesce(v_inv.available, 0) < p_quantity THEN
    RAISE EXCEPTION 'Insufficient stock: % available, % requested.',
      coalesce(v_inv.available, 0), p_quantity;
  END IF;

  -- ---------- Header insert, ON CONFLICT DO NOTHING ----------
  -- The lock above serializes same-inventory races, but two calls using the
  -- same idempotency_key against *different* inventory rows are never
  -- serialized against each other -- this UNIQUE-backed insert is the actual
  -- backstop for that case.
  INSERT INTO public.reservations (
    product_id, product_name, size, color, quantity, rental_price, status,
    customer_name, staff_id, hidden_in_history, deleted,
    purchase_mode, sales_channel, payment_method, idempotency_key,
    created_at, updated_at
  ) VALUES (
    v_inv.product_doc_id, v_inv.item, v_inv.size, coalesce(v_inv.color, ''),
    p_quantity, p_unit_price * p_quantity, 'Completed', 'Walk-in Customer', v_actor,
    false, false,
    'walk_in', 'boutique_pos', p_payment_method, p_idempotency_key,
    v_now, v_now
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_res_id;

  IF v_res_id IS NULL THEN
    -- Lost the race to a concurrent call using the same key against a
    -- different inventory row. Fetch and verify like the pre-checks above.
    SELECT * INTO v_row FROM public.reservations WHERE idempotency_key = p_idempotency_key;

    SELECT ri.inventory_id INTO v_item_inventory_id
    FROM public.reservation_items ri WHERE ri.reservation_id = v_row.id LIMIT 1;

    IF v_item_inventory_id IS DISTINCT FROM p_inventory_id
       OR v_row.quantity IS DISTINCT FROM p_quantity
       OR v_row.rental_price IS DISTINCT FROM (p_unit_price * p_quantity)
       OR v_row.payment_method IS DISTINCT FROM p_payment_method
    THEN
      RAISE EXCEPTION 'idempotency key reuse with different payload';
    END IF;

    RETURN jsonb_build_object('status', 'duplicate', 'reservationId', v_row.id);
  END IF;

  -- ---------- First-caller mutations only, from here down ----------
  SELECT coalesce(nullif(trim(concat_ws(' ', first_name, last_name)), ''), email, 'Staff')
  INTO v_actor_name
  FROM public.profiles
  WHERE id = v_actor;

  v_prev_total := coalesce(v_inv.total, 0);
  v_new_total  := v_prev_total - p_quantity;
  v_prev_avail := coalesce(v_inv.available, 0);
  v_new_avail  := v_prev_avail - p_quantity;

  UPDATE public.inventory
  SET total = v_new_total, available = v_new_avail, updated_at = v_now
  WHERE id = p_inventory_id;

  INSERT INTO public.stock_movements (
    product_id, inventory_id, previous_stock, new_stock, delta, change_type, note, created_at, updated_at
  ) VALUES (
    v_inv.product_doc_id, v_inv.id, v_prev_total, v_new_total, -p_quantity, 'sale',
    format('Walk-in sale: %s× %s (size %s)', p_quantity, coalesce(v_inv.item, 'Item'), coalesce(v_inv.size, '')),
    v_now, v_now
  );

  INSERT INTO public.reservation_items (
    reservation_id, product_id, product_name, size, color, quantity, unit_price, inventory_id, created_at
  ) VALUES (
    v_res_id, v_inv.product_doc_id, v_inv.item, v_inv.size, coalesce(v_inv.color, ''),
    p_quantity, p_unit_price, v_inv.id, v_now
  );

  INSERT INTO public.logs (
    user_id, user_name, action, target_type, target_id, details, timestamp
  ) VALUES (
    v_actor, coalesce(v_actor_name, 'Staff'), 'Recorded In-Store Sale', 'product', v_inv.product_doc_id::text,
    jsonb_build_object(
      'inventoryId', v_inv.id, 'reservationId', v_res_id, 'itemName', v_inv.item,
      'size', v_inv.size, 'color', coalesce(v_inv.color, ''), 'quantitySold', p_quantity,
      'salePrice', p_unit_price, 'paymentMethod', p_payment_method
    ),
    v_now
  );

  -- Response contract preserved from the legacy function -- productService.js
  -- does not currently read prevTotal/newTotal/etc. (confirmed: it only
  -- invalidates query caches), but they're kept anyway in case anything else
  -- ever comes to depend on them; status/reservationId are additive.
  RETURN jsonb_build_object(
    'success', true,
    'status', 'ok',
    'reservationId', v_res_id,
    'inventoryId', v_inv.id,
    'prevTotal', v_prev_total,
    'newTotal', v_new_total,
    'prevAvailable', v_prev_avail,
    'newAvailable', v_new_avail
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_boutique_sale(uuid, integer, numeric, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_boutique_sale(uuid, integer, numeric, text, uuid) TO authenticated;
