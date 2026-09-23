/**
 * Direct staff reschedule of a pre-Ready appointment.
 *
 * Offers only bookable 30-minute slots (store hours, closures, capacity) in
 * Asia/Manila. The server revalidates everything; this only keeps staff from
 * picking a past, closed or full slot in the first place.
 */
import { useEffect, useMemo, useState } from 'react';
import { Modal } from '../common/Modal';
import { fetchStoreClosures, fetchStoreHours } from '../../services/settingsService';
import { getSlotBookedCounts } from '../../services/reservationService';
import { formatManilaSlot } from '../../utils/rescheduleRequest';

const MANILA = 'Asia/Manila';
const REASON_MAX = 500;

const manilaDateKey = (d = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: MANILA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

const manilaMinutesNow = () => {
  const [h, m] = new Intl.DateTimeFormat('en-GB', { timeZone: MANILA, hour: '2-digit', minute: '2-digit', hour12: false })
    .format(new Date())
    .split(':')
    .map(Number);
  return h * 60 + m;
};

const toMinutes = (hhmm) => {
  const [h, m] = String(hhmm || '').split(':').map(Number);
  return Number.isFinite(h) ? h * 60 + (m || 0) : null;
};

const toHHMM = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

const label12h = (minutes) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};

const RescheduleDialog = ({ res, isOpen, submitting, onClose, onSubmit }) => {
  const currentAppointment = res?.appointmentAt || null;
  const todayKey = manilaDateKey();
  const currentKey = currentAppointment ? manilaDateKey(currentAppointment) : todayKey;

  const [date, setDate] = useState(currentKey < todayKey ? todayKey : currentKey);
  const [time, setTime] = useState('');
  const [reason, setReason] = useState('');
  const [hours, setHours] = useState([]);
  const [closures, setClosures] = useState([]);
  const [booked, setBooked] = useState({});
  const [loadingSlots, setLoadingSlots] = useState(false);

  useEffect(() => {
    if (!isOpen) return undefined;
    let active = true;
    Promise.all([fetchStoreHours(), fetchStoreClosures()])
      .then(([h, c]) => {
        if (!active) return;
        setHours(h || []);
        setClosures(c || []);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !date) return undefined;
    let active = true;
    setLoadingSlots(true);
    setTime('');
    getSlotBookedCounts(date)
      .then((rows) => {
        if (!active) return;
        setBooked(Object.fromEntries(rows.map((r) => [String(r.slot_time).slice(0, 5), r.booked_count])));
      })
      .catch(() => { if (active) setBooked({}); })
      .finally(() => { if (active) setLoadingSlots(false); });
    return () => { active = false; };
  }, [isOpen, date]);

  const { slots, closedReason } = useMemo(() => {
    if (!date || hours.length === 0) return { slots: [], closedReason: null };
    const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
    const day = hours.find((h) => h.day_of_week === dow);
    if (!day) return { slots: [], closedReason: 'Store hours are not configured for this day.' };
    const closure = closures.find((c) => c.closure_date === date);
    if (closure && (closure.is_fully_closed ?? true)) {
      return { slots: [], closedReason: `Boutique closed: ${closure.reason || 'Closed'}` };
    }
    if (!closure && day.is_closed) return { slots: [], closedReason: 'Boutique is closed on this day.' };

    const open = toMinutes(closure?.custom_open_time || day.open_time);
    const close = toMinutes(closure?.custom_close_time || day.close_time);
    const capacity = day.slot_capacity ?? 3;
    const nowMinutes = date === todayKey ? manilaMinutesNow() : -1;
    const currentSlot = currentAppointment && currentKey === date
      ? toHHMM(toMinutes(new Intl.DateTimeFormat('en-GB', { timeZone: MANILA, hour: '2-digit', minute: '2-digit', hour12: false }).format(currentAppointment)))
      : null;

    const list = [];
    for (let m = Math.ceil(open / 30) * 30; m < close; m += 30) {
      const key = toHHMM(m);
      if (m <= nowMinutes) continue;
      const count = booked[key] ?? 0;
      const isCurrent = key === currentSlot;
      list.push({ key, label: label12h(m), full: !isCurrent && count >= capacity, isCurrent });
    }
    return { slots: list, closedReason: null };
  }, [date, hours, closures, booked, todayKey, currentKey, currentAppointment]);

  const trimmedReason = reason.trim();
  const canSubmit = Boolean(date && time && trimmedReason && !submitting);

  const submit = (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit({ date, time: `${time}:00`, reason: trimmedReason });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      dismissable={!submitting}
      stacked
      title="Reschedule reservation"
      maxWidth={520}
      footer={(
        <>
          <button type="button" className="btn-outline" onClick={onClose} disabled={submitting}>Cancel</button>
          <button type="submit" form="reschedule-form" className="btn-primary" disabled={!canSubmit}>
            {submitting ? 'Saving…' : 'Confirm reschedule'}
          </button>
        </>
      )}
    >
      <form id="reschedule-form" onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <dl className="res-dialog-summary">
          <div><dt>Customer</dt><dd>{res?.displayName || res?.customerName || 'Customer'}</dd></div>
          <div><dt>Booking</dt><dd>{res?.displayId || res?.id}</dd></div>
          <div><dt>Current appointment</dt><dd>{formatManilaSlot(currentAppointment) || 'Not scheduled'}</dd></div>
        </dl>

        <div className="form-group">
          <label className="label" htmlFor="reschedule-new-date">New date *</label>
          <input
            id="reschedule-new-date"
            type="date"
            className="input-field"
            min={todayKey}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </div>

        <div className="form-group">
          <label className="label" htmlFor="reschedule-new-time">Available time *</label>
          <select
            id="reschedule-new-time"
            className="input-field"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            required
            disabled={loadingSlots || Boolean(closedReason) || slots.length === 0}
          >
            <option value="" disabled>
              {loadingSlots ? 'Loading slots…' : closedReason || (slots.length === 0 ? 'No bookable times left' : 'Select a time')}
            </option>
            {slots.map((slot) => (
              <option key={slot.key} value={slot.key} disabled={slot.full || slot.isCurrent}>
                {slot.label}{slot.isCurrent ? ' (current)' : slot.full ? ' (full)' : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label className="label" htmlFor="reschedule-reason">Reason shown to customer *</label>
          <textarea
            id="reschedule-reason"
            className="input-field"
            rows={3}
            maxLength={REASON_MAX}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. The item needs one more fitting adjustment."
            required
            style={{ resize: 'vertical' }}
          />
          <span className="form-hint">{reason.length}/{REASON_MAX} · The customer will be notified of this change.</span>
        </div>
      </form>
    </Modal>
  );
};

export default RescheduleDialog;
