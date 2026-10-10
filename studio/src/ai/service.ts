import 'server-only';
import { decryptSecret } from '@/lib/crypto';
import { usageToday, type ProviderKeyRow, type Repo } from '@/lib/data/repo';
import { chain, pexels, unsplash, type StockSearch } from '@/generate/stock';
import { demoAllowed, demoClient } from './demo';
import { makeClient } from './providers';
import type { RouterHooks } from './router';
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
export async function loadProviders(repo: Repo): Promise<ProviderClient[]> {
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
    onCooldown: (p, until) => (p === 'demo' ? undefined : repo.setCooldown(p, until.toISOString()).catch(() => {})),
  };
}

export async function loadStock(repo: Repo): Promise<StockSearch | null> {
  const rows = await repo.listProviderKeys();
  const sources = rows.flatMap((r) =>
    r.provider === 'unsplash' ? [unsplash(decryptSecret(r.ciphertext))] : r.provider === 'pexels' ? [pexels(decryptSecret(r.ciphertext))] : [],
  );
  return sources.length ? chain(sources) : null;
}
