import { NextResponse } from 'next/server';
import { askAction, recentMessagesAction } from '@/app/(app)/sono-ai/assist-actions';
import { getUser } from '@/lib/auth';
import { sonoAiEnabled } from '@/sono-ai';
import type { Mode } from '@/sono-ai/assist/types';

// An answer can take a while (several AI requests, or a web search).
export const maxDuration = 60;

/*
 * The chat talks to Sono AI through this plain endpoint rather than a server
 * action, so a slow or failed reply only ever affects the message, never the
 * page around it.
 */

export async function POST(req: Request) {
  if (!(await getUser())) return NextResponse.json({ error: 'Your session ended. Sign in again.' }, { status: 401 });
  if (!sonoAiEnabled()) return NextResponse.json({ error: 'Sono AI is off.' }, { status: 404 });
  const body = (await req.json().catch(() => null)) as { text?: unknown; mode?: unknown; projectId?: unknown } | null;
  if (!body || typeof body.text !== 'string') return NextResponse.json({ error: 'Type a message first.' }, { status: 400 });
  const mode = (['auto', 'casual', 'studio', 'search'] as const).find((m) => m === body.mode) as Mode | 'auto' | undefined;
  const projectId = typeof body.projectId === 'string' && /^[0-9a-f-]{36}$/i.test(body.projectId) ? body.projectId : null;
  return NextResponse.json(await askAction(body.text, { mode: mode ?? 'auto', projectId }));
}

/** The latest conversation, to catch up after a reply that didn't arrive. */
export async function GET() {
  if (!(await getUser())) return NextResponse.json({ messages: [] }, { status: 401 });
  return NextResponse.json({ messages: await recentMessagesAction() });
}
