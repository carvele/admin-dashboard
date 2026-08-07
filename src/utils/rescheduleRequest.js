/**
 * A customer's pending request to move an appointment.
 *
 * The live booking stays in date/appointment_time; the proposal lives in its
 * own columns until staff answer. requested_at alone decides whether one is
 * outstanding -- the other two columns are meaningless without it, and a CHECK
 * keeps all three together.
 */

export const hasPendingReschedule = (res) => Boolean(res?.rescheduleRequestedAt);

/** The proposed appointment as a Date, or null when nothing is pending. */
export const proposedAppointment = (res) => {
  if (!hasPendingReschedule(res)) return null;
  const raw = res.rescheduleRequestedAtTime;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** "Mon, 11 Aug at 02:00 PM", or null. */
export const formatProposedAppointment = (res) => {
  const d = proposedAppointment(res);
  if (!d) return null;
  return `${d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })} at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
};
