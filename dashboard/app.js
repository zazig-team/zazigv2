// Config injected by build step (build.js will replace these placeholders)
const SUPABASE_URL = window.__SUPABASE_URL__ || '';
const SUPABASE_ANON_KEY = window.__SUPABASE_ANON_KEY__ || '';

const { createClient } = supabase; // from CDN global
export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export async function sendMagicLink(email) {
  return sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin }
  });
}

export async function getSession() {
  const { data } = await sb.auth.getSession();
  return data.session;
}

export async function signOut() {
  await sb.auth.signOut();
  window.location.href = '/auth.html';
}

// Auth guard — call on protected pages
export async function requireAuth() {
  const session = await getSession();
  if (!session) { window.location.href = '/auth.html'; }
  return session;
}

// Listen for auth state changes (used on auth.html callback)
export function onAuthChange(callback) {
  sb.auth.onAuthStateChange(callback);
}
