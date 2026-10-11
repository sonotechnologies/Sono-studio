'use server';

import { revalidatePath } from 'next/cache';
import { pickModels } from '@/ai/models';
import { listModels } from '@/ai/providers';
import { isAiProvider } from '@/ai/service';
import { AI_PROVIDERS, PROVIDER_INFO, ProviderError, STOCK_PROVIDERS, type AiProviderId } from '@/ai/types';
import { getRepo, requireUser } from '@/lib/auth';
import { decryptSecret, encryptSecret, keyHint } from '@/lib/crypto';
import type { KeyProvider } from '@/lib/data/repo';
import { DEPLOY_PROVIDERS } from '@/lib/types';
import { DeployError, githubAccount } from '@/deploy/github';
import { vercelAccount } from '@/deploy/vercel';

const ALL: readonly string[] = [...AI_PROVIDERS, ...STOCK_PROVIDERS, ...DEPLOY_PROVIDERS];

function provider(p: string): KeyProvider {
  if (!ALL.includes(p)) throw new Error('Unknown provider');
  return p as KeyProvider;
}

async function checkStockKey(p: 'unsplash' | 'pexels', key: string): Promise<'ok' | 'rejected' | 'unchecked'> {
  try {
    const res =
      p === 'unsplash'
        ? await fetch('https://api.unsplash.com/photos?per_page=1', { headers: { authorization: `Client-ID ${key}` }, signal: AbortSignal.timeout(10_000) })
        : await fetch('https://api.pexels.com/v1/curated?per_page=1', { headers: { authorization: key }, signal: AbortSignal.timeout(10_000) });
    if (res.status === 401 || res.status === 403) return 'rejected';
    return res.ok ? 'ok' : 'unchecked';
  } catch {
    return 'unchecked';
  }
}

/** Asks GitHub or Vercel who the token belongs to. */
async function checkDeployToken(p: 'github' | 'vercel', token: string): Promise<{ account?: string; rejected?: string }> {
  try {
    return { account: p === 'github' ? await githubAccount(token) : await vercelAccount(token) };
  } catch (err) {
    if (err instanceof DeployError && /rejected|scope|access/i.test(err.message)) return { rejected: err.message.replace(/ Add a new one.*$/, '') };
    return {};
  }
}

export interface SaveKeyResult {
  error?: string;
  warning?: string;
  models?: string[];
}

/** Checks the key with the provider, then stores it encrypted. Only the last four characters are ever shown again. */
export async function saveKeyAction(p: string, rawKey: string): Promise<SaveKeyResult> {
  await requireUser();
  const id = provider(p);
  const key = rawKey.trim();
  if (key.length < 8 || key.length > 500 || /\s/.test(key)) return { error: 'That doesn’t look like an API key. Copy it again without spaces.' };
  let models: string[] | undefined;
  let warning: string | undefined;
  if (isAiProvider(id)) {
    try {
      models = await listModels(id, key);
    } catch (err) {
      if (err instanceof ProviderError && err.kind === 'auth') return { error: `${PROVIDER_INFO[id].name} rejected that key. Check you copied all of it.` };
      warning = 'Saved, but the key couldn’t be checked right now. Generation will tell you if it doesn’t work.';
    }
  } else if (id === 'github' || id === 'vercel') {
    const check = await checkDeployToken(id, key);
    if (check.rejected) return { error: `${check.rejected} Check you copied all of it.` };
    warning = check.account ? `Connected as ${check.account}.` : 'Saved, but the token couldn’t be checked right now. Deploy will tell you if it doesn’t work.';
  } else {
    const check = await checkStockKey(id as 'unsplash' | 'pexels', key);
    if (check === 'rejected') return { error: 'That key was rejected. For Unsplash use the Access Key, not the Secret key.' };
    if (check === 'unchecked') warning = 'Saved, but the key couldn’t be checked right now.';
  }
  const repo = await getRepo();
  const existing = (await repo.listProviderKeys()).find((r) => r.provider === id);
  await repo.upsertProviderKey(id, {
    ciphertext: encryptSecret(key),
    hint: keyHint(key),
    // Choose models from the provider's live list; keep the saved ones if they still exist.
    ...(isAiProvider(id)
      ? { models: models ? pickModels(id, models, existing?.models) : existing?.models ?? { ...PROVIDER_INFO[id].defaults } }
      : {}),
  });
  await repo.setCooldown(id as never, null);
  revalidatePath('/settings');
  return { models, warning };
}

export async function listModelsAction(p: string): Promise<{ models?: string[]; suggested?: { strong: string; light: string }; error?: string }> {
  await requireUser();
  const id = provider(p);
  if (!isAiProvider(id)) return { error: 'Not an AI provider' };
  const row = (await (await getRepo()).listProviderKeys()).find((r) => r.provider === id);
  if (!row) return { error: 'Add a key first' };
  try {
    const models = await listModels(id, decryptSecret(row.ciphertext));
    return { models, suggested: pickModels(id, models) };
  } catch (err) {
    return { error: (err as Error).message.slice(0, 200) };
  }
}

export async function setModelsAction(p: string, models: { strong: string; light: string }): Promise<void> {
  await requireUser();
  const id = provider(p);
  const clean = (m: string) => m.trim().slice(0, 120);
  if (!clean(models.strong) || !clean(models.light)) throw new Error('Choose a model for both tiers');
  await (await getRepo()).upsertProviderKey(id, { models: { strong: clean(models.strong), light: clean(models.light) } });
  revalidatePath('/settings');
}

/** Order of the fallback chain: the first provider is tried first for every task. */
export async function reorderProvidersAction(order: string[]): Promise<void> {
  await requireUser();
  const repo = await getRepo();
  const ids = order.filter((p): p is AiProviderId => isAiProvider(p));
  for (const [i, id] of ids.entries()) await repo.upsertProviderKey(id, { position: i });
  revalidatePath('/settings');
}

export async function setDailyLimitAction(p: string, limit: number | null): Promise<void> {
  await requireUser();
  const value = limit === null || !Number.isFinite(limit) || limit <= 0 ? null : Math.min(1_000_000, Math.round(limit));
  await (await getRepo()).upsertProviderKey(provider(p), { dailyLimit: value });
  revalidatePath('/settings');
}

export async function clearCooldownAction(p: string): Promise<void> {
  await requireUser();
  const id = provider(p);
  if (isAiProvider(id)) await (await getRepo()).setCooldown(id, null);
  revalidatePath('/settings');
}

export async function removeKeyAction(p: string): Promise<void> {
  await requireUser();
  await (await getRepo()).deleteProviderKey(provider(p));
  revalidatePath('/settings');
}
