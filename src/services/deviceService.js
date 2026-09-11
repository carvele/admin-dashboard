import { supabase } from '../lib/supabaseClient';

export const getDevicesSnapshot = async (limit = 201) => {
  const { data, error } = await supabase
    .from('devices')
    .select('fingerprint, name, status, staff_email, staff_name, user_agent, last_seen, failed_attempts, lockout_until, updated_at')
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

export const approveDevice = async (fingerprint) => {
  const { error } = await supabase.rpc('admin_manage_device', {
    _action: 'approve',
    _fingerprint: fingerprint,
  });
  if (error) throw error;
};

export const revokeDevice = async (fingerprint) => {
  const { error } = await supabase.rpc('admin_manage_device', {
    _action: 'revoke',
    _fingerprint: fingerprint,
  });
  if (error) throw error;
};

export const updateDeviceStatus = async (fingerprint, status) => {
  const action = (status || '').toLowerCase().trim();
  const _action = action === 'approved' ? 'approve' : action === 'revoked' ? 'revoke' : action;
  if (_action !== 'approve' && _action !== 'revoke') {
    throw new Error(`Unsupported device status transition: ${status}`);
  }
  const { error } = await supabase.rpc('admin_manage_device', {
    _action,
    _fingerprint: fingerprint,
  });
  if (error) throw error;
};

export const deleteDevice = async (fingerprint) => {
  const { error } = await supabase.rpc('admin_manage_device', {
    _action: 'delete',
    _fingerprint: fingerprint,
  });
  if (error) throw error;
};

export const renameDevice = async (fingerprint, name) => {
  const { error } = await supabase.rpc('admin_manage_device', {
    _action: 'rename',
    _fingerprint: fingerprint,
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

