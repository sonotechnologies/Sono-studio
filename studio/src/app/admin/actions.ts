'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { clearAdminToken, requireAdmin, setAdminToken, adminToken } from '@/lib/admin';
import { getRepo } from '@/lib/auth';
import type { BookingStatus, OrderStatus } from '@/lib/data/repo';
import { siteConfigSchema, type SiteConfig } from '@/site/schema';
import { adminChangeProblem } from '@/workspace/admin-guard';

/** Sign-in attempts per address in the last minute (per server instance). */
const attempts = new Map<string, number[]>();
function allowSignIn(ip: string): boolean {
  const now = Date.now();
  const recent = (attempts.get(ip) ?? []).filter((t) => now - t < 60_000);
  if (attempts.size > 5000) attempts.clear();
  attempts.set(ip, [...recent, now]);
  return recent.length < 8;
}

export async function adminSignInAction(_prev: string | null, form: FormData): Promise<string | null> {
  const email = String(form.get('email') ?? '').trim();
  const password = String(form.get('password') ?? '');
  if (!email || !password) return 'Enter your email and password.';
  // A few tries a minute from one address, so nobody can lock a client out or keep the database hashing passwords.
  if (!allowSignIn((await headers()).get('x-forwarded-for')?.split(',')[0].trim() || 'unknown')) return 'Too many tries from here. Wait a minute, then try again.';
  const token = await (await getRepo()).adminSignIn(email, password);
  if (token === 'locked') return 'Too many wrong passwords. Wait 15 minutes, then try again.';
  if (!token) return 'That email and password don’t match. Check them, or ask your web designer to reset your password.';
  await setAdminToken(token);
  redirect('/admin');
}

export async function adminSignOutAction() {
  const token = await adminToken();
  if (token) await (await getRepo()).adminSignOut(token).catch(() => {});
  await clearAdminToken();
  redirect('/admin/login');
}

/** Saves the client's edits and publishes them, if they only touch what a client may change. */
export async function adminSaveAction(baseVersion: number, config: SiteConfig, summary: string): Promise<{ version?: number; error?: string }> {
  const { token, me } = await requireAdmin();
  const parsed = siteConfigSchema.safeParse(config);
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    return { error: `Not saved: ${i?.message ?? 'something isn’t valid'} (${i?.path.join(' › ')})` };
  }
  const current = siteConfigSchema.safeParse(me.config);
  if (!current.success) return { error: 'This site can’t be edited here right now. Ask your web designer.' };
  if (me.version !== baseVersion) return { error: 'The site was changed since you opened it. Reload the page to get the latest version, then make your change again.' };
  const problem = adminChangeProblem(current.data, parsed.data);
  if (problem) return { error: `Changes to ${problem} are made by your web designer.` };
  try {
    const version = await (await getRepo()).adminSave(token, baseVersion, parsed.data, summary.slice(0, 300) || 'Edited by the client');
    return { version };
  } catch (err) {
    if (/changed meanwhile/.test((err as Error).message)) return { error: 'The site was changed since you opened it. Reload the page, then make your change again.' };
    throw err;
  }
}

export async function adminSetOrderStatusAction(orderId: string, status: OrderStatus): Promise<boolean> {
  const { token } = await requireAdmin();
  return (await getRepo()).adminSetOrderStatus(token, orderId, status);
}

export async function adminSetBookingStatusAction(bookingId: string, status: BookingStatus): Promise<boolean> {
  const { token } = await requireAdmin();
  return (await getRepo()).adminSetBookingStatus(token, bookingId, status);
}
