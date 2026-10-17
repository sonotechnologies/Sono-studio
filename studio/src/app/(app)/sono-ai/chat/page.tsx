import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Page } from '@/components/shell';
import { requireUser } from '@/lib/auth';
import { sonoAiEnabled } from '@/sono-ai';
import { assistStore } from '@/sono-ai/assist/store';
import type { Message, Thread } from '@/sono-ai/assist/types';
import { ChatThreads } from '../chat-threads';
import { SonoAiNav } from '../nav';

// Server actions here call AI providers (and sometimes web search), which can take a while.
export const maxDuration = 60;

export const metadata: Metadata = { title: 'Sono AI' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Your chats with Sono AI: the one in the address (?t=), a new one (?new=1), or the most recent. */
export default async function SonoAiChatPage({ searchParams }: { searchParams: Promise<{ t?: string; new?: string }> }) {
  await requireUser();
  if (!sonoAiEnabled()) notFound();
  const { t, new: fresh } = await searchParams;
  const assist = await assistStore();
  let threads: Thread[] = [];
  let setupNeeded = false;
  try {
    threads = await assist.threads();
  } catch {
    // The chats table comes with migration 0016.
    setupNeeded = true;
  }
  const current = fresh ? null : ((t && UUID.test(t) ? threads.find((x) => x.id === t) : undefined) ?? threads[0] ?? null);
  const messages: Message[] = current ? await assist.messages('studio', 80, current.id) : [];
  return (
    <Page title="Sono AI" width={1100} newSite={false}>
      <SonoAiNav current="/sono-ai/chat" />
      {setupNeeded ? (
        <p className="m-0 rounded-card border border-border bg-surface p-5 text-[14px]">
          Chats need one more database step: run <code className="font-mono text-[13px]">supabase/migrations/0016_sono_ai_chats.sql</code> in Supabase → SQL Editor, then reload this page.
        </p>
      ) : (
        <div className="flex h-[calc(100dvh-230px)] min-h-[420px] flex-col">
          <ChatThreads initialThreads={threads} initialThread={current} initialMessages={messages} />
        </div>
      )}
    </Page>
  );
}
