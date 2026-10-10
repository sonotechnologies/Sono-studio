import { PROVIDER_INFO, type AiProviderId, type Tier } from './types';

/*
 * Providers retire model names regularly, so model choice is made from the
 * provider's live list instead of trusting names written into the code.
 */

const SKIP = /(image|tts|audio|live|embed|vision|aqa|learnlm|gemma|guard|whisper|computer-use|robotics|thinking-exp)/i;

function version(name: string): number {
  const m = /(\d+(?:\.\d+)?)/.exec(name);
  return m ? parseFloat(m[1]) : 0;
}

/** Newest first; stable releases before previews and experiments. */
function rank(a: string, b: string): number {
  const unstable = (n: string) => (/(exp|preview)/i.test(n) ? 1 : 0);
  return unstable(a) - unstable(b) || version(b) - version(a) || a.length - b.length;
}

export function pickModels(
  id: AiProviderId,
  available: string[],
  current: Partial<Record<Tier, string>> = {},
): Record<Tier, string> {
  const list = available.filter((m) => !SKIP.test(m));
  const has = (m?: string) => !!m && available.includes(m);
  const defaults = PROVIDER_INFO[id].defaults;
  let strong: string | undefined;
  let light: string | undefined;

  if (id === 'gemini') {
    const flash = list.filter((m) => /^gemini-[\d.]+-flash(?!-lite)/.test(m)).sort(rank);
    const lite = list.filter((m) => /^gemini-[\d.]+-flash-lite/.test(m)).sort(rank);
    const pro = list.filter((m) => /^gemini-[\d.]+-pro/.test(m)).sort(rank);
    // Free-tier Pro quotas are tiny, so Flash plans and Flash-Lite writes.
    strong = flash[0] ?? pro[0];
    light = lite[0] ?? flash[0];
  } else if (id === 'groq') {
    const big = list.filter((m) => /(70b|versatile|120b|maverick|scout)/i.test(m)).sort(rank);
    const small = list.filter((m) => /(instant|8b|20b)/i.test(m)).sort(rank);
    strong = big[0];
    light = small[0] ?? big[0];
  } else {
    const free = list.filter((m) => m.endsWith(':free'));
    const big = free.filter((m) => /(70b|72b|120b|235b|405b|large)/i.test(m)).sort(rank);
    strong = big[0] ?? free[0];
    light = strong;
  }

  return {
    strong: has(current.strong) ? current.strong! : strong ?? (has(defaults.strong) ? defaults.strong : list[0] ?? defaults.strong),
    light: has(current.light) ? current.light! : light ?? strong ?? (has(defaults.light) ? defaults.light : list[0] ?? defaults.light),
  };
}
