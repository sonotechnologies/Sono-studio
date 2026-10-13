import 'server-only';
import { decryptSecret } from '@/lib/crypto';
import { usageToday, type ProviderKeyRow, type Repo } from '@/lib/data/repo';
import { chain, pexels, unsplash, type StockSearch } from '@/generate/stock';
import { demoAllowed, demoClient } from './demo';
import { pickModels } from './models';
import { listModels, makeClient } from './providers';
import type { RouterHooks } from './router';
import { withRecording } from '@/sono-ai';
import { alertProviderRest } from '@/sono-ai/alerts';
import { AI_PROVIDERS, PROVIDER_INFO, type AiProviderId, type ProviderClient } from './types';

export function isAiProvider(p: string): p is AiProviderId {
  return (AI_PROVIDERS as readonly string[]).includes(p);
}

export type ProviderAvailability = 'ready' | 'cooling' | 'limit';

export function availability(row: ProviderKeyRow, now = new Date()): ProviderAvailability {
  if (row.cooldownUntil && new Date(row.cooldownUntil) > now) return 'cooling';
  if (row.dailyLimit && usageToday(row, now) >= row.dailyLimit) return 'limit';
  return 'ready';
}

/**
 * The providers to try, in the order set in Settings. Without any AI key the
 * demo provider stands in during development so the flow can be tried; in
 * production generation asks for a key instead.
 */
export async function loadProviders(repo: Repo, opts: { projectId?: string } = {}): Promise<ProviderClient[]> {
  return withRecording(await chooseProviders(repo), repo, opts.projectId ?? null);
}

async function chooseProviders(repo: Repo): Promise<ProviderClient[]> {
  const rows = (await repo.listProviderKeys()).filter((r) => isAiProvider(r.provider));
  const clients = rows
    .filter((r) => availability(r) === 'ready')
    .map((r) => {
      const id = r.provider as AiProviderId;
      const d = PROVIDER_INFO[id].defaults;
      return makeClient(id, decryptSecret(r.ciphertext), { strong: r.models.strong || d.strong, light: r.models.light || d.light });
    });
  if (!rows.length && demoAllowed()) return [demoClient()];
  return clients;
}

export function routerHooks(repo: Repo): RouterHooks {
  return {
    onRequest: (p) => (p === 'demo' ? undefined : repo.recordUsage(p).catch(() => {})),
    onCooldown: (p, until) =>
      p === 'demo' ? undefined : repo.setCooldown(p, until.toISOString()).then(() => alertProviderRest(repo, p, until), () => {}),
  };
}

export async function loadStock(repo: Repo): Promise<StockSearch | null> {
  const rows = await repo.listProviderKeys();
  const sources = rows.flatMap((r) =>
    r.provider === 'unsplash' ? [unsplash(decryptSecret(r.ciphertext))] : r.provider === 'pexels' ? [pexels(decryptSecret(r.ciphertext))] : [],
  );
  return sources.length ? chain(sources) : null;
}

/** Model names a failed run reported as retired or unavailable, e.g. "gemini-2.5-flash". */
export function retiredModels(error: string): string[] {
  const names = new Set<string>();
  for (const m of error.matchAll(/\(([\w.:/-]+)\) refused the request: [\w ]+: model not found/g)) names.add(m[1]);
  for (const m of error.matchAll(/models\/([\w.-]+) is no longer available/g)) names.add(m[1]);
  return [...names];
}

/**
 * Re-picks models for every AI provider from its live list, leaving out the
 * retired names (a provider can still list a model it refuses to new users).
 * Returns true if anything changed.
 */
export async function healModels(repo: Repo, retired: string[]): Promise<boolean> {
  let changed = false;
  for (const row of (await repo.listProviderKeys()).filter((r) => isAiProvider(r.provider))) {
    const id = row.provider as AiProviderId;
    try {
      const available = (await listModels(id, decryptSecret(row.ciphertext))).filter((m) => !retired.includes(m));
      const keep = { strong: retired.includes(row.models.strong ?? '') ? undefined : row.models.strong, light: retired.includes(row.models.light ?? '') ? undefined : row.models.light };
      const next = pickModels(id, available, keep);
      if (next.strong !== row.models.strong || next.light !== row.models.light) {
        await repo.upsertProviderKey(id, { models: next });
        changed = true;
      }
    } catch {
      // Leave this provider as it is; the error already shown explains it.
    }
  }
  return changed;
}
