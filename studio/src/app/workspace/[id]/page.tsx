import type { Metadata } from 'next';
import { cache } from 'react';
import { notFound, redirect } from 'next/navigation';
import { loadStock } from '@/ai/service';
import { ToastProvider } from '@/components/ui';
import { getRepo, requireUser } from '@/lib/auth';
import { pitchUrl } from '@/lib/format';
import { siteConfigSchema } from '@/site/schema';
import { aiMode } from '../../new/ai-mode';
import { sonoAiEnabled } from '@/sono-ai';
import { assistStore } from '@/sono-ai/assist/store';
import { Workspace } from '../workspace';

// Server actions here call AI providers (and sometimes web search), which can take a while.
export const maxDuration = 60;

type Props = { params: Promise<{ id: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Shared by the title and the page, so the project is read once. */
const loadProject = cache(async (id: string) => (UUID.test(id) ? (await getRepo()).getProject(id) : null));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const project = await loadProject(id);
  return { title: project ? `${project.name} · Workspace` : 'Workspace' };
}

export default async function WorkspacePage({ params }: Props) {
  await requireUser();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const repo = await getRepo();
  const [project, version] = await Promise.all([loadProject(id), repo.getSiteVersion(id)]);
  if (!project) notFound();
  if (!version) redirect(`/projects/${id}`);
  const parsed = siteConfigSchema.safeParse(version.config);
  if (!parsed.success) redirect(`/preview/${id}`);

  const [assets, messages, mode, stock, keys, latest, styles] = await Promise.all([
    repo.listAssets(id),
    repo.listChatMessages(id),
    aiMode(repo),
    loadStock(repo),
    repo.listProviderKeys(),
    repo.getLatestDeployment(id),
    repo.listStyles(),
  ]);
  // The Sono AI tab carries on your most recent chat.
  const sonoAi = sonoAiEnabled()
    ? await (async () => {
        const assist = await assistStore();
        const thread = (await assist.threads().catch(() => []))[0] ?? null;
        return { threadId: thread?.id ?? null, messages: thread ? await assist.messages('studio', 40, thread.id).catch(() => []) : [] };
      })()
    : null;

  return (
    <ToastProvider>
      <Workspace
        project={project}
        initialConfig={parsed.data}
        initialVersion={version.version}
        initialAssets={assets}
        initialMessages={messages}
        aiMode={mode}
        stockSearch={!!stock?.searchMany}
        pitchLink={pitchUrl(project.pitchSlug)}
        styles={styles}
        deploy={{ hasVercel: keys.some((k) => k.provider === 'vercel'), hasGithub: keys.some((k) => k.provider === 'github'), latest }}
        testKeys={{ paystack: keys.some((k) => k.provider === 'paystack'), stripe: keys.some((k) => k.provider === 'stripe') }}
        sonoAi={sonoAi}
      />
    </ToastProvider>
  );
}
