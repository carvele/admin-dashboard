/**
 * Analytics / Event Tracking Service.
 *
 * Console-based implementation for development.
 * Ready to plug into Google Analytics (gtag) or Firebase Analytics
 * by updating the internal dispatch methods.
 */

const IS_DEV = import.meta.env.DEV;

// Store events in memory for debugging
const eventLog = [];

/**
 * Track a generic event.
 * @param {string} eventName — e.g. 'reservation_created'
 * @param {Object} properties — arbitrary key-value payload
 */
export function trackEvent(eventName, properties = {}) {
  const entry = {
    event: eventName,
    ...properties,
    timestamp: new Date().toISOString(),
  };

  eventLog.push(entry);

  // Google Analytics gtag (if loaded)
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', eventName, properties);
  }

  if (IS_DEV) {
    console.log('%c📊 Analytics', 'color: #6366F1; font-weight: bold;', eventName, properties);
  }
}

/**
 * Track a page view.
 * @param {string} pageName — e.g. 'Dashboard', 'Clothing Catalog'
 */
export function trackPageView(pageName) {
  trackEvent('page_view', { page_title: pageName });
}

/**
 * Track a user action (CRUD operations, status changes, etc.).
 * @param {string} action — e.g. 'created_reservation', 'updated_product'
 * @param {Object} details — contextual details
 */
export function trackUserAction(action, details = {}) {
  trackEvent('user_action', { action, ...details });
}

/**
 * Track an error occurrence.
 * @param {string} errorName — e.g. 'firestore_write_failed'
 * @param {Object} errorDetails — error context
 */
export function trackError(errorName, errorDetails = {}) {
  trackEvent('error', {
    error_name: errorName,
    ...errorDetails,
  });

  // Also log to console.error for visibility
  console.error(`[Analytics Error] ${errorName}`, errorDetails);
}

/**
 * Get the in-memory event log (useful for debugging).
 * @returns {Array} — array of logged events
 */
export function getEventLog() {
  return [...eventLog];
}

/**
 * Measure async operation duration.
 * @param {string} operationName — human-readable label
 * @param {Function} asyncFn — async function to measure
 * @returns {Promise<*>} — result of asyncFn
 */
export async function measureAsync(operationName, asyncFn) {
  const start = performance.now();
  try {
    const result = await asyncFn();
    const duration = performance.now() - start;

    trackEvent('performance', {
      operation: operationName,
      duration_ms: Math.round(duration),
    });

    if (duration > 2000) {
      console.warn(`⚠️ Slow operation: ${operationName} took ${duration.toFixed(0)}ms`);
    }

    return result;
  } catch (error) {
    const duration = performance.now() - start;
    trackError('operation_failed', {
      operation: operationName,
      duration_ms: Math.round(duration),
      message: error.message,
    });
    throw error;
  }
}
