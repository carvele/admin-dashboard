/**
 * The payment window is stamped on the reservation as payment_due_at, and
 * until now nothing in the dashboard surfaced it -- staff had no way to see
 * that a reservation was about to lapse. The real deadline is
 * LEAST(24h, appointment_time - 1h), so it is often much shorter than a day.
 */

const HOUR_MS = 60 * 60 * 1000;

/**
 * Recompute the payment window against a new appointment, mirroring the
 * set_payment_due_on_confirm trigger: LEAST(now + 24h, appointment - 1h).
 *
 * The trigger only fires on a transition into an awaiting-payment status, and
 * COALESCEs an existing value, so a reschedule alone leaves the old deadline
 * in place -- which can then fall after the new appointment, or have already
 * expired for one moved further out.
 *
 * @param {string|Date} appointment
 * @returns {string|null} ISO timestamp, or null when the appointment is unusable.
 */
export const computePaymentDueAt = (appointment) => {
  const appt = appointment instanceof Date ? appointment : new Date(appointment);
  if (Number.isNaN(appt.getTime())) return null;
  const cap = Date.now() + 24 * HOUR_MS;
  return new Date(Math.min(cap, appt.getTime() - HOUR_MS)).toISOString();
};

/**
 * @param {string|Date|null|undefined} dueAt
 * @returns {{label: string, urgent: boolean}|null} null when there is no
 *   deadline to show (not yet accepted, or already settled).
 */
export const formatPaymentDeadline = (dueAt) => {
  if (!dueAt) return null;

  const due = dueAt instanceof Date ? dueAt : new Date(dueAt);
  if (Number.isNaN(due.getTime())) return null;

  const remaining = due.getTime() - Date.now();
  if (remaining <= 0) return { label: 'Overdue', urgent: true };

  const minutes = Math.ceil(remaining / 60000);
  if (minutes < 60) return { label: `${minutes}m left`, urgent: true };

  const hours = Math.ceil(remaining / HOUR_MS);
  // Under an hour is the point where staff can still save it with a nudge.
  return { label: `${hours}h left`, urgent: remaining < HOUR_MS };
};
