import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Page } from '@/components/shell';
import { requireUser } from '@/lib/auth';
import { sonoAiEnabled } from '@/sono-ai';
import { assistStore } from '@/sono-ai/assist/store';
import { SonoAiNav } from '../nav';
import { SonoAiChat } from '../sono-ai-chat';

// Server actions here call AI providers (and sometimes web search), which can take a while.
export const maxDuration = 60;

export const metadata: Metadata = { title: 'Sono AI' };

export default async function SonoAiChatPage() {
  await requireUser();
  if (!sonoAiEnabled()) notFound();
  const messages = await (await assistStore()).messages('studio', 60);
  return (
    <Page title="Sono AI" width={900} newSite={false}>
      <SonoAiNav current="/sono-ai/chat" />
      <div className="flex h-[calc(100dvh-230px)] min-h-[420px] flex-col">
        <SonoAiChat initial={messages} />
      </div>
    </Page>
  );
}
