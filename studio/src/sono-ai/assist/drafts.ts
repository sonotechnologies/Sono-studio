import { z } from 'zod';
import { runJson, type RouterHooks } from '@/ai/router';
import type { ProviderClient } from '@/ai/types';
import { handoverChecklist } from '@/export/checklist';
import type { SiteConfig } from '@/site/schema';
import { needsFollowUp, type Snapshot, type SnapshotProject } from './context';
import { redactorFor } from './engine';
import type { Draft, NewDraft } from './types';

/*
 * Drafts for you to approve, edit or skip: follow-up messages for pitches that
 * need one (in your voice, from the drafts you approved after editing),
 * quotes (from the site's modules and your past quotes) and handover
 * checklists. Nothing is ever sent: approving opens WhatsApp or Instagram
 * with the text filled in, and you press send.
 */

export interface DraftDeps {
  providers: ProviderClient[];
  hooks: RouterHooks;
  snapshot: Snapshot;
  rules: string[];
  /** Approved drafts you edited, newest first: how you write. */
  voice: string[];
  pitchUrl(slug: string): string;
}

const DAY = 86_400_000;
const MAX_FOLLOW_UPS = 5;
const PITCH_LINK = '[PITCH LINK]';
const days = (from: string, to: string) => Math.max(0, Math.floor((new Date(to).getTime() - new Date(from).getTime()) / DAY));
const digits = (s: string) => s.replace(/\D/g, '');

/** Where an approved message goes: WhatsApp if the client has a number, else Instagram. */
export function recipientOf(p: SnapshotProject): Pick<NewDraft, 'channel' | 'recipient'> {
  if (p.client.whatsapp && digits(p.client.whatsapp).length >= 7) return { channel: 'whatsapp', recipient: p.client.whatsapp };
  const ig = p.client.instagram?.replace(/^@/, '').trim();
  if (ig) return { channel: 'instagram', recipient: `@${ig}` };
  return { channel: null, recipient: '' };
}

/**
 * Where Approve takes you. WhatsApp opens with the message filled in;
 * Instagram can't take a message, so the studio copies it first.
 */
export function approveHref(d: Pick<Draft, 'channel' | 'recipient' | 'body' | 'finalBody'>): string | null {
  const text = d.finalBody ?? d.body;
  if (d.channel === 'whatsapp') return `https://wa.me/${digits(d.recipient)}?text=${encodeURIComponent(text)}`;
  if (d.channel === 'instagram') return `https://ig.me/m/${d.recipient.replace(/^@/, '')}`;
  return null;
}

const rulesText = (rules: string[], redact: (s: string) => string) => (rules.length ? `\nThe owner's rules, which always apply:\n${rules.map((r) => `- ${redact(r)}`).join('\n')}` : '');

/** Follow-up messages for pitches that need one and don't have a draft waiting. */
export async function followUpDrafts(deps: DraftDeps, existing: Draft[]): Promise<NewDraft[]> {
  const waiting = new Set(existing.filter((d) => d.kind === 'follow_up' && d.status === 'pending').map((d) => d.projectId));
  const due = deps.snapshot.projects.filter((p) => needsFollowUp(p, deps.snapshot) && !waiting.has(p.id)).slice(0, MAX_FOLLOW_UPS);
  const redactor = redactorFor(deps.snapshot);
  const r = (s: string) => redactor.redact(s);
  const voice = deps.voice.slice(0, 5).map((v) => r(v));
  const out: NewDraft[] = [];
  for (const p of due) {
    const now = deps.snapshot.now;
    const sent = p.pitchSentAt ? days(p.pitchSentAt, now) : null;
    const why = `Pitch sent ${sent === null ? '' : `${sent} day${sent === 1 ? '' : 's'} ago`}${p.lastOpenedAt ? `, last opened ${days(p.lastOpenedAt, now)} days ago` : ', not opened yet'}, no reply.`.replace('sent ,', 'sent,');
    const to = recipientOf(p);
    const res = await runJson(
      deps.providers,
      {
        task: 'assistant',
        system: `You write short follow-up messages from a web designer to a small-business owner they made a free website for (a "pitch"). Friendly, human and brief: 2 to 4 sentences, under 450 characters. One clear, low-pressure next step. Include the token ${PITCH_LINK} exactly once where the link should go. No invented facts, prices or promises. Write for ${to.channel === 'instagram' ? 'an Instagram DM' : 'WhatsApp'}. Names appear as placeholders: keep them as written.${
          voice.length ? `\n\nWrite the way the designer writes. Their recent messages:\n${voice.map((v) => `---\n${v}`).join('\n')}\n---` : ''
        }${rulesText(deps.rules, r)}\n\nReply as {"message": "..."}.`,
        prompt: r(
          `Business: ${p.name}, a ${p.businessType || 'business'}${p.client.ownerName ? `, owner ${p.client.ownerName}` : ''}. Site: ${p.siteType}. ${why}${p.client.notes ? ` Notes: ${p.client.notes.slice(0, 400)}` : ''}`,
        ),
        temperature: 0.8,
        maxTokens: 400,
        demo: { kind: 'assistant', task: 'follow_up' },
      },
      z.object({ message: z.string().min(10).max(1200) }),
      deps.hooks,
    );
    const link = p.pitchSlug ? deps.pitchUrl(p.pitchSlug) : '';
    let body = redactor.restore(res.data.message).trim();
    body = body.includes(PITCH_LINK) ? body.replace(PITCH_LINK, link).replaceAll(PITCH_LINK, '') : link ? `${body}\n${link}` : body;
    out.push({ projectId: p.id, kind: 'follow_up', ...to, title: `Follow up with ${p.name}`, why, body: body.replace(/\s+\n/g, '\n').trim() });
  }
  return out;
}

/** What the site includes, in plain words, for pricing. */
export function modulesOf(config: SiteConfig): string[] {
  const custom = config.pages.flatMap((p) => p.sections).filter((s) => s.type === 'custom').length;
  return [
    `${config.pages.length} page${config.pages.length === 1 ? '' : 's'}: ${config.pages.map((p) => p.title).join(', ')}`,
    config.store ? `Online shop with ${config.store.products.length} products${config.store.payments?.paystack || config.store.payments?.stripe ? ' and card payments' : ''}` : '',
    config.bookings ? `Online bookings for ${config.bookings.services.length} services${config.bookings.depositPercent ? ` with a ${config.bookings.depositPercent}% deposit` : ''}` : '',
    custom ? `${custom} custom section${custom === 1 ? '' : 's'}` : '',
  ].filter(Boolean);
}

const money = (n: number, currency: string) => {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);
  } catch {
    return `${currency} ${n.toLocaleString('en')}`;
  }
};

/** A draft quote: price and scope from the site's modules and your past approved quotes. */
export async function quoteDraft(deps: DraftDeps, project: SnapshotProject, config: SiteConfig | null, pastQuotes: string[]): Promise<NewDraft> {
  const redactor = redactorFor(deps.snapshot);
  const r = (s: string) => redactor.redact(s);
  const modules = config ? modulesOf(config) : ['Site not built yet'];
  const res = await runJson(
    deps.providers,
    {
      task: 'assistant',
      system: `You draft website quotes for a one-person web studio. Base the price on the site's scope and on the studio's past quotes (stay consistent with them). If there are no past quotes, give a sensible small-business price and keep it modest. List the scope in 3 to 6 short lines. Write a short friendly message (2 to 3 sentences) to the business owner introducing the quote. No invented features. Names appear as placeholders: keep them as written.${
        pastQuotes.length ? `\n\nPast approved quotes:\n${pastQuotes.slice(0, 5).map((q) => `---\n${r(q)}`).join('\n')}\n---` : ''
      }${rulesText(deps.rules, r)}\n\nReply as {"price": number, "currency": "ISO code like NGN or USD", "scope": ["..."], "message": "..."}.`,
      prompt: r(`Business: ${project.name}, a ${project.businessType || 'business'}. Site type: ${project.siteType}. Includes:\n${modules.map((m) => `- ${m}`).join('\n')}`),
      temperature: 0.4,
      maxTokens: 700,
      demo: { kind: 'assistant', task: 'quote' },
    },
    z.object({ price: z.number().positive(), currency: z.string().regex(/^[A-Za-z]{3}$/), scope: z.array(z.string().min(2).max(200)).min(1).max(8), message: z.string().min(10).max(800) }),
    deps.hooks,
  );
  const q = res.data;
  const body = `${redactor.restore(q.message).trim()}\n\nWhat’s included:\n${q.scope.map((s) => `• ${redactor.restore(s)}`).join('\n')}\n\nPrice: ${money(q.price, q.currency.toUpperCase())}`;
  return { projectId: project.id, kind: 'quote', ...recipientOf(project), title: `Quote for ${project.name}`, why: `Based on: ${modules.join('; ')}.`, body };
}

/** What a site needs before it goes live: keys, accounts and steps. Worked out from the site, no AI. */
export function checklistDraft(project: SnapshotProject, config: SiteConfig): NewDraft {
  const items = handoverChecklist(config).filter((i) => !i.done);
  const accounts = [
    'A Vercel account for hosting (yours or the client’s), and the domain they want, with access to its DNS settings',
    config.store?.payments?.paystack ? 'The client’s Paystack live secret key (added at deploy, never stored)' : '',
    config.store?.payments?.stripe ? 'The client’s Stripe live secret key (added at deploy, never stored)' : '',
    config.bookings?.payments?.paystack || config.bookings?.payments?.stripe ? 'The payment key for booking deposits' : '',
    'A login for the client’s admin panel, so they can change words, photos and prices themselves',
  ].filter(Boolean);
  const body = [
    `Before ${project.name} goes live:`,
    ...items.map((i) => `☐ ${i.title}: ${i.detail}`),
    '',
    'Keys and accounts:',
    ...accounts.map((a) => `☐ ${a}`),
  ].join('\n');
  return { projectId: project.id, kind: 'checklist', channel: null, recipient: '', title: `Handover checklist for ${project.name}`, why: `${items.length} item${items.length === 1 ? '' : 's'} still open on the site.`, body };
}
