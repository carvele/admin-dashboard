/**
 * src/components/reservations/ReservationCalendar.jsx
 * Month grid + day agenda for the Reservations tab's Calendar view.
 *
 * No calendar library in this project's dependencies, so this is hand-rolled
 * with plain Date math -- the same approach Reservations.jsx already uses
 * elsewhere (parseDate, the date-strip generator in the create-reservation
 * modal) rather than introducing a new dependency for a month grid.
 */

import React, { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Eye, MessageSquare } from 'lucide-react';
import StatusBadge from '../ReservationStatusBadge';
import { formatPaymentDeadline } from '../../utils/reservationDeadline';
import { formatTimeLabel } from '../../utils/helpers';
import './ReservationCalendar.css';

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const sameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

// 6 weeks x 7 days, starting from the Sunday on/before the 1st, so the grid
// always has full weeks including the leading/trailing days of adjacent
// months (shown dimmed).
const buildMonthGrid = (monthDate) => {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const gridStart = new Date(year, month, 1 - firstOfMonth.getDay());
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    return d;
  });
};

const STATUS_DOT_CLASS = {
  Pending: 'cal-dot-pending',
  'To Pay': 'cal-dot-topay',
  'To Pickup': 'cal-dot-topickup',
  Completed: 'cal-dot-completed',
  Cancelled: 'cal-dot-cancelled',
};

const ReservationCalendar = ({ reservations, onView, onMessage }) => {
  const [monthDate, setMonthDate] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState(() => new Date());

  const days = useMemo(() => buildMonthGrid(monthDate), [monthDate]);

  const byDay = useMemo(() => {
    const map = new Map();
    reservations.forEach((res) => {
      if (!res.displayDate) return;
      const key = res.displayDate.toDateString();
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(res);
    });
    return map;
  }, [reservations]);

  const changeMonth = (delta) => {
    setMonthDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  };

  const goToday = () => {
    const today = new Date();
    setMonthDate(today);
    setSelectedDay(today);
  };

  const selectedDayReservations = (byDay.get(selectedDay.toDateString()) || [])
    .slice()
    .sort((a, b) => a.displayDate - b.displayDate);

  return (
    <div className="res-calendar">
      <div className="res-calendar-toolbar">
        <button type="button" className="btn-outline res-calendar-nav" onClick={() => changeMonth(-1)} aria-label="Previous month">
          <ChevronLeft size={16} />
        </button>
        <h3 className="res-calendar-title">
          {monthDate.toLocaleDateString([], { month: 'long', year: 'numeric' })}
        </h3>
        <button type="button" className="btn-outline res-calendar-nav" onClick={() => changeMonth(1)} aria-label="Next month">
          <ChevronRight size={16} />
        </button>
        <button type="button" className="btn-outline res-calendar-today" onClick={goToday}>
          Today
        </button>
      </div>

      <div className="res-calendar-grid res-calendar-weekdays">
        {WEEKDAY_LABELS.map((w) => (
          <div key={w} className="res-calendar-weekday">{w}</div>
        ))}
      </div>

      <div className="res-calendar-grid">
        {days.map((d) => {
          const inMonth = d.getMonth() === monthDate.getMonth();
          const isToday = sameDay(d, new Date());
          const isSelected = sameDay(d, selectedDay);
          const dayRes = byDay.get(d.toDateString()) || [];
          // A day with a payment about to lapse needs to stand out on the
          // whole-month scan, not just be discoverable by clicking in --
          // a 6px dot buried among others didn't do that.
          const hasUrgent = dayRes.some(
            (res) => res.displayStatus === 'To Pay' && formatPaymentDeadline(res.paymentDueAt)?.urgent,
          );
          return (
            <button
              key={d.toISOString()}
              type="button"
              className={[
                'res-calendar-cell',
                !inMonth && 'res-calendar-cell-out',
                isToday && 'res-calendar-cell-today',
                isSelected && 'res-calendar-cell-selected',
                hasUrgent && 'res-calendar-cell-urgent',
              ].filter(Boolean).join(' ')}
              onClick={() => setSelectedDay(d)}
              aria-pressed={isSelected}
              aria-label={`${d.toLocaleDateString([], { month: 'long', day: 'numeric' })}${dayRes.length ? `, ${dayRes.length} reservation${dayRes.length === 1 ? '' : 's'}` : ''}${hasUrgent ? ', payment due soon' : ''}`}
            >
              <span className="res-calendar-daynum">{d.getDate()}</span>
              {dayRes.length > 0 && (
                <>
                  <span className="res-calendar-count">{dayRes.length}</span>
                  <span className="res-calendar-dots">
                    {dayRes.slice(0, 4).map((res, i) => (
                      <span key={res.id ?? i} className={`res-calendar-dot ${STATUS_DOT_CLASS[res.displayStatus] || ''}`} />
                    ))}
                  </span>
                </>
              )}
            </button>
          );
        })}
      </div>

      <div className="res-calendar-agenda">
        <h4 className="res-calendar-agenda-title">
          {selectedDay.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
        </h4>
        {selectedDayReservations.length === 0 ? (
          <p className="res-calendar-agenda-empty">No reservations scheduled.</p>
        ) : (
          <ul className="res-calendar-agenda-list">
            {selectedDayReservations.map((res) => {
              const deadline = res.displayStatus === 'To Pay' ? formatPaymentDeadline(res.paymentDueAt) : null;
              const itemNames = (res.lines || []).map((l) => l.productName).filter(Boolean);
              return (
                <li key={res.id} className={`res-calendar-agenda-item${deadline?.urgent ? ' res-calendar-agenda-item-urgent' : ''}`}>
                  <div className="res-calendar-agenda-time">
                    {/* Same bug as ReservationCard: displayDate comes from
                        the midnight-anchored `date` column, so a time
                        derived from it is midnight reinterpreted in the
                        browser's local timezone, not the real appointment.
                        res.appointmentTime is the actual scheduled time,
                        already resolved to Asia/Manila. */}
                    {res.appointmentTime
                      ? formatTimeLabel(res.appointmentTime)
                      : res.displayDate.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Manila' })}
                  </div>
                  <div className="res-calendar-agenda-main">
                    <p className="res-calendar-agenda-name">{res.displayName}</p>
                    <p className="res-calendar-agenda-items">
                      {itemNames.length > 1
                        ? `${itemNames[0]} +${itemNames.length - 1} more`
                        : itemNames[0] || res.productName || res.outfit}
                    </p>
                    {deadline && (
                      <p className={`res-calendar-agenda-deadline ${deadline.urgent ? 'text-danger' : 'text-gold'}`}>
                        {deadline.label} to pay
                      </p>
                    )}
                  </div>
                  <StatusBadge status={res.displayStatus} showLabel={false} />
                  <button
                    type="button"
                    className="btn-outline res-card-icon"
                    onClick={() => onMessage?.(res)}
                    aria-label={`Message ${res.displayName}`}
                    title="Message buyer"
                  >
                    <MessageSquare size={15} />
                  </button>
                  <button
                    type="button"
                    className="btn-outline res-card-icon"
                    onClick={() => onView(res)}
                    aria-label={`View details for ${res.displayName}`}
                    title="View details"
                  >
                    <Eye size={15} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};

export default ReservationCalendar;
