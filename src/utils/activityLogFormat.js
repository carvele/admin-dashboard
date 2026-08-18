/**
 * Activity-log presentation helpers.
 *
 * The `logs` table stores a free-form `action` string plus an untyped
 * `details` JSON blob (see logAction in lib/supabaseService.js). This module
 * turns that into something a boutique owner can read at a glance, without
 * discarding anything: the ActivityLog page renders the sentence produced
 * here, the field diffs, and the untouched raw JSON.
 *
 * Every function must degrade gracefully — an unrecognised action still
 * produces a usable row rather than an empty one.
 */

// ── Action classification ────────────────────────────────────────────────────

/**
 * Bucket an action string into a kind, used for the row icon and colour.
 * Order matters: 'restock' is checked before the generic 'update'.
 */
export const getActionKind = (action = '') => {
  const a = String(action).toLowerCase();

  if (/restock|stock|inventory sync|quantity/.test(a)) return 'stock';
  if (/creat|added|invit|new /.test(a)) return 'create';
  if (/delet|archiv|remov|declin|cancel/.test(a)) return 'delete';
  if (/restor|reactivat|approv/.test(a)) return 'restore';
  if (/login|logout|sign|device|password|auth|permission|role/.test(a)) return 'auth';
  if (/sent|notif|messag|repl|broadcast/.test(a)) return 'message';
  if (/updat|edit|renam|chang|set /.test(a)) return 'update';
  return 'neutral';
};

/** Human label for each kind — colour is never the only signal. */
export const ACTION_KIND_LABELS = {
  stock: 'Stock',
  create: 'Created',
  delete: 'Removed',
  restore: 'Restored',
  auth: 'Security',
  message: 'Message',
  update: 'Updated',
  neutral: 'Activity',
};

// ── Detail-key handling ──────────────────────────────────────────────────────

/**
 * Keys that identify *what* was acted on rather than describing a change.
 * Surfaced in the sentence, so they're not repeated in the diff table.
 */
const SUBJECT_KEYS = ['itemName', 'productName', 'name', 'staffName', 'customerName', 'title'];

/** Keys that qualify the subject (a variant, a size, a colourway). */
const QUALIFIER_KEYS = ['size', 'color', 'colour', 'pattern', 'variant', 'category'];

/** Recognised before/after pairs, in priority order. */
const DIFF_PAIRS = [
  ['qtyBefore', 'qtyAfter'],
  ['before', 'after'],
  ['from', 'to'],
  ['oldValue', 'newValue'],
  ['previous', 'current'],
];

const pick = (details, keys) => {
  for (const k of keys) {
    if (details?.[k] !== undefined && details[k] !== null && details[k] !== '') {
      return { key: k, value: details[k] };
    }
  }
  return null;
};

/** `qtyAdded` → `Qty Added`; `itemName` → `Item Name`. */
export const humanizeKey = (key = '') =>
  String(key)
    .replace(/_/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase())
    .trim();

/** Render any JSON value as a short display string. */
export const formatValue = (value) => {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.length ? value.join(', ') : '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

// ── Sentence + diff extraction ───────────────────────────────────────────────

/**
 * Build the readable primary line for a log row.
 *
 * Returns parts rather than a string so the component can emphasise the
 * subject and the delta without parsing text back apart.
 *
 * @returns {{action: string, subject: string|null, qualifier: string|null,
 *            delta: {from: string, to: string}|null, amount: string|null}}
 */
export const formatLogSentence = (log) => {
  const details = log?.details && typeof log.details === 'object' ? log.details : {};

  const subject = pick(details, SUBJECT_KEYS);

  const qualifierParts = QUALIFIER_KEYS
    .map((k) => details[k])
    .filter((v) => v !== undefined && v !== null && v !== '');

  // Explicit before/after wins; otherwise fall back to a bare delta like qtyAdded.
  let delta = null;
  for (const [fromKey, toKey] of DIFF_PAIRS) {
    if (details[fromKey] !== undefined && details[toKey] !== undefined) {
      delta = { from: formatValue(details[fromKey]), to: formatValue(details[toKey]) };
      break;
    }
  }

  const amountEntry = pick(details, ['qtyAdded', 'quantity', 'amount']);
  let amount = null;
  if (amountEntry) {
    const n = Number(amountEntry.value);
    amount = Number.isFinite(n) && n > 0 ? `+${n}` : formatValue(amountEntry.value);
  }

  return {
    // Always present — the raw action is the guaranteed fallback.
    action: log?.action || 'Recorded activity',
    subject: subject ? formatValue(subject.value) : null,
    qualifier: qualifierParts.length ? qualifierParts.join(' / ') : null,
    delta,
    amount,
  };
};

/**
 * Field-level changes for the drawer's diff table.
 * Only pairs that genuinely differ are returned.
 */
export const extractChanges = (details) => {
  if (!details || typeof details !== 'object') return [];
  const changes = [];

  for (const [fromKey, toKey] of DIFF_PAIRS) {
    if (details[fromKey] !== undefined && details[toKey] !== undefined) {
      const from = formatValue(details[fromKey]);
      const to = formatValue(details[toKey]);
      if (from !== to) {
        changes.push({ field: humanizeKey(details.field || fromKey.replace(/before|from|old|previous/i, '') || 'Value'), from, to });
      }
    }
  }

  // `changes: { price: {from, to}, ... }` — the shape newer writers should use.
  if (details.changes && typeof details.changes === 'object' && !Array.isArray(details.changes)) {
    for (const [field, pair] of Object.entries(details.changes)) {
      if (pair && typeof pair === 'object' && ('from' in pair || 'to' in pair)) {
        const from = formatValue(pair.from);
        const to = formatValue(pair.to);
        if (from !== to) changes.push({ field: humanizeKey(field), from, to });
      }
    }
  }

  return changes;
};

/**
 * Remaining detail keys worth showing as plain key/value rows —
 * everything not already consumed by the sentence or the diff table.
 */
export const extractContext = (details) => {
  if (!details || typeof details !== 'object') return [];
  const consumed = new Set([
    ...SUBJECT_KEYS,
    ...QUALIFIER_KEYS,
    ...DIFF_PAIRS.flat(),
    'changes',
    'field',
    'qtyAdded',
    'quantity',
    'amount',
  ]);
  return Object.entries(details)
    .filter(([k, v]) => !consumed.has(k) && v !== undefined && v !== null && v !== '')
    .map(([k, v]) => ({ key: humanizeKey(k), value: formatValue(v) }));
};

// ── Time helpers ─────────────────────────────────────────────────────────────

/** "2h ago" / "just now" — relative label for the primary timestamp. */
export const relativeTime = (timestamp, now = Date.now()) => {
  const t = new Date(timestamp).getTime();
  if (!Number.isFinite(t)) return '';
  const diff = Math.max(0, now - t);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(t).toLocaleDateString('en-PH', { day: 'numeric', month: 'short' });
};

/** Full timestamp for the `title` tooltip and the drawer. */
export const absoluteTime = (timestamp) => {
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-PH', { dateStyle: 'full', timeStyle: 'medium' });
};

/**
 * Date-group heading for a log's day: `Today`, `Yesterday`,
 * or `Monday, 17 August`.
 */
export const dateGroupLabel = (timestamp, now = new Date()) => {
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return 'Unknown date';

  const startOfDay = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dayDiff = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);

  if (dayDiff === 0) return 'Today';
  if (dayDiff === 1) return 'Yesterday';
  return d.toLocaleDateString('en-PH', { weekday: 'long', day: 'numeric', month: 'long' });
};

/** Group an ordered page of logs into [{ label, items }] runs by calendar day. */
export const groupLogsByDay = (logs = [], now = new Date()) => {
  const groups = [];
  for (const log of logs) {
    const label = dateGroupLabel(log.timestamp, now);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(log);
    else groups.push({ label, items: [log] });
  }
  return groups;
};

// ── Actor avatar ─────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  { bg: '#e8f0fe', fg: '#1a56b0' },
  { bg: '#e6f7ec', fg: '#1a7d3a' },
  { bg: '#fdf0e6', fg: '#b05e1a' },
  { bg: '#f3e8fd', fg: '#7a1ab0' },
  { bg: '#fde8e8', fg: '#c0392b' },
  { bg: '#fdf2f8', fg: '#be185d' },
];

/** Up to two initials from a display name. */
export const initialsOf = (name = '') => {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

/** Stable colour per actor — the same user is always the same colour. */
export const avatarColor = (seed = '') => {
  const s = String(seed) || '?';
  let hash = 0;
  for (let i = 0; i < s.length; i += 1) {
    hash = (hash * 31 + s.charCodeAt(i)) | 0;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
};
