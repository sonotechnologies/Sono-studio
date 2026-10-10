import 'server-only';

/**
 * Supabase is the real backend. Without its keys the app falls back to a
 * file-backed dev store so the UI can be run locally; that fallback refuses
 * to start in production.
 */
export function supabaseEnv(): { url: string; anonKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && anonKey ? { url, anonKey } : null;
}

export function isDevStore(): boolean {
  if (supabaseEnv()) return false;
  if (process.env.NODE_ENV === 'production' && process.env.SONO_ALLOW_DEV_STORE !== '1') {
    throw new Error('Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.');
  }
  return true;
}
