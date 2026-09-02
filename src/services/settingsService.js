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
  const { error } = await supabase.from("store_hours").upsert(payload);
  if (error) throw error;
};

export const insertStoreClosure = async (payload) => {
  const { data, error } = await supabase.from("store_closures").insert(payload);
  if (error) throw error;
  return data;
};

export const deleteStoreClosure = async (id) => {
  const { error } = await supabase.from("store_closures").delete().eq("id", id);
  if (error) throw error;
};

export const upsertSettings = async (payload) => {
  const { error } = await supabase.from("settings").upsert(payload);
  if (error) throw error;
};
