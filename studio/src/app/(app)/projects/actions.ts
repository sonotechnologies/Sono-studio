'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getRepo, requireUser } from '@/lib/auth';
import { siteConfigSchema } from '@/site/schema';
import { starterConfig } from '@/site/starter';
import {
  clientPatchSchema,
  projectPatchSchema,
  type ClientPatch,
  type ProjectPatch,
} from '@/lib/types';

export async function updateProjectAction(id: string, patch: ProjectPatch): Promise<void> {
  await requireUser();
  await (await getRepo()).updateProject(id, projectPatchSchema.parse(patch));
  revalidatePath('/');
  revalidatePath(`/projects/${id}`);
}

export async function updateClientAction(id: string, patch: ClientPatch): Promise<void> {
  await requireUser();
  await (await getRepo()).updateClient(id, clientPatchSchema.parse(patch));
  revalidatePath('/');
  revalidatePath(`/projects/${id}`);
}

export async function deleteProjectAction(id: string): Promise<void> {
  await requireUser();
  await (await getRepo()).deleteProject(id);
  revalidatePath('/');
}

/** Builds version 1 from the project record so there is a site to preview before the AI pipeline exists. */
export async function createStarterSiteAction(id: string): Promise<void> {
  await requireUser();
  const repo = await getRepo();
  const project = await repo.getProject(id);
  if (!project) throw new Error('Project not found');
  if (!(await repo.getSiteVersion(id))) {
    await repo.saveSiteVersion(id, siteConfigSchema.parse(starterConfig(project)), 'Starter site');
  }
  revalidatePath('/');
  revalidatePath(`/projects/${id}`);
  redirect(`/preview/${id}`);
}

const ORDER_STATUSES = ['pending', 'paid', 'failed', 'fulfilled', 'cancelled'] as const;

/** Marks an order fulfilled (sent or collected) or cancelled, or back to paid. */
export async function setOrderStatusAction(projectId: string, orderId: string, status: string): Promise<void> {
  await requireUser();
  if (!(ORDER_STATUSES as readonly string[]).includes(status)) throw new Error('Unknown status');
  await (await getRepo()).setOrderStatus(projectId, orderId, status as (typeof ORDER_STATUSES)[number]);
  revalidatePath(`/projects/${projectId}`);
}

const BOOKING_STATUSES = ['held', 'confirmed', 'cancelled', 'done', 'no_show'] as const;

/** Marks a booking done, a no-show, or cancelled (cancelling frees its time). */
export async function setBookingStatusAction(projectId: string, bookingId: string, status: string): Promise<void> {
  await requireUser();
  if (!(BOOKING_STATUSES as readonly string[]).includes(status)) throw new Error('Unknown status');
  await (await getRepo()).setBookingStatus(projectId, bookingId, status as (typeof BOOKING_STATUSES)[number]);
  revalidatePath(`/projects/${projectId}`);
}

/** A password that's easy to read out or type: three groups of five letters and digits, no look-alikes. */
function readablePassword(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(15));
  const s = Array.from(bytes, (b) => chars[b % chars.length]).join('');
  return `${s.slice(0, 5)}-${s.slice(5, 10)}-${s.slice(10, 15)}`;
}

/** Creates a client login (or a new password for one) and returns the password, shown once. */
export async function setSiteAdminAction(projectId: string, input: { name: string; email: string }): Promise<{ password?: string; error?: string }> {
  await requireUser();
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'Enter the client’s email address.' };
  const password = readablePassword();
  try {
    await (await getRepo()).setSiteAdmin(projectId, { email, name: input.name.trim().slice(0, 80), password });
  } catch (err) {
    const msg = (err as Error).message;
    if (/email in use/.test(msg)) return { error: 'That email already signs in to another site. Use a different email for this one.' };
    throw err;
  }
  revalidatePath(`/projects/${projectId}`);
  return { password };
}

export async function removeSiteAdminAction(projectId: string, adminId: string): Promise<void> {
  await requireUser();
  await (await getRepo()).removeSiteAdmin(projectId, adminId);
  revalidatePath(`/projects/${projectId}`);
}
