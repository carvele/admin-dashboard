/**
 * Customer change requests (reservation_change_requests), attached to a
 * reservation as `pendingRequest` by the Reservations page. The live booking
 * stays on the reservation row until staff approve.
 */

export const hasPendingReschedule = (res) => res?.pendingRequest?.requestType === 'reschedule';

export const hasPendingReadyCancellation = (res) => res?.pendingRequest?.requestType === 'cancel_ready';

/** The proposed appointment as a Date, or null when nothing is pending. */
export const proposedAppointment = (res) => {
  if (!hasPendingReschedule(res)) return null;
  const d = new Date(res.pendingRequest.requestedFor);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** "Fri, Sep 25 · 2:00 PM" in Asia/Manila, or null. */
export const formatManilaSlot = (value) => {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const date = d.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'Asia/Manila' });
  const time = d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Manila' });
  return `${date} · ${time}`;
};

export const formatProposedAppointment = (res) => formatManilaSlot(proposedAppointment(res));
