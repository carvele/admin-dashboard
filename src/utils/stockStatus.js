/**
 * @fileoverview stockStatus.js
 * Centralized, pure-function module for all 5-tier demand-driven inventory
 * stock status logic. Used by Inventory page, Clothing Catalog, Dashboard,
 * and the Sidebar low-stock badge.
 *
 * This is the single canonical stock-status vocabulary for the app — it
 * replaces two previously-competing systems that used different label text
 * for equivalent tiers (stockHealth.js's "Very Low Stock"/"Critical Stock"
 * vs. calculateStock.ts's baseline-percentage "Very Low"/"Critical", which
 * was unused by any real UI and has been removed). Labels here are the
 * short form so StatusBadge's icon lookup (keyed on these exact strings)
 * never silently falls back to a "?" icon.
 *
 * --- HOW THE TIERS WORK ---
 * Stock status is NOT just a raw ratio. It accounts for demand pressure:
 *   effectiveRatio  = available / total           (raw fill level, 0→1)
 *   demandPressure  = reserved / total            (how much is committed, 0→1)
 *   adjustedScore   = effectiveRatio - (demandPressure × DEMAND_WEIGHT)
 *
 * When reservations are high, the adjustedScore shrinks → tier escalates upward.
 * Example:
 *   60% available + 0% reserved  → score 0.60 → "Low"
 *   60% available + 40% reserved → score 0.50 → "Very Low" (escalated!)
 *
 * --- TIERS ---
 *   > 0.75  → Healthy
 *   > 0.50  → Low
 *   > 0.25  → Very Low
 *   > 0.00  → Critical
 *   = 0.00  → No Stock
 */

/** How much weight demand pressure adds to urgency (0 → 1). 0.25 = 25% shift max. */
const DEMAND_WEIGHT = 0.25;

/**
 * @typedef {Object} StockStatus
 * @property {'healthy'|'low'|'very-low'|'critical'|'no-stock'} tier
 * @property {string} label            - Human-readable label
 * @property {string} color            - CSS var reference for text/fill color
 * @property {string} bgColor          - CSS var reference for background color
 * @property {number} percent          - Raw available% (0–100) for progress bar display
 * @property {number} adjustedScore    - Demand-adjusted score (0–1)
 * @property {'none'|'low'|'moderate'|'high'} demandLevel - Pressure descriptor
 * @property {string} urgencyTooltip   - Explanation string for staff tooltip
 * @property {number} priority         - Sort priority: 1 (worst) → 5 (best)
 * @property {number} demandScore      - Raw 0–100 demand pressure for persistence
 */

/**
 * Computes the full stock status object for a given inventory item.
 *
 * @param {number} available - Units currently free to reserve
 * @param {number} total     - Total units ever stocked (capacity)
 * @param {number} [reserved=0] - Units currently held by active reservations
 * @returns {StockStatus}
 */
export const getStockHealth = (available, total, reserved = 0) => {
  // --- Guard: zero-total means nothing was ever stocked ---
  if (!total || total <= 0) {
    return {
      tier: 'no-stock',
      label: 'No Stock',
      color: 'var(--stock-none)',
      bgColor: 'var(--stock-none-bg)',
      percent: 0,
      adjustedScore: 0,
      demandLevel: 'none',
      urgencyTooltip: 'No stock has been added for this item yet.',
      priority: 1,
      demandScore: 0,
    };
  }

  // Safe clamp
  const safeAvailable = Math.max(0, available || 0);
  const safeReserved  = Math.max(0, reserved  || 0);
  const safeTotal     = Math.max(1, total);

  const effectiveRatio  = safeAvailable / safeTotal;
  const demandPressure  = Math.min(1, safeReserved / safeTotal);
  const adjustedScore   = Math.max(0, effectiveRatio - demandPressure * DEMAND_WEIGHT);

  // Display percentage is always the raw available ratio (visual honesty)
  const percent = Math.round(effectiveRatio * 100);

  // Demand level label for tooltip
  let demandLevel;
  if (demandPressure >= 0.5)      demandLevel = 'high';
  else if (demandPressure >= 0.25) demandLevel = 'moderate';
  else if (demandPressure > 0)     demandLevel = 'low';
  else                             demandLevel = 'none';

  // Demand score persisted for later reference (0–100 integer)
  const demandScore = Math.round(demandPressure * 100);

  // --- Tier classification via adjustedScore ---
  if (safeAvailable === 0) {
    // Explicit zero available — always No Stock regardless of demand
    const tooltip = safeReserved > 0
      ? `All ${safeTotal} units are currently reserved. No units available for new reservations.`
      : 'This item is completely out of stock. Restock immediately.';
    return {
      tier: 'no-stock',
      label: 'No Stock',
      color: 'var(--stock-none)',
      bgColor: 'var(--stock-none-bg)',
      percent: 0,
      adjustedScore: 0,
      demandLevel,
      urgencyTooltip: tooltip,
      priority: 1,
      demandScore,
    };
  }

  if (adjustedScore > 0.75) {
    return {
      tier: 'healthy',
      label: 'Healthy',
      color: 'var(--stock-healthy)',
      bgColor: 'var(--stock-healthy-bg)',
      percent,
      adjustedScore,
      demandLevel,
      urgencyTooltip: buildTooltip('Healthy', percent, demandLevel, safeReserved, safeTotal),
      priority: 5,
      demandScore,
    };
  }

  if (adjustedScore > 0.50) {
    return {
      tier: 'low',
      label: 'Low',
      color: 'var(--stock-low)',
      bgColor: 'var(--stock-low-bg)',
      percent,
      adjustedScore,
      demandLevel,
      urgencyTooltip: buildTooltip('Low', percent, demandLevel, safeReserved, safeTotal),
      priority: 4,
      demandScore,
    };
  }

  if (adjustedScore > 0.35) {
    return {
      tier: 'very-low',
      label: 'Very Low',
      color: 'var(--stock-very-low)',
      bgColor: 'var(--stock-very-low-bg)',
      percent,
      adjustedScore,
      demandLevel,
      urgencyTooltip: buildTooltip('Very Low', percent, demandLevel, safeReserved, safeTotal),
      priority: 3,
      demandScore,
    };
  }

  // adjustedScore > 0 (already handled available===0 above)
  return {
    tier: 'critical',
    label: 'Critical',
    color: 'var(--stock-critical)',
    bgColor: 'var(--stock-critical-bg)',
    percent,
    adjustedScore,
    demandLevel,
    urgencyTooltip: buildTooltip('Critical', percent, demandLevel, safeReserved, safeTotal),
    priority: 2,
    demandScore,
  };
};

/**
 * Builds a human-readable urgency tooltip string.
 * @param {string} tierLabel
 * @param {number} percent
 * @param {'none'|'low'|'moderate'|'high'} demandLevel
 * @param {number} reserved
 * @param {number} total
 * @returns {string}
 */
function buildTooltip(tierLabel, percent, demandLevel, reserved, total) {
  const demandNote = {
    none:     `No active reservations — raw availability at ${percent}%.`,
    low:      `${reserved} of ${total} units reserved (low demand). Stock at ${percent}%.`,
    moderate: `${reserved} of ${total} units reserved — moderate demand pressure is reducing effective stock level.`,
    high:     `⚠ High reservation pressure: ${reserved} of ${total} units held by active bookings. Effective availability is lower than displayed.`,
  }[demandLevel];

  const actionNote = {
    'Healthy':   'No action needed. Monitor regularly.',
    'Low':       'Consider scheduling a restock in the near future.',
    'Very Low':  'Restock advised — stock may run out soon especially with current demand.',
    'Critical':  'Urgent restock required. Risk of stockout for incoming reservations.',
  }[tierLabel] || '';

  return `${tierLabel}: ${demandNote} ${actionNote}`.trim();
}

/**
 * Returns only the sort priority integer. Useful when the full status object
 * is not needed (e.g., for sorting only).
 * @param {number} available
 * @param {number} total
 * @param {number} [reserved=0]
 * @returns {number} 1 (worst) → 5 (best)
 */
export const getStockPriority = (available, total, reserved = 0) => {
  return getStockHealth(available, total, reserved).priority;
};

/**
 * Returns true if the item should trigger an alert on the Dashboard.
 * Alerts = tier is very-low, critical, or no-stock.
 * @param {number} available
 * @param {number} total
 * @param {number} [reserved=0]
 * @returns {boolean}
 */
export const isStockAlert = (available, total, reserved = 0) => {
  const { tier } = getStockHealth(available, total, reserved);
  return tier === 'very-low' || tier === 'critical' || tier === 'no-stock';
};

/**
 * Returns a tier breakdown count object from an array of inventory items.
 * @param {Array<{available: number, total: number, reserved: number}>} items
 * @returns {{ healthy: number, low: number, veryLow: number, critical: number, noStock: number, alerts: number }}
 */
export const getStockBreakdown = (items = []) => {
  const counts = { healthy: 0, low: 0, veryLow: 0, critical: 0, noStock: 0 };
  items.forEach(({ available, total, reserved }) => {
    const { tier } = getStockHealth(available, total, reserved);
    if (tier === 'healthy')    counts.healthy++;
    else if (tier === 'low')   counts.low++;
    else if (tier === 'very-low')  counts.veryLow++;
    else if (tier === 'critical')  counts.critical++;
    else counts.noStock++;
  });
  return { ...counts, alerts: counts.veryLow + counts.critical + counts.noStock };
};
