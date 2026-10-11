import { NextResponse } from 'next/server';
import { refreshDeploy, startDeploy } from '@/deploy/run';
import { getRepo, getUser } from '@/lib/auth';

// Exporting, pushing to GitHub and uploading to Vercel can take a while for sites with many photos.
export const maxDuration = 60;

/** Starts a deploy of the current version. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getUser())) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const { id } = await params;
  try {
    const deployment = await startDeploy(await getRepo(), id, new URL(req.url).origin);
    return NextResponse.json({ deployment });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

/** The latest deploy, checking on Vercel while it builds. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getUser())) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const { id } = await params;
  return NextResponse.json({ deployment: await refreshDeploy(await getRepo(), id) });
}
