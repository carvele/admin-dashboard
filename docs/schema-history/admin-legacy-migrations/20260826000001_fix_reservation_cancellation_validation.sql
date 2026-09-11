-- Migration: Fix Reservation Cancellation Validation & Stock Holding Triggers
-- 1. Ensure cancellation_reason column exists on public.reservations
-- 2. Update reservation_holds_stock to exclude 'pending' and 'request approval' (stock is held from 'approved' onward)
-- 3. Update validate_reservation_time to bypass store-hours validation when cancelling, completing, or archiving reservations

ALTER TABLE public.reservations 
ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

CREATE OR REPLACE FUNCTION public.reservation_holds_stock(_status text, _deleted boolean)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT NOT coalesce(_deleted, false)
     AND lower(trim(coalesce(_status, ''))) IN ('approved', 'confirmed', 'to pay', 'preparing', 'to pickup', 'fitting', 'active', 'ready');
$function$;

CREATE OR REPLACE FUNCTION public.validate_reservation_time()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.date IS NULL OR NEW.appointment_time IS NULL THEN
    RETURN NEW;
  END IF;

  -- Skip store hours and slot validation if reservation is cancelled, completed, or deleted
  IF COALESCE(NEW.deleted, false) = true 
     OR lower(COALESCE(NEW.status, 'pending')) IN ('cancelled', 'completed') THEN
    RETURN NEW;
  END IF;

  -- Skip validation if updating existing reservation without changing date or appointment_time
  IF TG_OP = 'UPDATE' 
     AND NEW.date IS NOT DISTINCT FROM OLD.date 
     AND NEW.appointment_time IS NOT DISTINCT FROM OLD.appointment_time THEN
    RETURN NEW;
  END IF;

  PERFORM public.assert_bookable_slot(
    NEW.date::date,
    NEW.appointment_time,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE NEW.id END,
    true
  );

  RETURN NEW;
END;
$function$;
