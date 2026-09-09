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

export const updateDeviceStatus = async (fingerprint, status) => {
  const { error } = await supabase
    .from('devices')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('fingerprint', fingerprint);
  if (error) throw error;
};

export const deleteDevice = async (fingerprint) => {
  const { error } = await supabase.from('devices').delete().eq('fingerprint', fingerprint);
  if (error) throw error;
};

export const renameDevice = async (fingerprint, name) => {
  const { error } = await supabase
    .from('devices')
    .update({ name, updated_at: new Date().toISOString() })
    .eq('fingerprint', fingerprint);
  if (error) throw error;
};

export const pruneInactiveDevices = async (staleDays = 30) => {
  const cutoff = new Date(Date.now() - staleDays * 24 * 60 * 60 * 1000).toISOString();

  const { error: errRevoked } = await supabase
    .from('devices')
    .delete()
    .eq('status', 'revoked');

  const { error: errStale } = await supabase
    .from('devices')
    .delete()
    .lt('last_seen', cutoff);

  if (errRevoked || errStale) {
    throw errRevoked || errStale;
  }
};

