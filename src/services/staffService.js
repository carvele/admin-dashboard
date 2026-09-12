/**
 * staffService.js  (Supabase)
 * All profile reads/writes and HR status management.
 *
 * Staff     = public.profiles rows with role IN ('staff','owner').
 * History   = public.staff_status_history (write via RPC only).
 * Device management lives in deviceService.js (backed by the
 * register_device/admin_manage_device RPCs) -- this file used to have its
 * own parallel, unused implementation that wrote directly to public.devices
 * and had drifted from the real (RPC-based) path.
 */

import { supabase } from '../lib/supabaseClient';
import {
  subscribeToCollection,
  logAction,
  toCamel,
} from '../lib/supabaseService';

// ── Staff ───────────────────────────────────────────────────

/** Subscribe to all non-customer profiles (staff / admin / owner) in real-time.
 *  Passes includeDeleted=true so the archived-staff tab also receives deleted rows. */
export const subscribeToStaff = (callback) => {
  return subscribeToCollection('profiles', (rows) => {
    callback(rows.filter((r) => r.role !== 'customer'));
  }, {}, true); // includeDeleted = true
};

/** One-time fetch of all staff profiles. */
export const getStaffMembers = async (limit = 101) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .neq('role', 'customer')
    .eq('deleted', false)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []).map((r) => ({ ...toCamel(r), docId: r.id }));
};

/** Lookup a staff profile by email. Returns null if not found. */
export const getStaffByEmail = async (email) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('email', email)
    .neq('role', 'customer')
    .eq('deleted', false)
    .maybeSingle();
  if (error) throw error;
  return data ? { ...toCamel(data), docId: data.id } : null;
};

/** Fetch a single staff profile by ID (full row). */
export const getStaffProfile = async (id) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', id)
    .eq('deleted', false)
    .maybeSingle();
  if (error) throw error;
  return data ? toCamel(data) : null;
};

/**
 * Update Section 1 personal-info fields on a profile.
 * Safe columns only — triggers block privileged column writes.
 */
export const updateStaffProfile = async (id, profileData) => {
  const allowedFields = [
    'first_name', 'last_name', 'phone', 'gender',
    'date_of_birth', 'address_line', 'city', 'province',
    'zip_code', 'barangay',
  ];
  const payload = Object.fromEntries(
    Object.entries(profileData).filter(([k]) => allowedFields.includes(k)),
  );
  payload.updated_at = new Date().toISOString();

  const { error } = await supabase
    .from('profiles')
    .update(payload)
    .eq('id', id);
  if (error) throw error;
};

/**
 * Sends a password reset email to the specified staff member.
 */
export const sendPasswordResetEmail = async (email) => {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/login`,
  });
  if (error) throw error;
};

/**
 * Update employment_status and/or is_blocked for a staff member.
 * Calls the SECURITY DEFINER RPC — this is the ONLY safe write path.
 * @param {string} targetId  - UUID of the staff member to update
 * @param {string|null} newEmploymentStatus - 'active'|'on_leave'|'resigned'|'terminated'|null
 * @param {boolean} newIsBlocked
 * @param {string} note - Mandatory change note stored in history
 */
export const updateStaffStatus = async (targetId, newEmploymentStatus, newIsBlocked, note) => {
  const { error } = await supabase.rpc('update_staff_status', {
    target_staff_id: targetId,
    new_employment_status: newEmploymentStatus,
    new_is_blocked: newIsBlocked,
    change_note: note,
  });
  if (error) throw error;
};

/**
 * Fetch the full status history timeline for a staff member.
 * Joins changed_by profile to get the actor's name.
 */
export const getStaffStatusHistory = async (staffId) => {
  const { data, error } = await supabase
    .from('staff_status_history')
    .select(`
      id, change_type, previous_value, new_value,
      note, effective_date, created_at,
      changed_by,
      changer:profiles!staff_status_history_changed_by_fkey(
        first_name, last_name, email
      )
    `)
    .eq('staff_id', staffId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
};

// ── Audit log ───────────────────────────────────────────────

/** Re-export the shared logAction from supabaseService for convenient import. */
export { logAction };
