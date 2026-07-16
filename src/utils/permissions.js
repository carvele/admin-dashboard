/**
 * Centralized permission matrix for the JezSy Collection Admin.
 *
 * Roles: Owner, Admin, Sales Staff
 * UI restriction + this map = consistent enforcement.
 */

const PERMISSIONS = {
  manage_staff: ['Owner'],
  archive_catalog: ['Owner', 'Admin'],
  create_catalog: ['Owner', 'Admin'],
  edit_catalog: ['Owner', 'Admin'],
  assign_reservation: ['Owner', 'Admin', 'Sales Staff'],
  create_reservation: ['Owner', 'Admin', 'Sales Staff'],
  delete_reservation: ['Owner', 'Admin'],
  view_analytics: ['Owner', 'Admin'],
  export_analytics: ['Owner'],
  manage_devices: ['Owner'],
  delete_customer: ['Owner', 'Admin'],
  edit_customer: ['Owner', 'Admin', 'Sales Staff'],
  manage_settings: ['Owner'],
  seed_demo_data: ['Owner'],
};

/**
 * Check if a user role has permission for a given action.
 * @param {string} userRole - The role of the current user (e.g. 'Owner', 'Admin', 'Sales Staff')
 * @param {string} action   - The action key from the PERMISSIONS map
 * @returns {boolean}
 */
export const can = (userRole, action) => {
  return PERMISSIONS[action]?.includes(userRole) ?? false;
};

export default PERMISSIONS;
