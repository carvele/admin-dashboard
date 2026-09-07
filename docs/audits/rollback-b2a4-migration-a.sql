-- ============================================================================
-- Rollback Script: rollback-b2a4-migration-a.sql
-- Reverts: 20260907183000_customer_command_boundary.sql
-- ============================================================================

-- 1. Drop new customer command RPCs
DROP FUNCTION IF EXISTS public.set_customer_archive_state(uuid, boolean, text);
DROP FUNCTION IF EXISTS public.set_customer_block_state(uuid, boolean, text);
DROP FUNCTION IF EXISTS public.can_manage_customers();

-- 2. Restore reject_account_deletion_request() to pre-B2A-4 baseline
CREATE OR REPLACE FUNCTION public.reject_account_deletion_request(_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_request record;
  v_actor uuid := auth.uid();
  v_actor_name text;
BEGIN
  IF NOT public.is_staff_or_admin() THEN
    RAISE EXCEPTION 'Only staff can reject account deletion requests.';
  END IF;

  SELECT * INTO v_request
  FROM public.account_deletion_requests
  WHERE id = _request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Deletion request not found.';
  END IF;
  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'This request has already been processed.';
  END IF;

  UPDATE public.account_deletion_requests
  SET status = 'cancelled', processed_at = now(), processed_by = auth.uid()
  WHERE id = _request_id;

  SELECT COALESCE(NULLIF(trim(concat_ws(' ', first_name, last_name)), ''), 'Staff')
  INTO v_actor_name
  FROM public.profiles
  WHERE id = v_actor;

  INSERT INTO public.logs (user_id, user_name, action, target_type, target_id, details)
  VALUES (
    v_actor, COALESCE(v_actor_name, 'Staff'), 'Rejected account deletion request',
    'account_deletion_request', _request_id::text,
    jsonb_build_object('requested_by', v_request.user_id)
  );

  RETURN jsonb_build_object('rejected', true, 'user_id', v_request.user_id);
END;
$function$;

-- 3. Restore request_account_deletion() to pre-B2A-4 baseline
CREATE OR REPLACE FUNCTION public.request_account_deletion(_reason text DEFAULT NULL::text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_blocking_reservations integer;
  v_request_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT count(*) INTO v_blocking_reservations
  FROM public.reservations r
  WHERE r.customer_id = auth.uid()
    AND r.deleted = false
    AND lower(trim(r.status)) <> 'cancelled'
    AND r.balance_settled_at IS NULL
    AND (
      lower(trim(r.payment_status)) <> 'paid'
      OR
      (lower(trim(r.payment_type)) = 'deposit' AND r.rental_price > coalesce(r.deposit, 0))
    );

  IF v_blocking_reservations > 0 THEN
    RAISE EXCEPTION 'You cannot request account deletion while you have unsettled balances.';
  END IF;

  INSERT INTO public.account_deletion_requests (user_id, reason)
  VALUES (auth.uid(), coalesce(_reason, 'Requested by customer'))
  RETURNING id INTO v_request_id;

  RETURN v_request_id;
END;
$function$;

-- 4. Restore process_account_deletion() to pre-B2A-4 baseline
CREATE OR REPLACE FUNCTION public.process_account_deletion(_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_request record;
  v_blocking_reservations integer;
  v_blocking_payments integer;
BEGIN
  IF NOT public.is_staff_or_admin() THEN
    RAISE EXCEPTION 'Only staff can process account deletion requests.';
  END IF;

  SELECT * INTO v_request
  FROM public.account_deletion_requests
  WHERE id = _request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Deletion request not found.';
  END IF;
  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'This request has already been processed.';
  END IF;

  SELECT count(*) INTO v_blocking_reservations
  FROM public.reservations r
  WHERE r.customer_id = v_request.user_id
    AND r.deleted = false
    AND lower(trim(r.status)) <> 'cancelled'
    AND r.balance_settled_at IS NULL
    AND (
      lower(trim(r.payment_status)) <> 'paid'
      OR
      (lower(trim(r.payment_type)) = 'deposit' AND r.rental_price > coalesce(r.deposit, 0))
    );

  SELECT count(*) INTO v_blocking_payments
  FROM public.payments
  WHERE user_id = v_request.user_id
    AND status IN ('awaiting_payment', 'processing');

  IF v_blocking_reservations > 0 OR v_blocking_payments > 0 THEN
    RETURN jsonb_build_object(
      'blocked', true,
      'blocking_reservations', v_blocking_reservations,
      'blocking_payments', v_blocking_payments
    );
  END IF;

  DELETE FROM public.user_measurements WHERE user_id = v_request.user_id;
  DELETE FROM public.wishlists WHERE user_id = v_request.user_id;
  DELETE FROM public.wardrobe_items WHERE user_id = v_request.user_id;
  DELETE FROM public.saved_outfits WHERE user_id = v_request.user_id;
  DELETE FROM public.capsule_items
    WHERE capsule_id IN (SELECT id FROM public.capsules WHERE user_id = v_request.user_id);
  DELETE FROM public.capsules WHERE user_id = v_request.user_id;
  DELETE FROM public.notifications WHERE user_id = v_request.user_id;
  DELETE FROM public.stock_notify_requests WHERE user_id = v_request.user_id;
  DELETE FROM public.announcement_dismissals WHERE user_id = v_request.user_id;
  DELETE FROM public.user_streaks WHERE user_id = v_request.user_id;

  UPDATE public.logs SET user_id = NULL WHERE user_id = v_request.user_id;
  UPDATE public.feedback SET user_id = NULL WHERE user_id = v_request.user_id;
  UPDATE public.ar_sessions SET user_id = NULL WHERE user_id = v_request.user_id;
  UPDATE public.messages SET sender_id = NULL WHERE sender_id = v_request.user_id;
  UPDATE public.reviews SET user_id = NULL WHERE user_id = v_request.user_id;

  UPDATE public.profiles
  SET
    first_name = NULL,
    last_name = NULL,
    email = NULL,
    phone = NULL,
    address_line = NULL,
    barangay = NULL,
    city = NULL,
    province = NULL,
    zip_code = NULL,
    date_of_birth = NULL,
    gender = NULL,
    employment_status = NULL,
    fit_preference = NULL,
    expo_push_token = NULL,
    deleted = true,
    updated_at = now()
  WHERE id = v_request.user_id;

  UPDATE public.account_deletion_requests
  SET status = 'completed', processed_at = now(), processed_by = auth.uid()
  WHERE id = _request_id;

  RETURN jsonb_build_object('blocked', false, 'user_id', v_request.user_id);
END;
$function$;

-- 5. Restore check_profile_updates() to search_path 'public', 'pg_temp'
CREATE OR REPLACE FUNCTION public.check_profile_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  performer_role text;
BEGIN
  IF (
    NEW.role IS DISTINCT FROM OLD.role OR
    NEW.employment_status IS DISTINCT FROM OLD.employment_status OR
    NEW.is_blocked IS DISTINCT FROM OLD.is_blocked OR
    NEW.deleted IS DISTINCT FROM OLD.deleted
  ) THEN
    IF auth.uid() IS NOT NULL THEN
      IF auth.uid() = OLD.id THEN
        RAISE EXCEPTION 'You cannot modify your own role, employment status, block status, or deletion status.';
      END IF;

      SELECT role INTO performer_role
      FROM public.profiles
      WHERE id = auth.uid() AND deleted = false;

      IF performer_role IS NULL OR performer_role NOT IN ('admin', 'owner') THEN
        RAISE EXCEPTION 'Only administrators or owners can modify role, employment status, block status, or deletion status.';
      END IF;

      IF NEW.role = 'owner' AND OLD.role IS DISTINCT FROM 'owner' THEN
        RAISE EXCEPTION 'The Owner role cannot be assigned through the application.';
      END IF;

      IF OLD.role = 'owner' THEN
        RAISE EXCEPTION 'The Owner account cannot be modified.';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
