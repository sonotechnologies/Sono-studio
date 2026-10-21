import 'server-only';

/**
 * Supabase is the real backend. Without its keys the app falls back to a
 * file-backed dev store so the UI can be run locally; that fallback refuses
 * to start in production.
 */
export function supabaseEnv(): { url: string; anonKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Supabase's dashboard now calls this the publishable key; either name works.
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  return url && anonKey ? { url, anonKey } : null;
}

export function isDevStore(): boolean {
  if (supabaseEnv()) return false;
  if (process.env.NODE_ENV === 'production' && process.env.SONO_ALLOW_DEV_STORE !== '1') {
    throw new Error('Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY).');
  }
  // Its default sign-in and encryption key are public: never on a real host, even with the switch on.
  if (process.env.VERCEL && process.env.NODE_ENV === 'production') {
    throw new Error('The dev store can’t run on Vercel. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.');
  }
  return true;
}
