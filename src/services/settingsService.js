import { supabase } from "../lib/supabaseClient";

export const fetchSettings = async () => {
  const { data, error } = await supabase.from("settings").select("key, value");
  if (error) throw error;
  return data;
};

export const fetchStoreHours = async () => {
  const { data, error } = await supabase.from("store_hours").select("*").order("day_of_week", { ascending: true });
  if (error) throw error;
  return data;
};

export const fetchStoreClosures = async () => {
  const { data, error } = await supabase.from("store_closures").select("*").order("closure_date", { ascending: true });
  if (error) throw error;
  return data;
};

export const upsertStoreHour = async (payload) => {
  const row = {
    day_of_week: payload.day_of_week,
    open_time: payload.open_time || "09:00:00",
    close_time: payload.close_time || "18:00:00",
    is_closed: Boolean(payload.is_closed),
    slot_capacity: payload.slot_capacity || 3,
  };
  const { error } = await supabase
    .from("store_hours")
    .upsert(row, { onConflict: "day_of_week" });
  if (error) throw error;
};

export const insertStoreClosure = async (payload) => {
  const { data, error } = await supabase
    .from("store_closures")
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const deleteStoreClosure = async (id) => {
  const { error } = await supabase.from("store_closures").delete().eq("id", id);
  if (error) throw error;
};

export const upsertSettings = async (payload) => {
  const { error } = await supabase
    .from("settings")
    .upsert(payload, { onConflict: "key" });
  if (error) throw error;
};

export const requestPasswordReset = async (email, redirectTo) => {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo,
  });
  if (error) throw error;
};
