/**
 * Centralized permission matrix for the JezSy Collection Admin.
 *
 * Roles (as stored in profiles.role): 'owner', 'admin', 'staff'.
 *   owner / admin = full access  ("super admin")
 *   staff         = limited, view-only monitoring + full messaging
 *
 * IMPORTANT: authorization keys off the lowercase DB role. can() normalizes
 * whatever it's given (the AuthContext hands consumers a capitalized
 * `user.role` like 'Staff' for display) so 'Staff', 'staff', and 'STAFF' all
 * resolve the same. Never gate off the capitalized value directly — that was
 * the source of a silent bug where staff were denied everything because the
 * matrix listed 'Sales Staff' and the value passed was 'Staff'.
 *
 * This mirrors the RLS policies on the database — the UI hides what the role
 * can't do, and RLS is the real enforcement boundary behind it.
 */

const OWNER = 'owner';
const ADMIN = 'admin';
const STAFF = 'staff';

const FULL = [OWNER, ADMIN];          // full-access tier
const ALL = [OWNER, ADMIN, STAFF];    // everyone who can reach the dashboard

const PERMISSIONS = {
  // ── Dashboard ──────────────────────────────────────────────
  view_dashboard: ALL,
  customize_dashboard: FULL, // staff can view but not re-arrange widgets

  // ── Clothing catalog ───────────────────────────────────────
  view_catalog: ALL,
  create_catalog: FULL,
  edit_catalog: FULL,
  archive_catalog: FULL,

  // ── Inventory ──────────────────────────────────────────────
  view_inventory: ALL,
  manage_inventory: FULL, // stock movements / adjustments — staff view-only

  // ── Reservations (staff = view-only per product decision) ──
  view_reservations: ALL,
  create_reservation: FULL,
  assign_reservation: FULL,
  delete_reservation: FULL,

  // ── Messaging (staff have full access for fast replies) ────
  view_messaging: ALL,
  send_message: ALL,

  // ── Broadcast ──────────────────────────────────────────────
  // Staff are limited to a pre-approved template library; only full-access
  // roles compose free-text broadcasts. (No broadcast feature is built yet —
  // "Broadcast" is currently just a shortcut to Messaging. These keys are the
  // contract for when that feature lands.)
  broadcast_template: ALL,
  broadcast_freeform: FULL,

  // ── Team management (staff = no access) ────────────────────
  manage_staff: FULL,

  // ── Activity log (owner/admin only — not exposed to staff) ──
  view_logs: FULL,

  // ── Areas the user did not re-scope: existing behavior kept ─
  view_analytics: FULL,
  export_analytics: [OWNER],
  manage_devices: [OWNER],
  view_customers: ALL,
  edit_customer: ALL,
  delete_customer: FULL,
  manage_settings: [OWNER],
  seed_demo_data: [OWNER],
};

const normalizeRole = (role) => (typeof role === 'string' ? role.trim().toLowerCase() : '');

/**
 * Check if a user role has permission for a given action.
 * @param {string} userRole - The current user's role, any casing ('Owner', 'staff', …)
 * @param {string} action   - An action key from the PERMISSIONS map
 * @returns {boolean}
 */
export const can = (userRole, action) => {
  const allowed = PERMISSIONS[action];
  if (!allowed) {
    // Unknown action key: deny and warn — this is a programming error, not a
    // permission the user lacks.
    if (import.meta.env.DEV) console.warn(`[permissions] Unknown action: "${action}"`);
    return false;
  }
  return allowed.includes(normalizeRole(userRole));
};

export default PERMISSIONS;
