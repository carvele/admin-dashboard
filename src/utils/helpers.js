/**
 * Shared utility functions used across multiple components.
 * Extracted to eliminate duplication (was copy-pasted in 4+ files).
 */

// ── Avatar color generator ──────────────────────────────────
// Generates a consistent HSL color from a name string
export const getAvatarColor = (name) => {
  if (!name) return 'hsl(0, 0%, 50%)';
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return `hsl(${Math.abs(hash) % 360}, 50%, 45%)`;
};

// ── User display name resolver ──────────────────────────────
// Handles all name field variations from Firestore docs
export const getUserDisplayName = (user) => {
  if (!user) return 'User';
  if (user.name) return user.name;
  if (user.firstName && user.lastName) return `${user.firstName} ${user.lastName}`;
  if (user.firstName) return user.firstName;
  if (user.first_name && user.last_name) return `${user.first_name} ${user.last_name}`;
  if (user.first_name) return user.first_name;
  if (user.email) return user.email;
  return 'User';
};

// ── User initials ───────────────────────────────────────────
export const getInitials = (name) => {
  if (!name) return 'U';
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .substring(0, 2);
};

// ── Relative time formatter ─────────────────────────────────
export const formatRelativeTime = (timestamp) => {
  if (!timestamp) return 'Never';
  const now = Date.now();
  const ts = typeof timestamp === 'number' ? timestamp : new Date(timestamp).getTime();
  if (isNaN(ts)) return 'Unknown';
  const diff = now - ts;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

// ── Smart date & time formatter ────────────────────────────
export const formatSmartDateTime = (ts, options = {}) => {
  if (!ts) return 'Unknown';
  const date = typeof ts === 'number' ? new Date(ts) : (ts?.seconds ? new Date(ts.seconds * 1000) : new Date(ts));
  if (isNaN(date.getTime())) return 'Unknown';

  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 3600 * 24));
  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (options.short) {
    if (isToday) return timeStr;
    if (isYesterday) return 'Yesterday';
    if (diffDays < 7) return date.toLocaleDateString([], { weekday: 'short' });
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  if (isToday) return `Today ${timeStr}`;
  if (isYesterday) return `Yesterday ${timeStr}`;
  if (diffDays < 7) return `${date.toLocaleDateString([], { weekday: 'short' })} ${timeStr}`;
  return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${timeStr}`;
};

// ── Online status check ─────────────────────────────────────
export const isOnline = (timestamp) => {
  if (!timestamp) return false;
  const ts = typeof timestamp === 'number' ? timestamp : new Date(timestamp).getTime();
  return Date.now() - ts < 15 * 60 * 1000; // within 15 mins
};

// ── Appointment time formatter ──────────────────────────────
// reservations.appointmentTime is already a "HH:MM" 24-hour string resolved
// to Asia/Manila by reservationService's extractTime() -- this only handles
// the 24h -> 12h AM/PM display conversion. Prefer this over reformatting a
// reservation's displayDate: displayDate comes from the `date` column, which
// is midnight-anchored with no time-of-day, so any component that formats a
// *time* from it is showing midnight reinterpreted in whatever timezone the
// browser happens to be in, not the real scheduled appointment time.
export const formatTimeLabel = (timeStr) => {
  if (!timeStr) return '';
  const match = String(timeStr).match(/^(\d{1,2}):(\d{2})/);
  if (!match) return timeStr;
  const hours24 = Number(match[1]);
  const minutes = match[2];
  const period = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${minutes} ${period}`;
};

// ── Currency formatter ──────────────────────────────────────
export const formatCurrency = (amount) => {
  if (!amount || amount === 0) return '₱0';
  return '₱' + amount.toLocaleString();
};

// ── Date formatter ──────────────────────────────────────────
export const formatDate = (ts) => {
  if (!ts) return 'Unknown';
  
  // Handle Firebase Timestamp (has seconds/nanoseconds)
  let d;
  if (typeof ts.toDate === 'function') d = ts.toDate();
  else if (ts.seconds) d = new Date(ts.seconds * 1000);
  else if (ts._seconds) d = new Date(ts._seconds * 1000);
  else d = new Date(ts);

  // Validate the date strictly to avoid "Invalid Date"
  if (!(d instanceof Date) || isNaN(d.getTime())) return 'Unknown';

  return d.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
};

// ── Timestamp Standardizer ──────────────────────────────────
/** Converts mixed timestamp formats (Firebase Timestamp, JS Date, Unix epoch) to a JS Date */
export const formatTimestamp = (ts) => {
  if (!ts) return null;
  // Handle Firebase Timestamp (has seconds/nanoseconds)
  if (ts.seconds) return new Date(ts.seconds * 1000);
  // Handle JS Date or epoch/string
  return new Date(ts);
};

/** Converts a JS Date/string format into a Firebase-like timestamp shape if needed offline */
export const toFirebaseTimestamp = (date) => {
  if (!date) return null;
  const d = new Date(date);
  return { seconds: Math.floor(d.getTime() / 1000), nanoseconds: (d.getTime() % 1000) * 1000000 };
};

// ── Health score label ──────────────────────────────────────
export const getHealthLabel = (score) => {
  if (score >= 80) return { label: 'Excellent', color: '#10B981' };
  if (score >= 50) return { label: 'Good', color: '#F59E0B' };
  if (score >= 25) return { label: 'At Risk', color: '#F97316' };
  return { label: 'Churned', color: '#EF4444' };
};

// ── Security & Sanitization ─────────────────────────────────
import DOMPurify from 'dompurify';

/**
 * Safely sanitize string for display
 * Removes all HTML tags and dangerous attributes to prevent XSS.
 */
export const sanitizeForDisplay = (str) => {
  if (!str) return '';
  return DOMPurify.sanitize(str, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
  });
};

/**
 * Sanitize for display in HTML with limited formatting tags.
 * Example: allow <b>, <i>, <u> tags only
 */
export const sanitizeForRichText = (str) => {
  if (!str) return '';
  return DOMPurify.sanitize(str, {
    ALLOWED_TAGS: ['b', 'i', 'u', 'strong', 'em'],
    ALLOWED_ATTR: [],
  });
};
