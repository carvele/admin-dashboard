import { createClient } from '@supabase/supabase-js';

// Safe environment variable lookup for Vite + Jest
const getEnv = (key) => {
  try {
    // eval/Function hides import.meta from Jest's static AST parser
    const meta = new Function('return import.meta')();
    if (meta && meta.env && meta.env[key]) {
      return meta.env[key];
    }
  } catch {
    // fallback for environments without import.meta
  }
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    return process.env[key];
  }
  return '';
};

// Fallback values so dev/test server never crashes with 'supabaseUrl is required'
const supabaseUrl = getEnv('VITE_SUPABASE_URL') || 'https://wufcmtndotfvxvvxkamv.supabase.co';
const supabaseAnonKey = getEnv('VITE_SUPABASE_ANON_KEY') || 'sb_publishable_Rp3GlfKEaGdFiRF7m5wOKg_gWB7qjYe';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export default supabase;
