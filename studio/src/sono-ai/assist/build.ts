import { z } from 'zod';
import { runJson, type RouterHooks } from '@/ai/router';
import type { ProviderClient } from '@/ai/types';
import { BUSINESS_KINDS, PAGE_KEYS, briefSchema, type Brief, type PageKey } from '@/generate/brief';
import { PRESETS } from '@/lib/presets';
import { PRESET_IDS, type PresetId } from '@/lib/types';

/*
 * Stage 4: Sono AI starts site builds through the studio's own pipeline. From
 * a request like "build a pitch site for Mama's Kitchen, a restaurant in
 * Lekki", it reads a brief. Nothing is created until you press "Plan it": that
 * makes an ordinary project and generation job, and the studio's own plan
 * review waits for your approval before anything is built. No pitch is ever
 * sent by Sono AI.
 */

export interface BuildBrief {
  businessName: string;
  businessType: string;
  pages: PageKey[];
  /** Everything the request said about the business: services, prices, hours, story. */
  facts: string;
  client: { ownerName: string; whatsapp: string; instagram: string; address: string };
}

export interface BuildRequest {
  id: string;
  request: string;
  channel: 'studio' | 'telegram';
  brief: BuildBrief;
  status: 'requested' | 'started' | 'discarded';
  projectId: string | null;
  jobId: string | null;
  createdAt: string;
  startedAt: string | null;
}

/** "Build a pitch site for…", "make a website for…", "can you create a site for…" */
export function buildAsk(message: string): boolean {
  return /^\s*(?:please\s+|hey\s+)?(?:(?:can|could|would) you\s+)?(?:build|make|create|generate|set up|start|design|do)\b[^?]{0,80}\b(?:site|website|pitch|landing page)\b/i.test(message.trim());
}

const pageKey = z.enum(PAGE_KEYS);
const extractSchema = z.object({
  businessName: z.string().max(80),
  businessType: z.string().max(60),
  pages: z.array(z.string()).max(9),
  facts: z.string().max(4000),
  client: z.object({ ownerName: z.string().max(80), whatsapp: z.string().max(32), instagram: z.string().max(60), address: z.string().max(160) }).partial(),
});

export interface ExtractDeps {
  providers: ProviderClient[];
  hooks: RouterHooks;
}

/** Reads a brief from the request (and the conversation before it). */
export async function extractBuild(request: string, history: { role: 'user' | 'assistant'; text: string }[], deps: ExtractDeps): Promise<BuildBrief | { missing: string }> {
  const kinds = BUSINESS_KINDS.map((k) => `${k.name} (pages: ${k.pages.join(', ')})`).join('; ');
  const r = await runJson(
    deps.providers,
    {
      task: 'assistant',
      system: `You read a web designer's request to build a pitch website for a small business, and fill in the brief for the studio's site generator. Use only what the request and conversation say; never invent names, numbers, prices or addresses (leave a field empty instead).
- businessName: the business's name exactly as given, or "" if none was given.
- businessType: one of ${BUSINESS_KINDS.map((k) => k.name).join(', ')} when it fits, otherwise a short type like "Dental clinic".
- pages: page keys to include, from: ${PAGE_KEYS.join(', ')}. Usual pages per kind: ${kinds}. Follow the request if it names pages.
- facts: everything the request says about the business (what it sells, services, prices, hours, location, story, tone), as plain notes.
- client: the owner's name, WhatsApp number, Instagram handle and address, when given.
Reply as {"businessName": "", "businessType": "", "pages": [], "facts": "", "client": {"ownerName": "", "whatsapp": "", "instagram": "", "address": ""}}.`,
      prompt: `${history.length ? `Conversation so far:\n${history.slice(-6).map((h) => `${h.role === 'user' ? 'Designer' : 'Assistant'}: ${h.text.slice(0, 800)}`).join('\n')}\n\n` : ''}Request: ${request}`,
      temperature: 0.1,
      maxTokens: 900,
      demo: { kind: 'assistant', task: 'build' },
    },
    extractSchema,
    deps.hooks,
  );
  const d = r.data;
  if (!d.businessName.trim()) return { missing: 'What’s the business called? Tell me the name (and anything else you know: what they do, where, their WhatsApp or Instagram) and I’ll prepare the brief.' };
  const kind = BUSINESS_KINDS.find((k) => k.name.toLowerCase() === d.businessType.trim().toLowerCase());
  const pages = [...new Set(d.pages.map((p) => p.toLowerCase().trim()).filter((p): p is PageKey => pageKey.safeParse(p).success))];
  return {
    businessName: d.businessName.trim(),
    businessType: kind?.name ?? (d.businessType.trim() || 'Business'),
    pages: pages.length ? pages : (kind?.pages ?? ['home', 'about', 'contact']),
    facts: d.facts.trim(),
    client: { ownerName: d.client.ownerName?.trim() ?? '', whatsapp: d.client.whatsapp?.trim() ?? '', instagram: d.client.instagram?.trim() ?? '', address: d.client.address?.trim() ?? '' },
  };
}

export interface PastProject {
  businessType: string;
  preset: string;
  status: string;
}

/**
 * The style to start from, from the knowledge bank: the preset your approved
 * or live sites of this kind used most, else the one this kind of business
 * usually suits. A rule naming a preset wins.
 */
export function presetFor(businessType: string, past: PastProject[], rules: string[]): { preset: PresetId; reason: string } {
  const type = businessType.toLowerCase();
  for (const rule of rules) {
    const r = rule.toLowerCase();
    const named = PRESET_IDS.find((id) => r.includes(PRESETS[id].name.toLowerCase()) || r.includes(id));
    if (named && (r.includes(type) || !BUSINESS_KINDS.some((k) => r.includes(k.name.toLowerCase())))) return { preset: named, reason: `your rule: “${rule}”` };
  }
  const won = past.filter((p) => p.businessType.toLowerCase() === type && (p.status === 'client_approved' || p.status === 'live'));
  const counts = new Map<string, number>();
  for (const p of won) if ((PRESET_IDS as readonly string[]).includes(p.preset)) counts.set(p.preset, (counts.get(p.preset) ?? 0) + 1);
  const best = [...counts].sort((a, b) => b[1] - a[1])[0];
  if (best) return { preset: best[0] as PresetId, reason: `${best[1]} of your approved ${businessType.toLowerCase()} site${best[1] === 1 ? '' : 's'} used it` };
  const kind = BUSINESS_KINDS.find((k) => k.name.toLowerCase() === type);
  return { preset: kind?.preset ?? 'warm-table', reason: kind ? `the usual style for a ${type}` : 'a safe default' };
}

/** The wizard's brief, ready for the pipeline. Your rules go into the notes the planner and writer read. */
export function toBrief(b: BuildBrief, preset: PresetId, rules: string[]): Brief {
  const notes = [b.facts, rules.length ? `Studio notes (always follow these):\n${rules.map((r) => `- ${r}`).join('\n')}` : ''].filter(Boolean).join('\n\n');
  return briefSchema.parse({
    businessName: b.businessName.slice(0, 80),
    businessType: b.businessType.slice(0, 60),
    preset,
    pages: b.pages,
    paste: notes.slice(0, 12000),
    client: { ownerName: b.client.ownerName.slice(0, 80), whatsapp: b.client.whatsapp.slice(0, 32), instagram: b.client.instagram.slice(0, 60), address: b.client.address.slice(0, 160) },
    brandColors: [],
    useBrand: false,
  });
}

const TITLES: Record<string, string> = { home: 'Home', shop: 'Shop', book: 'Book', menu: 'Menu', services: 'Services', rooms: 'Rooms', about: 'About', gallery: 'Gallery', contact: 'Contact' };

/** A short description of the brief, for the chat and Telegram. */
export function briefSummary(b: BuildBrief): string {
  const contact = [b.client.ownerName && `owner ${b.client.ownerName}`, b.client.whatsapp && `WhatsApp ${b.client.whatsapp}`, b.client.instagram && `Instagram ${b.client.instagram}`, b.client.address].filter(Boolean);
  return [
    `${b.businessName}, a ${b.businessType.toLowerCase()}. Pages: ${b.pages.map((p) => TITLES[p] ?? p).join(', ')}.`,
    contact.length ? `Client: ${contact.join(', ')}.` : '',
    b.facts ? `Notes: ${b.facts.length > 300 ? `${b.facts.slice(0, 300)}…` : b.facts}` : 'No details yet: the site will use neutral wording you can edit.',
  ]
    .filter(Boolean)
    .join('\n');
}
