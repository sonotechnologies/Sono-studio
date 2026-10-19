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

/** Said when no provider can answer: none set up yet, or all keeping their quota for builds. */
export const QUOTA_NOTE = 'No AI provider can answer right now. If you haven’t added one yet, add a free Gemini key in Settings → AI providers. If you have, they’re saving their remaining quota for site builds: try again later, or add another provider.';
