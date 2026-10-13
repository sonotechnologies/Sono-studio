import 'server-only';
import { after } from 'next/server';
import type { ProviderClient } from '@/ai/types';
import type { Repo } from '@/lib/data/repo';
import { recorded } from './record';
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
function defer(task: () => Promise<void>): void {
  try {
    after(task);
  } catch {
    void task();
  }
}

/** The providers as given, recording each request when Sono AI is on. Never throws. */
export async function withRecording(providers: ProviderClient[], repo: Repo, projectId: string | null): Promise<ProviderClient[]> {
  if (!sonoAiEnabled() || !providers.length) return providers;
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
