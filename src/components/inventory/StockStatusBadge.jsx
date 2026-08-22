import React from 'react';
import { Flame } from 'lucide-react';
import { getStockHealth } from '../../utils/stockStatus';

/**
 * Reusable StockStatusBadge component.
 * Displays standardized tier badge (In Stock, Low Stock, Very Low, Critical Stock, Out of Stock, Fully Reserved).
 *
 * @param {Object} props
 * @param {number} props.available - Free units available
 * @param {number} props.total - Total capacity/stocked
 * @param {number} [props.reserved=0] - Active reserved units
 * @param {boolean} [props.showIcon=true] - Whether to show Flame icon on critical tier
 * @param {string} [props.className=''] - Additional custom CSS classes
 */
export const StockStatusBadge = ({
  available,
  total,
  reserved = 0,
  showIcon = true,
  className = '',
}) => {
  const health = getStockHealth(available, total, reserved);

  return (
    <span className={`stock-tier-badge ${health.tier} ${className}`.trim()}>
      {showIcon && health.tier === 'critical' && <Flame size={10} />}
      {health.label}
    </span>
  );
};

export default StockStatusBadge;
