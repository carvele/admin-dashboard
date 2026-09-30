/**
 * contentModeration.js
 *
 * Centralized client-side moderation error handling for the Admin Dashboard.
 * Coordinates with PostgreSQL moderation layer (PT422 / CONTENT_MODERATION_BLOCKED).
 */

export const CONTENT_MODERATION_CODE = 'PT422';
export const CONTENT_MODERATION_BLOCKED = 'CONTENT_MODERATION_BLOCKED';

export const DEFAULT_SUBMISSION_MODERATION_MESSAGE =
  'Please remove inappropriate or offensive language before submitting.';

export const DEFAULT_MESSAGE_MODERATION_MESSAGE =
  'Please remove inappropriate or offensive language before sending.';

/**
 * Checks whether an error represents a content moderation block.
 * @param {unknown} error
 * @returns {boolean}
 */
export function isContentModerationError(error) {
  if (!error) return false;

  if (typeof error === 'string') {
    const lower = error.toLowerCase();
    return (
      error.includes('PT422') ||
      lower.includes('content_moderation_blocked') ||
      lower.includes('inappropriate or offensive language')
    );
  }

  if (typeof error === 'object' && error !== null) {
    const code = String(error.code || error.statusCode || error.status || '');
    const message = String(error.message || '');
    const details = String(error.details || '');
    const hint = String(error.hint || '');

    if (code === CONTENT_MODERATION_CODE) return true;
    if (message.includes(CONTENT_MODERATION_BLOCKED)) return true;
    if (details.includes(CONTENT_MODERATION_BLOCKED)) return true;
    if (hint.includes('inappropriate or offensive language')) return true;

    if (error.cause) {
      return isContentModerationError(error.cause);
    }
  }

  return false;
}

/**
 * Extracts a user-friendly message for moderation errors.
 * @param {unknown} error
 * @param {'submitting' | 'sending'} fallbackAction
 * @returns {string}
 */
export function getContentModerationMessage(error, fallbackAction = 'submitting') {
  if (typeof error === 'object' && error !== null) {
    const hint = error.hint || error.cause?.hint;
    if (typeof hint === 'string' && hint.trim().length > 0) {
      return hint.trim();
    }
    const message = error.message || error.cause?.message;
    if (typeof message === 'string' && message.includes('Please remove inappropriate')) {
      return message.trim();
    }
  }

  return fallbackAction === 'sending'
    ? DEFAULT_MESSAGE_MODERATION_MESSAGE
    : DEFAULT_SUBMISSION_MODERATION_MESSAGE;
}
