-- ============================================================================
-- Migration: 20260907183000_customer_command_boundary.sql
-- Phase: B2A-4 (Migration A - Customer Command Boundary & Deletion Hardening)
-- Description:
--   1. Introduces dedicated public.can_manage_customers() capability predicate.
--   2. Introduces hardened public.set_customer_block_state() RPC.
--   3. Introduces hardened public.set_customer_archive_state() RPC.
--   4. Hardens public.process_account_deletion() with can_manage_customers()
--      and target role re-validation.
--   5. Hardens public.reject_account_deletion_request() with can_manage_customers().
--   6. Hardens public.request_account_deletion() ensuring only customer profiles can file.
--   7. Hardens public.check_profile_updates() with empty search_path.
-- Note:
--   Transitional column grants UPDATE(is_blocked, deleted) remain temporarily
--   granted to authenticated until Admin client deployment is complete (Migration B).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Capability Predicate: can_manage_customers()
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_manage_customers()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
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
$$;

REVOKE ALL ON FUNCTION public.can_manage_customers() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_customers() TO authenticated;
COMMENT ON FUNCTION public.can_manage_customers() IS 'B2A-4: Authorizes customer moderation and account-deletion management for active admins/owners on approved devices (owner bypasses device requirement).';

-- ----------------------------------------------------------------------------
-- 2. Manual Customer Block Command: set_customer_block_state()
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_customer_block_state(
  target_customer_id uuid,
  new_is_blocked boolean,
  change_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_actor_profile record;
  v_actor_name text;
  v_target record;
  v_trimmed_reason text;
BEGIN
  -- 1. Capability Authorization
  IF NOT public.can_manage_customers() THEN
    RAISE EXCEPTION 'Unauthorized: Only active administrators on approved devices can modify customer block status.';
  END IF;

  -- 2. Argument Validation
  IF target_customer_id IS NULL THEN
    RAISE EXCEPTION 'target_customer_id cannot be null';
  END IF;

  IF new_is_blocked IS NULL THEN
    RAISE EXCEPTION 'new_is_blocked cannot be null';
  END IF;

  v_trimmed_reason := trim(coalesce(change_reason, ''));
  IF length(v_trimmed_reason) < 3 OR length(v_trimmed_reason) > 500 THEN
    RAISE EXCEPTION 'change_reason must be between 3 and 500 characters';
  END IF;

  -- 3. Target Acquisition & Invariant Verification
  SELECT id, role, deleted, is_blocked, first_name, last_name
  INTO v_target
  FROM public.profiles
  WHERE id = target_customer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target customer profile not found';
  END IF;

  IF v_target.role <> 'customer' THEN
    RAISE EXCEPTION 'Target account is not a customer (role: %)', v_target.role;
  END IF;

  -- Archived customer cannot have block state modified
  IF v_target.deleted IS NOT FALSE THEN
    RAISE EXCEPTION 'Cannot modify block state of an archived customer';
  END IF;

  -- 4. Deterministic No-Change Check (null-safe)
  IF v_target.is_blocked IS NOT DISTINCT FROM new_is_blocked THEN
    RETURN jsonb_build_object(
      'success', true,
      'no_change', true,
      'customer_id', target_customer_id,
      'is_blocked', new_is_blocked
    );
  END IF;

  -- 5. Mutation (modifies ONLY is_blocked and updated_at)
  UPDATE public.profiles
  SET
    is_blocked = new_is_blocked,
    updated_at = now()
  WHERE id = target_customer_id;

  -- 6. Actor Identity Resolution for Audit Log
  SELECT first_name, last_name
  INTO v_actor_profile
  FROM public.profiles
  WHERE id = v_actor;

  v_actor_name := COALESCE(
    NULLIF(TRIM(CONCAT_WS(' ', v_actor_profile.first_name, v_actor_profile.last_name)), ''),
    'Administrator'
  );

  -- 7. Atomic Audit Logging in public.logs
  INSERT INTO public.logs (
    user_id,
    user_name,
    action,
    target_type,
    target_id,
    details,
    timestamp
  ) VALUES (
    v_actor,
    v_actor_name,
    CASE WHEN new_is_blocked THEN 'customer_blocked' ELSE 'customer_unblocked' END,
    'profile',
    target_customer_id::text,
    jsonb_build_object(
      'previous_is_blocked', v_target.is_blocked,
      'new_is_blocked', new_is_blocked,
      'reason', v_trimmed_reason
    ),
    now()
  );

  -- 8. Structured Return
  RETURN jsonb_build_object(
    'success', true,
    'no_change', false,
    'customer_id', target_customer_id,
    'is_blocked', new_is_blocked
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_customer_block_state(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_customer_block_state(uuid, boolean, text) TO authenticated;
COMMENT ON FUNCTION public.set_customer_block_state IS 'B2A-4: Hardened RPC for administrators to block or unblock customer accounts with mandatory audit logging.';

-- ----------------------------------------------------------------------------
-- 3. Manual Customer Archive/Restore Command: set_customer_archive_state()
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_customer_archive_state(
  target_customer_id uuid,
  new_deleted boolean,
  change_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_actor_profile record;
  v_actor_name text;
  v_target record;
  v_trimmed_reason text;
BEGIN
  -- 1. Capability Authorization
  IF NOT public.can_manage_customers() THEN
    RAISE EXCEPTION 'Unauthorized: Only active administrators on approved devices can archive or restore customer accounts.';
  END IF;

  -- 2. Argument Validation
  IF target_customer_id IS NULL THEN
    RAISE EXCEPTION 'target_customer_id cannot be null';
  END IF;

  IF new_deleted IS NULL THEN
    RAISE EXCEPTION 'new_deleted cannot be null';
  END IF;

  v_trimmed_reason := trim(coalesce(change_reason, ''));
  IF length(v_trimmed_reason) < 3 OR length(v_trimmed_reason) > 500 THEN
    RAISE EXCEPTION 'change_reason must be between 3 and 500 characters';
  END IF;

  -- 3. Target Acquisition & Invariant Verification
  SELECT id, role, deleted, is_blocked, first_name, last_name
  INTO v_target
  FROM public.profiles
  WHERE id = target_customer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target customer profile not found';
  END IF;

  IF v_target.role <> 'customer' THEN
    RAISE EXCEPTION 'Target account is not a customer (role: %)', v_target.role;
  END IF;

  -- 4. Deterministic No-Change Check (null-safe)
  IF v_target.deleted IS NOT DISTINCT FROM new_deleted THEN
    RETURN jsonb_build_object(
      'success', true,
      'no_change', true,
      'customer_id', target_customer_id,
      'deleted', new_deleted
    );
  END IF;

  -- 5. Mutation (modifies ONLY deleted and updated_at; preserves is_blocked)
  UPDATE public.profiles
  SET
    deleted = new_deleted,
    updated_at = now()
  WHERE id = target_customer_id;

  -- 6. Actor Identity Resolution for Audit Log
  SELECT first_name, last_name
  INTO v_actor_profile
  FROM public.profiles
  WHERE id = v_actor;

  v_actor_name := COALESCE(
    NULLIF(TRIM(CONCAT_WS(' ', v_actor_profile.first_name, v_actor_profile.last_name)), ''),
    'Administrator'
  );

  -- 7. Atomic Audit Logging in public.logs
  INSERT INTO public.logs (
    user_id,
    user_name,
    action,
    target_type,
    target_id,
    details,
    timestamp
  ) VALUES (
    v_actor,
    v_actor_name,
    CASE WHEN new_deleted THEN 'customer_archived' ELSE 'customer_restored' END,
    'profile',
    target_customer_id::text,
    jsonb_build_object(
      'previous_deleted', v_target.deleted,
      'new_deleted', new_deleted,
      'reason', v_trimmed_reason
    ),
    now()
  );

  -- 8. Structured Return
  RETURN jsonb_build_object(
    'success', true,
    'no_change', false,
    'customer_id', target_customer_id,
    'deleted', new_deleted
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_customer_archive_state(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_customer_archive_state(uuid, boolean, text) TO authenticated;
COMMENT ON FUNCTION public.set_customer_archive_state IS 'B2A-4: Hardened RPC for administrators to archive or restore customer accounts with mandatory audit logging.';

-- ----------------------------------------------------------------------------
-- 4. Account Deletion Scrub: process_account_deletion()
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_account_deletion(_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_request record;
  v_target record;
  v_blocking_reservations integer;
  v_blocking_payments integer;
  v_actor_profile record;
  v_actor_name text;
BEGIN
  -- 1. Capability Authorization
  IF NOT public.can_manage_customers() THEN
    RAISE EXCEPTION 'Unauthorized: Only administrators on approved devices can process account deletion.';
  END IF;

  -- 2. Lock & Validate Deletion Request
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

  -- 3. Lock & Validate Target Profile
  SELECT * INTO v_target
  FROM public.profiles
  WHERE id = v_request.user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target customer profile not found.';
  END IF;

  IF v_target.role <> 'customer' THEN
    RAISE EXCEPTION 'Target account is not a customer (role: %). Cannot process deletion through customer deletion pipeline.', v_target.role;
  END IF;

  -- 4. Check Outstanding Obligations
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
    -- Request remains in status 'pending'
    RETURN jsonb_build_object(
      'blocked', true,
      'blocking_reservations', v_blocking_reservations,
      'blocking_payments', v_blocking_payments
    );
  END IF;

  -- 5. Irreversible Child Data Erasure
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

  -- 6. Anonymize Business & Product Interest Records
  UPDATE public.logs SET user_id = NULL WHERE user_id = v_request.user_id;
  UPDATE public.feedback SET user_id = NULL WHERE user_id = v_request.user_id;
  UPDATE public.ar_sessions SET user_id = NULL WHERE user_id = v_request.user_id;
  UPDATE public.messages SET sender_id = NULL WHERE sender_id = v_request.user_id;
  UPDATE public.reviews SET user_id = NULL WHERE user_id = v_request.user_id;

  -- 7. Scrub the Profile Row
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

  -- 8. Transition Request Status to auth_revocation_pending
  UPDATE public.account_deletion_requests
  SET
    status = 'auth_revocation_pending',
    processed_at = now(),
    processed_by = auth.uid()
  WHERE id = _request_id;

  -- 9. Record Immutable Audit Log
  SELECT first_name, last_name
  INTO v_actor_profile
  FROM public.profiles
  WHERE id = auth.uid();

  v_actor_name := COALESCE(
    NULLIF(TRIM(CONCAT_WS(' ', v_actor_profile.first_name, v_actor_profile.last_name)), ''),
    'Administrator'
  );

  INSERT INTO public.logs (
    user_id,
    user_name,
    action,
    target_type,
    target_id,
    details,
    timestamp
  ) VALUES (
    auth.uid(),
    v_actor_name,
    'account_deletion_scrubbed',
    'account_deletion_request',
    _request_id::text,
    jsonb_build_object(
      'target_user_id', v_request.user_id,
      'reason', v_request.reason
    ),
    now()
  );

  RETURN jsonb_build_object('blocked', false, 'user_id', v_request.user_id);
END;
$$;

REVOKE ALL ON FUNCTION public.process_account_deletion(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_account_deletion(uuid) TO authenticated;
COMMENT ON FUNCTION public.process_account_deletion(uuid) IS 'B2A-4: Scrubs personal data and transitions request to auth_revocation_pending. Restricted to can_manage_customers().';

-- ----------------------------------------------------------------------------
-- 5. Reject Deletion Request: reject_account_deletion_request()
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reject_account_deletion_request(_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_request record;
  v_actor uuid := auth.uid();
  v_actor_profile record;
  v_actor_name text;
BEGIN
  -- 1. Capability Authorization
  IF NOT public.can_manage_customers() THEN
    RAISE EXCEPTION 'Unauthorized: Only administrators on approved devices can reject account deletion requests.';
  END IF;

  -- 2. Lock & Validate Request
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

  -- 3. Transition to Cancelled
  UPDATE public.account_deletion_requests
  SET status = 'cancelled', processed_at = now(), processed_by = auth.uid()
  WHERE id = _request_id;

  -- 4. Audit Log
  SELECT first_name, last_name
  INTO v_actor_profile
  FROM public.profiles
  WHERE id = v_actor;

  v_actor_name := COALESCE(
    NULLIF(TRIM(CONCAT_WS(' ', v_actor_profile.first_name, v_actor_profile.last_name)), ''),
    'Administrator'
  );

  INSERT INTO public.logs (
    user_id,
    user_name,
    action,
    target_type,
    target_id,
    details,
    timestamp
  ) VALUES (
    v_actor,
    v_actor_name,
    'Rejected account deletion request',
    'account_deletion_request',
    _request_id::text,
    jsonb_build_object('requested_by', v_request.user_id),
    now()
  );

  RETURN jsonb_build_object('rejected', true, 'user_id', v_request.user_id);
END;
$$;

REVOKE ALL ON FUNCTION public.reject_account_deletion_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_account_deletion_request(uuid) TO authenticated;
COMMENT ON FUNCTION public.reject_account_deletion_request(uuid) IS 'B2A-4: Rejects a customer account deletion request. Restricted to can_manage_customers().';

-- ----------------------------------------------------------------------------
-- 6. Self-Service Deletion Request: request_account_deletion()
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_account_deletion(_reason text DEFAULT NULL::text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_blocking_reservations integer;
  v_request_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Verify caller is an active customer (blocked customers retain privacy right; deleted do not)
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles AS p
    WHERE p.id = auth.uid()
      AND p.role = 'customer'
      AND p.deleted = false
  ) THEN
    RAISE EXCEPTION 'Only active customer accounts can request account deletion.';
  END IF;

  -- Financial obligations check
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
$$;

REVOKE ALL ON FUNCTION public.request_account_deletion(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_account_deletion(text) TO authenticated;
COMMENT ON FUNCTION public.request_account_deletion(text) IS 'B2A-4: Self-service account deletion request filing for authenticated customers without unsettled balances.';

-- ----------------------------------------------------------------------------
-- 7. Trigger Hardening: check_profile_updates()
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_profile_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
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
$$;

COMMENT ON FUNCTION public.check_profile_updates() IS 'B2A-4: Hardened trigger function with empty search_path guarding privileged profile mutations.';
