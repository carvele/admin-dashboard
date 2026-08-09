import { supabase } from '../lib/supabaseClient';

export const getAnnouncements = async () => {
  const { data, error } = await supabase
    .from('announcements')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching announcements:', error);
    throw error;
  }
  return data;
};

export const createAnnouncement = async (announcement) => {
  const { data, error } = await supabase
    .from('announcements')
    .insert([announcement])
    .select()
    .single();

  if (error) {
    console.error('Error creating announcement:', error);
    throw error;
  }
  return data;
};

export const deleteAnnouncement = async (id) => {
  const { error } = await supabase
    .from('announcements')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting announcement:', error);
    throw error;
  }
  return true;
};
