import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getRepo } from './auth';
import type { AdminView } from './data/repo';

/*
 * Client admin sessions: a random token in an http-only cookie. Only its hash
 * is stored, and every admin action checks it in the database.
 */

export const ADMIN_COOKIE = 'sono_admin';

export async function adminToken(): Promise<string | null> {
  const t = (await cookies()).get(ADMIN_COOKIE)?.value ?? '';
  return /^[a-f0-9]{64}$/.test(t) ? t : null;
}

export async function setAdminToken(token: string) {
  (await cookies()).set(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 86_400,
  });
}

export async function clearAdminToken() {
  (await cookies()).delete(ADMIN_COOKIE);
}

/** The signed-in client and their site, or off to the sign-in page. */
export async function requireAdmin(): Promise<{ token: string; me: AdminView }> {
  const token = await adminToken();
  const me = token ? await (await getRepo()).adminMe(token) : null;
  if (!token || !me) redirect('/admin/login');
  return { token, me };
}
