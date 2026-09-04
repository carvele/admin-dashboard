-- Migration for auto-canceling expired reservations

CREATE OR REPLACE FUNCTION auto_cancel_expired_reservations()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $func
DECLARE
    v_buffer interval := '5 minutes';
    v_now timestamptz := now();
    v_appt_time timestamptz;
    r RECORD;
    v_is_expired boolean;
    v_reason text;
    v_cancelled_count integer := 0;
BEGIN
    FOR r IN 
        SELECT id, status, date, appointment_time, payment_due_at
        FROM reservations
        WHERE status IN ('Pending', 'Request Approval', 'To Pay', 'Confirmed')
          AND deleted = false
    LOOP
        v_is_expired := false;
        v_reason := '';
        
        -- Try to determine appointment_time
        BEGIN
            v_appt_time := r.appointment_time::timestamptz;
        EXCEPTION WHEN others THEN
            BEGIN
                v_appt_time := (r.date || ' ' || r.appointment_time || ':00+08')::timestamptz;
            EXCEPTION WHEN others THEN
                v_appt_time := NULL;
            END;
        END;

        IF v_appt_time IS NULL AND r.date IS NOT NULL THEN
            BEGIN
                v_appt_time := (r.date || ' 23:59:00+08')::timestamptz;
            EXCEPTION WHEN others THEN
                v_appt_time := NULL;
            END;
        END;

        -- 1. Pending Review
        IF r.status IN ('Pending', 'Request Approval') THEN
            IF v_appt_time IS NOT NULL AND v_appt_time + v_buffer < v_now THEN
                v_is_expired := true;
                v_reason := 'Auto-cancelled: Appointment window passed without review';
            END IF;
        END IF;

        -- 2. Awaiting Payment / Confirmed
        IF r.status IN ('To Pay', 'Confirmed') THEN
            IF r.payment_due_at IS NOT NULL AND r.payment_due_at::timestamptz + v_buffer < v_now THEN
                v_is_expired := true;
                v_reason := 'Auto-cancelled: Payment deadline passed';
            ELSIF v_appt_time IS NOT NULL AND v_appt_time + v_buffer < v_now THEN
                v_is_expired := true;
                v_reason := 'Auto-cancelled: Appointment time passed without payment';
            END IF;
        END IF;

        IF v_is_expired THEN
            UPDATE reservations
            SET status = 'Cancelled',
                cancellation_reason = v_reason,
                updated_at = v_now
            WHERE id = r.id;
            
            v_cancelled_count := v_cancelled_count + 1;
        END IF;
    END LOOP;
    
    RETURN v_cancelled_count;
END;
$func;

-- Schedule the cron job to run every 5 minutes
SELECT cron.schedule('auto_cancel_reservations_5m', '*/5 * * * *', 'SELECT auto_cancel_expired_reservations()');
