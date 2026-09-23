/**
 * Interactive mutation guard: one in-flight request per key, never retried.
 *
 * The reservation command RPCs used to raise SQLSTATE 40001 for a stale
 * expected-status check, and PostgREST retries 40001 transactions
 * internally -- one click became thousands of executions. Commands now raise
 * PT409 (HTTP 409); this module keeps the client side equally strict:
 * duplicate clicks are dropped and stale/domain errors are surfaced once.
 */

export const SKIPPED = Symbol('single-flight-skipped');

const inFlight = new Set();

export const isInFlight = (key) => inFlight.has(key);

export const runSingleFlight = async (key, fn) => {
  if (inFlight.has(key)) return SKIPPED;
  inFlight.add(key);
  try {
    return await fn();
  } finally {
    inFlight.delete(key);
  }
};

const STALE_PATTERNS = [
  'changed since it was loaded',
  'status has changed',
  'was already',
];

/** The reservation moved on since it was loaded; refetch, never retry. */
export const isStaleStateError = (err) => {
  if (!err) return false;
  if (err.code === 'PT409' || err.code === '40001') return true;
  const message = String(err.message || '').toLowerCase();
  return STALE_PATTERNS.some((pattern) => message.includes(pattern));
};

export const STALE_STATE_MESSAGE = 'Reservation changed. The latest details have been loaded.';
