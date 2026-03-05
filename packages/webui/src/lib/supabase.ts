import { DEFAULT_SUPABASE_ANON_KEY, DEFAULT_SUPABASE_URL } from "@zazigv2/shared";
import { createClient } from "@supabase/supabase-js";

const envSupabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const envSupabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const isBrowser = typeof window !== "undefined";
const hostname = isBrowser ? window.location.hostname : "";
const isLocalHost =
  hostname === "localhost" ||
  hostname === "127.0.0.1" ||
  hostname === "::1";

// Prevent staging/prod deployments from silently falling back to production
// defaults when environment variables are missing.
if (isBrowser && !isLocalHost && (!envSupabaseUrl || !envSupabaseAnonKey)) {
  throw new Error(
    "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY for non-localhost build."
  );
}

export const supabaseUrl =
  envSupabaseUrl ?? DEFAULT_SUPABASE_URL;

export const supabaseAnonKey =
  envSupabaseAnonKey ?? DEFAULT_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    detectSessionInUrl: true,
    persistSession: true,
  },
});
