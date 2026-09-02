import { supabase } from "../lib/supabaseClient";

export const updateDeviceStatus = async (fingerprint, status) => {
  const { error } = await supabase.from("devices").update({ status, updated_at: new Date().toISOString() }).eq("fingerprint", fingerprint);
  if (error) throw error;
};

export const deleteDevice = async (fingerprint) => {
  const { error } = await supabase.from("devices").delete().eq("fingerprint", fingerprint);
  if (error) throw error;
};
