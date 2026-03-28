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
  return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
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

// ── Online status check ─────────────────────────────────────
export const isOnline = (timestamp) => {
  if (!timestamp) return false;
  const ts = typeof timestamp === 'number' ? timestamp : new Date(timestamp).getTime();
  return (Date.now() - ts) < 15 * 60 * 1000; // within 15 mins
};

// ── Currency formatter ──────────────────────────────────────
export const formatCurrency = (amount) => {
  if (!amount || amount === 0) return '₱0';
  return '₱' + amount.toLocaleString();
};

// ── Date formatter ──────────────────────────────────────────
export const formatDate = (dateStr) => {
  if (!dateStr) return 'Unknown';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
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
