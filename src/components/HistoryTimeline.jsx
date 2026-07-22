import React from 'react';
import { Loader, ChevronRight } from 'lucide-react';
import './HistoryTimeline.css';

/**
 * Generic vertical timeline for audit/history feeds.
 * Extracted from StaffProfile.jsx so product, customer, and staff history
 * panels can all render through one component.
 *
 * Each entry: { id, dotVariant?, typeLabel, previousValue?, newValue?, note?, actorName?, timestamp }
 * previousValue/newValue are optional — omit both to render a plain action entry with no before/after row.
 */
const HistoryTimeline = ({ entries, loading, emptyText = 'No history recorded yet.' }) => {
  if (loading) {
    return (
      <div className="ht-empty">
        <Loader size={20} className="spin" /> Loading history…
      </div>
    );
  }
  if (!entries?.length) {
    return <div className="ht-empty">{emptyText}</div>;
  }
  return (
    <ul className="ht-timeline">
      {entries.map((entry) => (
        <li key={entry.id} className="ht-item">
          <div className={`ht-dot ${entry.dotVariant === 'block' ? 'ht-dot-block' : 'ht-dot-status'}`} />
          <div className="ht-content">
            <div className="ht-header">
              <span className="ht-type">{entry.typeLabel}</span>
              <span className="ht-date">
                {new Date(entry.timestamp).toLocaleString('en-PH', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              </span>
            </div>
            {(entry.previousValue !== undefined || entry.newValue !== undefined) && (
              <div className="ht-change">
                <span className="ht-old">{entry.previousValue ?? '—'}</span>
                <ChevronRight size={14} className="ht-arrow" />
                <span className="ht-new">{entry.newValue ?? '—'}</span>
              </div>
            )}
            {entry.note && <p className="ht-note">"{entry.note}"</p>}
            <span className="ht-actor">by {entry.actorName || 'System'}</span>
          </div>
        </li>
      ))}
    </ul>
  );
};

export default HistoryTimeline;
