/**
 * The payment window is stamped on the reservation as payment_due_at, and
 * until now nothing in the dashboard surfaced it -- staff had no way to see
 * that a reservation was about to lapse. The real deadline is
 * LEAST(24h, appointment_time - 1h), so it is often much shorter than a day.
 */

const HOUR_MS = 60 * 60 * 1000;

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
