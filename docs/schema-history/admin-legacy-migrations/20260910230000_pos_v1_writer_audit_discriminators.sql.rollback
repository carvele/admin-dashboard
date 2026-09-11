-- Mirror only -- canonical copy lives in jezsy-mobile-app/supabase/migrations/
-- Reverts create_reservation, create_reservation_multi, and
-- create_admin_reservation to their pre-writer-audit bodies (no
-- purchase_mode/sales_channel in the INSERT), and narrows chk_sales_channel
-- back to ('mobile','boutique_pos'). The constraint revert will fail if any
-- 'admin_assisted' rows already exist -- resolve those rows first if rolling
-- back after this has been live for a while.

CREATE OR REPLACE FUNCTION public.create_reservation(_product_id uuid, _size text, _color text, _quantity integer, _date text, _appointment_time text, _receipt_path text, _payment_option text DEFAULT 'deposit'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_profile record; v_product record; v_reservation public.reservations%rowtype;
  v_display_id text; v_attempt integer := 0; v_deposit numeric; v_appointment timestamptz;
  v_option text := lower(coalesce(_payment_option, 'deposit')); v_payment_type text;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
  IF v_option NOT IN ('deposit', 'full') THEN RAISE EXCEPTION 'Payment option must be deposit or full.'; END IF;
  IF _quantity IS NULL OR _quantity < 1 THEN RAISE EXCEPTION 'Quantity must be positive.'; END IF;
  IF _receipt_path IS NOT NULL AND _receipt_path <> ''
     AND (string_to_array(_receipt_path, '/'))[1] <> v_user_id::text THEN
    RAISE EXCEPTION 'Receipt does not belong to the current user.';
  END IF;
  IF _date IS NULL OR _date = '' OR _appointment_time IS NULL OR _appointment_time = '' THEN
    RAISE EXCEPTION 'A reservation date and appointment time are required.';
  END IF;

  v_appointment := (_date::date + _appointment_time::time) AT TIME ZONE 'Asia/Manila';

  SELECT id, name, image_url,
    CASE WHEN COALESCE(on_sale, false) AND sale_price IS NOT NULL AND sale_price > 0
      THEN sale_price ELSE COALESCE(price, 0) END::numeric AS price
  INTO v_product FROM public.products
  WHERE id = _product_id AND visibility = 'public' AND COALESCE(deleted, false) = false
  FOR SHARE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Product is unavailable.'; END IF;
  IF v_product.price <= 0 THEN RAISE EXCEPTION 'Product price is invalid.'; END IF;

  SELECT first_name, last_name INTO v_profile FROM public.profiles WHERE id = v_user_id;

  IF v_option = 'full' THEN
    v_deposit := round(v_product.price, 2); v_payment_type := 'Full';
  ELSE
    v_deposit := round(v_product.price * 0.5, 2); v_payment_type := 'Deposit';
  END IF;

  LOOP
    v_attempt := v_attempt + 1;
    v_display_id := 'RES-' || upper(to_hex(floor(extract(epoch from clock_timestamp()) * 1000)::bigint))
                    || '-' || lpad(floor(random() * 1000)::text, 3, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.reservations WHERE display_id = v_display_id);
    IF v_attempt > 10 THEN RAISE EXCEPTION 'Could not allocate reservation number.'; END IF;
  END LOOP;

  INSERT INTO public.reservations (
    display_id, customer_id, customer_name, product_id, product_name,
    image_url, size, color, quantity, rental_price, deposit,
    date, appointment_time, receipt_url, status,
    payment_status, payment_type, payment_due_at
  ) VALUES (
    v_display_id, v_user_id,
    COALESCE(NULLIF(trim(concat_ws(' ', v_profile.first_name, v_profile.last_name)), ''), 'Customer'),
    v_product.id, v_product.name, v_product.image_url,
    NULLIF(_size, ''), NULLIF(_color, ''), _quantity,
    v_product.price, v_deposit,
    _date::date, v_appointment,
    NULLIF(_receipt_path, ''), 'Pending', 'Pending', v_payment_type,
    NULL
  ) RETURNING * INTO v_reservation;

  INSERT INTO public.reservation_items (
    reservation_id, product_id, product_name, image_url,
    size, color, quantity, unit_price
  ) VALUES (
    v_reservation.id, v_product.id, v_product.name, v_product.image_url,
    NULLIF(_size, ''), NULLIF(_color, ''), _quantity, v_product.price
  );

  RETURN to_jsonb(v_reservation);
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_reservation_multi(_items jsonb, _date text, _appointment_time text, _receipt_path text DEFAULT NULL::text, _payment_option text DEFAULT 'deposit'::text, _customer_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor_id uuid := auth.uid();
  v_user_id uuid;
  v_profile record;
  v_product record;
  v_reservation public.reservations%rowtype;
  v_display_id text;
  v_attempt integer := 0;
  v_appointment timestamptz;
  v_payment_due_at timestamptz;
  v_option text := lower(coalesce(_payment_option, 'deposit'));
  v_payment_type text;
  v_item jsonb;
  v_quantity integer;
  v_total numeric := 0;
  v_deposit numeric;
  v_line_count integer;
  v_first jsonb;
  v_items_resolved jsonb := '[]'::jsonb;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;
  v_user_id := coalesce(_customer_id, v_actor_id);
  IF _customer_id IS NOT NULL
     AND _customer_id <> v_actor_id
     AND NOT public.is_admin_or_owner() THEN
    RAISE EXCEPTION 'Reservation management access required.' USING ERRCODE = '42501';
  END IF;
  IF v_option NOT IN ('deposit', 'full') THEN
    RAISE EXCEPTION 'Payment option must be deposit or full.';
  END IF;
  IF jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'A reservation must contain at least one item.';
  END IF;

  v_line_count := jsonb_array_length(_items);
  IF v_line_count > 20 THEN
    RAISE EXCEPTION 'A reservation cannot contain more than 20 items.';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(_items)
  LOOP
    IF coalesce((v_item->>'quantity')::integer, 1) < 1 THEN
      RAISE EXCEPTION 'Quantity must be positive.';
    END IF;
    IF nullif(v_item->>'product_id', '') IS NULL THEN
      RAISE EXCEPTION 'Every reservation item needs a product.';
    END IF;
  END LOOP;

  IF _receipt_path IS NOT NULL AND _receipt_path <> ''
     AND (string_to_array(_receipt_path, '/'))[1] <> v_user_id::text THEN
    RAISE EXCEPTION 'Receipt does not belong to the current user.';
  END IF;
  IF _date IS NULL OR _date = '' OR _appointment_time IS NULL OR _appointment_time = '' THEN
    RAISE EXCEPTION 'A reservation date and appointment time are required.';
  END IF;

  v_appointment := (_date::date + _appointment_time::time) AT TIME ZONE 'Asia/Manila';
  v_payment_due_at := least(now() + interval '24 hours', v_appointment - interval '1 hour');
  IF v_payment_due_at <= now() THEN
    v_payment_due_at := v_appointment;
  END IF;

  FOR v_item IN
    WITH raw AS (
      SELECT
        (entry.value->>'product_id')::uuid AS product_id,
        nullif(trim(entry.value->>'size'), '') AS size,
        nullif(trim(entry.value->>'color'), '') AS color,
        coalesce((entry.value->>'quantity')::integer, 1) AS quantity
      FROM jsonb_array_elements(_items) entry
    )
    SELECT jsonb_build_object(
      'product_id', product_id,
      'size', size,
      'color', color,
      'quantity', sum(quantity)::integer
    )
    FROM raw
    GROUP BY product_id, size, color
    ORDER BY product_id, size, color
  LOOP
    v_quantity := (v_item->>'quantity')::integer;

    SELECT p.id, p.name, p.image_url,
      CASE
        WHEN coalesce(p.on_sale, false) AND p.sale_price IS NOT NULL AND p.sale_price > 0
          THEN p.sale_price
        ELSE coalesce(p.price, 0)
      END::numeric AS price
    INTO v_product
    FROM public.products p
    WHERE p.id = (v_item->>'product_id')::uuid
      AND p.visibility = 'public'
      AND coalesce(p.deleted, false) = false
    FOR SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'One of the selected products is unavailable.';
    END IF;
    IF v_product.price <= 0 THEN
      RAISE EXCEPTION 'One of the selected products has an invalid price.';
    END IF;

    v_total := v_total + (v_product.price * v_quantity);
    v_items_resolved := v_items_resolved || jsonb_build_object(
      'product_id', v_product.id,
      'product_name', v_product.name,
      'image_url', v_product.image_url,
      'size', v_item->>'size',
      'color', v_item->>'color',
      'quantity', v_quantity,
      'unit_price', v_product.price
    );
  END LOOP;

  IF v_option = 'full' THEN
    v_deposit := round(v_total, 2);
    v_payment_type := 'Full';
  ELSE
    v_deposit := round(v_total * 0.5, 2);
    v_payment_type := 'Deposit';
  END IF;

  SELECT p.first_name, p.last_name
  INTO v_profile
  FROM public.profiles p
  WHERE p.id = v_user_id
    AND p.role = 'customer'
    AND coalesce(p.deleted, false) = false
    AND coalesce(p.is_blocked, false) = false;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer account is unavailable.';
  END IF;

  LOOP
    v_attempt := v_attempt + 1;
    v_display_id := 'RES-' || upper(to_hex(floor(extract(epoch from clock_timestamp()) * 1000)::bigint))
      || '-' || lpad(floor(random() * 1000)::text, 3, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.reservations r WHERE r.display_id = v_display_id);
    IF v_attempt > 10 THEN
      RAISE EXCEPTION 'Could not allocate reservation number.';
    END IF;
  END LOOP;

  v_first := v_items_resolved -> 0;

  INSERT INTO public.reservations (
    display_id, customer_id, customer_name, product_id, product_name,
    image_url, size, color, quantity, rental_price, deposit,
    date, return_date, appointment_time, receipt_url, status,
    payment_status, payment_type, payment_due_at
  ) VALUES (
    v_display_id,
    v_user_id,
    coalesce(nullif(trim(concat_ws(' ', v_profile.first_name, v_profile.last_name)), ''), 'Customer'),
    (v_first->>'product_id')::uuid,
    v_first->>'product_name',
    v_first->>'image_url',
    v_first->>'size',
    v_first->>'color',
    (v_first->>'quantity')::integer,
    round(v_total, 2),
    v_deposit,
    _date::date,
    NULL,
    v_appointment,
    nullif(_receipt_path, ''),
    'To Pay',
    'Pending',
    v_payment_type,
    v_payment_due_at
  ) RETURNING * INTO v_reservation;

  INSERT INTO public.reservation_items (
    reservation_id, product_id, product_name, image_url,
    size, color, quantity, unit_price
  )
  SELECT
    v_reservation.id,
    (line->>'product_id')::uuid,
    line->>'product_name',
    line->>'image_url',
    line->>'size',
    line->>'color',
    (line->>'quantity')::integer,
    (line->>'unit_price')::numeric
  FROM jsonb_array_elements(v_items_resolved) line;

  RETURN to_jsonb(v_reservation) || jsonb_build_object('items', v_items_resolved);
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_admin_reservation(_customer_id uuid, _product_id uuid, _size text, _color text, _appointment_time timestamp with time zone, _payment_status text DEFAULT 'Pending'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_customer_name text;
  v_product record;
  v_reservation public.reservations%rowtype;
  v_display_id text;
BEGIN
  IF v_actor IS NULL OR NOT public.is_admin_or_owner() THEN
    RAISE EXCEPTION 'Owner or administrator access required.';
  END IF;
  IF _appointment_time IS NULL OR _appointment_time <= now() THEN
    RAISE EXCEPTION 'A future appointment time is required.';
  END IF;
  IF lower(coalesce(_payment_status, '')) NOT IN ('pending', 'paid') THEN
    RAISE EXCEPTION 'Payment status must be Pending or Paid.';
  END IF;

  SELECT coalesce(nullif(trim(concat_ws(' ', first_name, last_name)), ''), email, 'Customer')
  INTO v_customer_name
  FROM public.profiles
  WHERE id = _customer_id AND coalesce(deleted, false) = false AND coalesce(is_blocked, false) = false;
  IF NOT FOUND THEN RAISE EXCEPTION 'Select an active customer.'; END IF;

  SELECT id, name, image_url,
    CASE WHEN coalesce(on_sale, false) AND sale_price > 0 THEN sale_price ELSE price END::numeric AS price
  INTO v_product
  FROM public.products
  WHERE id = _product_id AND coalesce(deleted, false) = false
  FOR SHARE;
  IF NOT FOUND OR coalesce(v_product.price, 0) <= 0 THEN
    RAISE EXCEPTION 'Select an available product with a valid price.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.inventory WHERE product_doc_id = _product_id AND deleted = false)
     AND NOT EXISTS (
       SELECT 1 FROM public.inventory
       WHERE product_doc_id = _product_id
         AND size IS NOT DISTINCT FROM nullif(_size, '')
         AND color IS NOT DISTINCT FROM coalesce(_color, '')
         AND deleted = false
     ) THEN
    RAISE EXCEPTION 'The selected product variant does not exist.';
  END IF;

  v_display_id := 'RES-' || upper(to_hex(floor(extract(epoch from clock_timestamp()) * 1000)::bigint))
                  || '-' || lpad(floor(random() * 1000)::text, 3, '0');

  INSERT INTO public.reservations (
    display_id, customer_id, customer_name, product_id, product_name, image_url,
    size, color, quantity, rental_price, deposit, date, appointment_time,
    status, payment_status, payment_type, countdown, assigned_staff_id
  ) VALUES (
    v_display_id, _customer_id, v_customer_name, _product_id, v_product.name, v_product.image_url,
    nullif(_size, ''), coalesce(_color, ''), 1, round(v_product.price, 2),
    round(v_product.price * 0.5, 2), (_appointment_time AT TIME ZONE 'Asia/Manila')::date,
    _appointment_time, 'Pending', initcap(lower(_payment_status)), 'Deposit', true, NULL
  ) RETURNING * INTO v_reservation;

  INSERT INTO public.reservation_items (
    reservation_id, product_id, product_name, image_url, size, color, quantity, unit_price
  ) VALUES (
    v_reservation.id, _product_id, v_product.name, v_product.image_url,
    nullif(_size, ''), coalesce(_color, ''), 1, v_product.price
  );

  RETURN to_jsonb(v_reservation);
END;
$function$;

ALTER TABLE public.reservations DROP CONSTRAINT chk_sales_channel;
ALTER TABLE public.reservations
  ADD CONSTRAINT chk_sales_channel CHECK (
    sales_channel IS NULL OR sales_channel IN ('mobile','boutique_pos')
  );
