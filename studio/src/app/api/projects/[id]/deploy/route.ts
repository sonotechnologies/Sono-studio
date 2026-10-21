import { NextResponse } from 'next/server';
import { refreshDeploy, startDeploy, type PaymentKeys } from '@/deploy/run';
import { getRepo, getUser } from '@/lib/auth';
import type { Repo } from '@/lib/data/repo';
import { alertDeployFailed } from '@/sono-ai/alerts';

// Exporting, pushing to GitHub and uploading to Vercel can take a while for sites with many photos.
export const maxDuration = 300;

/** Starts a deploy of the current version. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getUser())) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const { id } = await params;
  try {
    // The client's payment keys, when the shop takes cards: passed on to the hosting, never stored.
    const body = (await req.json().catch(() => null)) as { paymentKeys?: PaymentKeys } | null;
    const repo = await getRepo();
    const deployment = await startDeploy(repo, id, new URL(req.url).origin, { paymentKeys: body?.paymentKeys });
    alertIfFailed(repo, deployment);
    return NextResponse.json({ deployment });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

/** The latest deploy, checking on Vercel while it builds. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getUser())) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const { id } = await params;
  const repo = await getRepo();
  const deployment = await refreshDeploy(repo, id);
  alertIfFailed(repo, deployment);
  return NextResponse.json({ deployment });
}

/** Sono AI: a failed deploy is sent to Telegram once (nothing happens when Sono AI is off). */
function alertIfFailed(repo: Repo, d: { id: string; projectId: string; status: string; error: string | null } | null) {
  if (d?.status === 'error') alertDeployFailed(d, async () => (await repo.getProject(d.projectId))?.name ?? 'a site');
}
