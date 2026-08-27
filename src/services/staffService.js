/**
 * staffService.js  (Supabase)
 * All profile reads/writes, device management, and HR status management.
 *
 * Staff     = public.profiles rows with role IN ('staff','owner').
 * History   = public.staff_status_history (write via RPC only).
 * Devices   = public.devices.  Logs = public.logs.
 */

import { supabase } from '../lib/supabaseClient';
import {
  subscribeToCollection,
  subscribeToDocument,
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
export const getStaffMembers = async () => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .neq('role', 'customer')
    .eq('deleted', false);
  if (error) throw error;
  return data.map((r) => ({ ...toCamel(r), docId: r.id }));
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

// ── Device management ───────────────────────────────────────

/** Subscribe to all devices in real-time. */
export const subscribeToDevices = (callback) => {
  return subscribeToCollection('devices', (rows) => {
    // Convert fingerprint PK → docId for UI compatibility
    callback(rows.map((r) => ({ ...r, docId: r.fingerprint ?? r.id, id: r.fingerprint ?? r.id })));
  });
};

/**
 * Subscribe to a single device row by its fingerprint.
 * Uses Supabase Realtime filter on the PK column.
 */
export const subscribeToDeviceStatus = (fingerprint, callback) => {
  return subscribeToDocument('devices', 'fingerprint', fingerprint, (row) => {
    if (row) callback({ ...row, docId: fingerprint, id: fingerprint });
    else callback(null);
  });
};

/** Register or update a device fingerprint. */
export const registerDevice = async (fingerprint, userAgent, staffEmail = '', staffName = '') => {
  const now = new Date().toISOString();
  const { data: existing } = await supabase
    .from('devices')
    .select('fingerprint, login_history')
    .eq('fingerprint', fingerprint)
    .maybeSingle();

  if (!existing) {
    await supabase.from('devices').insert({
      fingerprint,
      status: 'pending',
      user_agent: userAgent,
      last_seen: now,
      name: userAgent ? userAgent.substring(0, 50) : 'Unknown Device',
      staff_email: staffEmail,
      staff_name: staffName,
      failed_attempts: 0,
      lockout_until: null,
      login_history: [{ email: staffEmail, time: now }],
    });
  } else {
    const history = Array.isArray(existing.login_history) ? existing.login_history : [];
    await supabase.from('devices').update({
      last_seen: now,
      updated_at: now,
      ...(staffEmail && {
        staff_email: staffEmail,
        staff_name: staffName,
        login_history: [...history, { email: staffEmail, time: now }].slice(-20),
      }),
    }).eq('fingerprint', fingerprint);
  }
};

/** Approve or revoke a device by its fingerprint. */
export const updateDeviceStatus = async (fingerprint, status) => {
  const { error } = await supabase
    .from('devices')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('fingerprint', fingerprint);
  if (error) throw error;
};

/** Update failed-attempt / lockout counters on a device. */
export const updateDeviceSecurity = async (fingerprint, attempts, lockoutTime) => {
  const { error } = await supabase.from('devices').update({
    failed_attempts: attempts,
    lockout_until: lockoutTime,
    updated_at: new Date().toISOString(),
  }).eq('fingerprint', fingerprint);
  if (error) throw error;
};

// ── Audit log ───────────────────────────────────────────────

/** Re-export the shared logAction from supabaseService for convenient import. */
export { logAction };
