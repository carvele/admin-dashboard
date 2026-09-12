import { supabase } from '../lib/supabaseClient';

export const getDevicesSnapshot = async (limit = 201) => {
  const { data, error } = await supabase
    .from('devices')
    .select('id, user_id, fingerprint, name, status, staff_email, staff_name, user_agent, last_seen, failed_attempts, lockout_until, updated_at')
    .order('last_seen', { ascending: false, nullsFirst: false })
    .order('fingerprint', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data ?? [];
};

export const subscribeToDevices = (callback) => {
  const channel = supabase
    .channel('admin-device-management')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'devices' }, callback)
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
};

// All mutations go through admin_manage_device/admin_prune_devices --
// SECURITY DEFINER RPCs with their own ownership check and audit-log entry.
// Direct table writes can't work anyway (the `authenticated` role has no
// UPDATE/DELETE grant on `devices`), and previously failed silently: a
// Postgrest UPDATE/DELETE that RLS filters to zero rows returns success
// with no error, so the old code showed "Device approved" even when
// nothing changed.
//
// admin_manage_device now takes (_user_id, _fingerprint, _action, _value):
// `devices` is keyed by (user_id, fingerprint), not fingerprint alone, so
// every call below needs the full device row, not just its fingerprint.
export const approveDevice = async (device) => {
  const { error } = await supabase.rpc('admin_manage_device', {
    _user_id: device.user_id,
    _fingerprint: device.fingerprint,
    _action: 'approve',
  });
  if (error) throw error;
};

export const revokeDevice = async (device) => {
  const { error } = await supabase.rpc('admin_manage_device', {
    _user_id: device.user_id,
    _fingerprint: device.fingerprint,
    _action: 'revoke',
  });
  if (error) throw error;
};

export const updateDeviceStatus = async (device, status) => {
  const { error } = await supabase.rpc('admin_manage_device', {
    _user_id: device.user_id,
    _fingerprint: device.fingerprint,
    _action: status === 'approved' ? 'approve' : 'revoke',
  });
  if (error) throw error;
};

export const deleteDevice = async (device) => {
  const { error } = await supabase.rpc('admin_manage_device', {
    _user_id: device.user_id,
    _fingerprint: device.fingerprint,
    _action: 'delete',
  });
  if (error) throw error;
};

export const renameDevice = async (device, name) => {
  const { error } = await supabase.rpc('admin_manage_device', {
    _user_id: device.user_id,
    _fingerprint: device.fingerprint,
    _action: 'rename',
    _value: name,
  });
  if (error) throw error;
};

export const pruneDevices = async (cutoff) => {
  const cutoffStr = typeof cutoff === 'string' ? cutoff : cutoff.toISOString();
  const { data, error } = await supabase.rpc('admin_prune_devices', {
    _cutoff: cutoffStr,
  });
  if (error) throw error;
  return data;
};

export const pruneInactiveDevices = async (staleDays = 30) => {
  const cutoff = new Date(Date.now() - staleDays * 24 * 60 * 60 * 1000).toISOString();
  return pruneDevices(cutoff);
};
