import 'server-only';
import { createHash, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { isDevStore } from './env';
import { createSupabaseServerClient } from './supabase/server';
import { devRepo } from './data/dev-repo';
import { supabaseRepo } from './data/supabase-repo';
import type { Repo } from './data/repo';

export const DEV_SESSION_COOKIE = 'sono_dev_session';

function devCredentials() {
  return {
    email: process.env.SONO_DEV_EMAIL || 'dev@sono.studio',
    password: process.env.SONO_DEV_PASSWORD || 'studio',
  };
}

function devToken(): string {
  const { email, password } = devCredentials();
  return createHash('sha256').update(`sono-dev:${email}:${password}`).digest('hex');
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export interface SessionUser {
  email: string;
}

/**
 * The signed-in user, checked once per request: the layout, the page and its
 * actions share the answer instead of each asking Supabase again.
 */
export const getUser = cache(async (): Promise<SessionUser | null> => {
  // Read cookies first: it marks the route as dynamic, so nothing signed-in is prerendered at build time.
  const store = await cookies();
  if (isDevStore()) {
    const token = store.get(DEV_SESSION_COOKIE)?.value;
    return token && safeEqual(token, devToken()) ? { email: devCredentials().email } : null;
  }
  const db = await createSupabaseServerClient();
  // Verifies the session's signature locally (with Supabase's cached public keys) instead of a round trip
  // to the Auth server; projects still on the older shared secret fall back to asking the server.
  const { data } = await db.auth.getClaims();
  return data?.claims ? { email: (data.claims.email as string | undefined) ?? '' } : null;
});

/** Use at the top of every signed-in page and action. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getUser();
  if (!user) redirect('/login');
  return user;
}

/** The data store, one per request (its reads of saved keys are shared within the request). */
export const getRepo = cache(async (): Promise<Repo> => {
  if (isDevStore()) return devRepo;
  return supabaseRepo(await createSupabaseServerClient());
});

/** Returns an error message, or null on success. */
export async function signIn(email: string, password: string): Promise<string | null> {
  if (isDevStore()) {
    const creds = devCredentials();
    if (email.trim().toLowerCase() !== creds.email.toLowerCase() || password !== creds.password) {
      return 'That email and password don’t match.';
    }
    (await cookies()).set(DEV_SESSION_COOKIE, devToken(), {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
    return null;
  }
  const db = await createSupabaseServerClient();
  const { error } = await db.auth.signInWithPassword({ email: email.trim(), password });
  return error ? 'That email and password don’t match.' : null;
}

export async function signOut(): Promise<void> {
  if (isDevStore()) {
    (await cookies()).delete(DEV_SESSION_COOKIE);
    return;
  }
  const db = await createSupabaseServerClient();
  await db.auth.signOut();
}
