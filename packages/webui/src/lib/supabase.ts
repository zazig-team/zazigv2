import { DEFAULT_SUPABASE_ANON_KEY, DEFAULT_SUPABASE_URL } from "@zazigv2/shared";
import { createClient } from "@supabase/supabase-js";

export const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ?? DEFAULT_SUPABASE_URL;

export const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ?? DEFAULT_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    detectSessionInUrl: true,
    persistSession: true,
  },
});
