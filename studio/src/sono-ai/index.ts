import 'server-only';
import { after } from 'next/server';
import type { ProviderClient } from '@/ai/types';
import type { Repo } from '@/lib/data/repo';
import { recorded } from './record';
import { decryptSecret } from '@/lib/crypto';
import { buildIndex, geminiEmbedder, type IndexResult } from './knowledge';
import { settingsStore } from './notify-store';
import { getStore } from './store';

/*
 * Sono AI: an experimental assistant beside the studio. Stage 1 records every
 * AI request and answer (redacted) in its own tables. It is off unless
 * SONO_AI_ENABLED is set; off, the studio works exactly as it did before.
 */

export function sonoAiEnabled(): boolean {
  return /^(1|true|on|yes)$/i.test(process.env.SONO_AI_ENABLED ?? '');
}

/** Runs work after the response is sent; outside a request (tests, scripts) it just runs. */
export function defer(task: () => Promise<void>): void {
  try {
    after(task);
  } catch {
    void task();
  }
}

/** The providers as given, recording each request when Sono AI is on. Never throws. */
export async function withRecording(providers: ProviderClient[], repo: Repo, projectId: string | null): Promise<ProviderClient[]> {
  if (!sonoAiEnabled() || !providers.length) return providers;
  indexSoon(repo);
  try {
    const store = await getStore();
    return recorded(providers, {
      store,
      defer,
      context: async () => {
        const project = projectId ? await repo.getProject(projectId) : null;
        return {
          projectId: project?.id ?? null,
          siteType: project?.siteType ?? null,
          client: project
            ? { businessName: project.name, ownerName: project.client.ownerName, whatsapp: project.client.whatsapp, instagram: project.client.instagram, address: project.client.address }
            : {},
        };
      },
    });
  } catch {
    return providers;
  }
}

/** How often the index catches up while you work. */
const INDEX_EVERY_MS = 10 * 60_000;

/** Rebuilds the knowledge search index now (signed in). */
export async function rebuildIndex(repo: Repo): Promise<IndexResult> {
  const gemini = (await repo.listProviderKeys()).find((k) => k.provider === 'gemini');
  const result = await buildIndex(repo, await getStore(), gemini ? geminiEmbedder(decryptSecret(gemini.ciphertext)) : null);
  await (await settingsStore()).update({ lastIndexedAt: new Date().toISOString() });
  return result;
}

/**
 * Catches the index up in the background, at most every ten minutes, after a
 * signed-in request. It reads studio data only and runs after the response,
 * so it never slows the studio.
 */
export function indexSoon(repo: Repo): void {
  if (!sonoAiEnabled()) return;
  defer(async () => {
    try {
      const settings = await settingsStore();
      const last = (await settings.get()).lastIndexedAt;
      if (last && Date.now() - new Date(last).getTime() < INDEX_EVERY_MS) return;
      await settings.update({ lastIndexedAt: new Date().toISOString() });
      await rebuildIndex(repo);
    } catch (err) {
      console.warn('Sono AI: index not updated:', (err as Error).message);
    }
  });
}
