/**
 * src/components/inventory/StatusBadge.jsx
 * Stock status badge component
 *
 * WCAG 2.2 AA Compliance:
 *  - Uses text label + icon (never color alone)
 *  - Includes aria-label for screen readers
 *  - Sufficient contrast ratio (3:1 minimum)
 *  - Icon is decorative (aria-hidden)
 */

import React from 'react';
import '../StatusBadge.css';

/**
 * Get icon for status (for semantic purposes, not color-coding).
 * Keyed on the exact label strings produced by utils/stockStatus.js —
 * the single canonical stock-status vocabulary for the app.
 */
const getStatusIcon = (status) => {
  switch (status) {
    case 'No Stock':
      return '✕'; // Empty
    case 'Critical':
      return '⚠'; // Warning
    case 'Very Low':
      return '⬇'; // Low arrow
    case 'Low':
      return '→'; // At level
    case 'Healthy':
      return '✓'; // Check
    default:
      return '?';
  }
};

/**
 * StatusBadge component
 * @param {string} status - One of utils/stockStatus.js's label strings
 * @param {boolean} [showLabel=true] - Whether to show text label
 */
const StatusBadge = ({ status, showLabel = true }) => {
  if (!status) return null;

  const icon = getStatusIcon(status);
  const ariaLabel = `Status: ${status}`;

  return (
    <span
      className={`status-badge status-${status.toLowerCase().replace(/\s+/g, '-')}`}
      role="status"
      aria-label={ariaLabel}
    >
      <span className="status-icon" aria-hidden="true">
        {icon}
      </span>
      {showLabel && (
        <span className="status-label">{status}</span>
      )}
    </span>
  );
};

export default StatusBadge;
