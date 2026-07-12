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
import { StockStatus } from '../../types/inventory';
import '../StatusBadge.css';

/**
 * Get icon for status (for semantic purposes, not color-coding)
 */
const getStatusIcon = (status) => {
  switch (status) {
    case StockStatus.NO_STOCK:
      return '✕'; // Empty
    case StockStatus.CRITICAL:
      return '⚠'; // Warning
    case StockStatus.VERY_LOW:
      return '⬇'; // Low arrow
    case StockStatus.LOW:
      return '→'; // At level
    case StockStatus.HEALTHY:
      return '✓'; // Check
    case StockStatus.OVERSTOCK:
      return '↑'; // High arrow
    default:
      return '?';
  }
};

/**
 * StatusBadge component
 * @param {string} status - One of StockStatus enum values
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
