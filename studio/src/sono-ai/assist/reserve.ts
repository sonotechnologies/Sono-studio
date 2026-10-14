import type { ProviderClient } from '@/ai/types';

/*
 * Builds come first. The assistant stops using a provider once 70% of its
 * daily limit is used, leaving the rest for site generation, and it only
 * ever uses the light model.
 */
export const ASSISTANT_SHARE = 0.7;

export interface Usage {
  provider: string;
  dailyLimit: number | null;
  used: number;
}

export function forAssistant(providers: ProviderClient[], usage: Usage[]): ProviderClient[] {
  const by = new Map(usage.map((u) => [u.provider, u]));
  return providers.filter((p) => {
    const u = by.get(p.id);
    return !u?.dailyLimit || u.used < u.dailyLimit * ASSISTANT_SHARE;
  });
}

export const QUOTA_NOTE = 'Every AI provider is busy or saving its remaining quota for site builds. Try again later, or add another provider in Settings → AI providers.';
