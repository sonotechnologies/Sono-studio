import { z } from 'zod';
import { runJson, type RouterHooks } from '@/ai/router';
import type { ProviderClient } from '@/ai/types';
import type { Embedder } from '../knowledge';
import { Redactor, type Redaction } from '../redact';
import type { ChunkHit } from '../store';
import { factsText, scorecardText, type Snapshot } from './context';
import { briefAgain, buildAsk, buildFollowUp } from './build';
import { STUDIO_GUIDE } from './guide';
import { draftAsk, pickMode, ruleIn, type DraftAsk } from './modes';
import type { Mode, ScoreRow, Source } from './types';
import { WebSearchError, type WebSearch } from './web';

/*
 * Sono AI's answers. Each message is answered one of three ways: everyday
 * conversation, a question about your work (studio facts, scorecards and the
 * knowledge search index, with links to what it used), or the live web.
 * Rules you state and drafts you ask for are recognised without a request.
 *
 * Client details never leave the studio: the question, history and context
 * are redacted before the request and the placeholders are put back in the
 * reply. Requests use the light model on the assistant's share of quota.
 */

export interface AssistDeps {
  studioUrl: string;
  /** Providers for assistant requests, already leaving builds their share of quota. */
  providers: ProviderClient[];
  hooks: RouterHooks;
  snapshot(): Promise<Snapshot>;
  rules(): Promise<string[]>;
  history(): Promise<{ role: 'user' | 'assistant'; text: string }[]>;
  scorecards(): Promise<ScoreRow[]>;
  /** Embeds a question for knowledge search; null without a Gemini key. */
  embedQuery: Embedder | null;
  match(embedding: number[], count: number, projectId: string | null): Promise<ChunkHit[]>;
  /** A project's own placeholder map: index chunks are redacted per project. */
  redactions(projectId: string): Promise<Redaction[]>;
  /** Live web answers; null without a Gemini key. */
  web: WebSearch | null;
  /** Records a web search request in the bank (the router records the rest). */
  logWeb?(row: { request: string; answer: string | null; model: string; ms: number; status: 'ok' | 'error' | 'limit'; error: string | null; inputTokens: number | null; outputTokens: number | null }): void;
}

export interface AnswerOptions {
  mode?: Mode | 'auto';
  /** The project you're looking at (the workspace tab), if any. */
  projectId?: string | null;
}

export type Answer =
  | { kind: 'reply'; mode: Mode; reply: string; sources: Source[] }
  | { kind: 'rule'; rule: string; reply: string }
  | { kind: 'draft'; ask: DraftAsk }
  | { kind: 'build' };

/** Keeps the knowledge chunks that are actually about the question. */
const RELEVANT = 0.5;
const HISTORY = 8;

const replySchema = z.object({ reply: z.string().min(1).max(4000), sources: z.array(z.number().int()).max(12).optional() });
/** Everyday chat may hand a question over to web search when it needs current facts. */
const casualSchema = z.object({ reply: z.string().max(4000).optional(), search: z.boolean().optional() }).refine((v) => v.search || !!v.reply?.trim(), 'Give a reply, or {"search": true}');

export function redactorFor(s: Snapshot): Redactor {
  const r = new Redactor();
  for (const p of s.projects) r.add({ ...p.client, businessName: p.name });
  return r;
}

const voiceRules = (rules: string[]) => (rules.length ? `\n\nThe owner's rules, which always apply:\n${rules.map((r) => `- ${r}`).join('\n')}` : '');

const BASE = `You are Sono AI, the assistant of a one-person web studio (Sono Studio) that builds websites for small businesses and pitches them to the owners. You talk with the studio owner. Be warm, brief and plain-spoken; no jargon. Client names appear as placeholders like "Client A" or "Person 1": use them exactly as written. Reply with a single JSON object.

What you can and can't do (be exact about this; never claim more or less):
- You CAN start a new pitch site. The owner asks in a message like "Build a site for Crumbs, a bakery in Yaba"; you read the details, and they open it in the studio to plan it and approve the plan before anything is built. You never build or publish a site by yourself in the background.
- You CAN answer questions about the studio's projects and pitches, look things up on the web, draft follow-ups, quotes and handover checklists for the owner to approve, and remember rules they give you.
- You CAN'T change an existing site (that's done in its workspace, or for a copied site in "Edit the copy", where there is an Ask AI tab), deploy sites, or message clients.
- Never say you're doing something, have done it, or will do it later ("I'll get it up right now"): you can only reply. If the owner seems to want a new site and hasn't given the business's name and kind, ask for them, and tell them they can say "Build a site for <name>, a <kind of business> in <area>".`;

export async function answer(message: string, deps: AssistDeps, opts: AnswerOptions = {}): Promise<Answer> {
  const rule = ruleIn(message);
  if (rule) return { kind: 'rule', rule, reply: `I’ll remember this: “${rule}”. Save it to your rulebook?` };
  const ask = draftAsk(message);
  if (ask) return { kind: 'draft', ask };
  if (buildAsk(message)) return { kind: 'build' };

  const [snapshot, rules, history] = await Promise.all([deps.snapshot(), deps.rules(), deps.history()]);
  // "Yes, go ahead" after a brief: it's filed already and waits for Plan it.
  if (briefAgain(message, history))
    return {
      kind: 'reply',
      mode: 'casual',
      reply: 'It’s ready: tap “Plan it” on the brief above (or find it under Sono AI → Builds). The studio plans the pages and you approve the plan before anything is built.',
      sources: [{ label: 'Builds', href: `${deps.studioUrl}/sono-ai/builds` }],
    };
  // "I meant the website", "yes, build it": the request was made earlier in other words.
  if (buildFollowUp(message, history)) return { kind: 'build' };
  const redactor = redactorFor(snapshot);
  const mode = opts.mode && opts.mode !== 'auto' ? opts.mode : pickMode(message, snapshot.projects.map((p) => p.name));
  const past = history
    .slice(-HISTORY)
    .map((h) => `${h.role === 'user' ? 'Owner' : 'Sono AI'}: ${redactor.redact(h.text).slice(0, 1200)}`)
    .join('\n');
  const question = redactor.redact(message);

  const webAnswer = async (): Promise<Answer> => {
    const mode = 'search' as const;
    if (!deps.web) return { kind: 'reply', mode, reply: 'Web search needs a Gemini key. Add one in Settings → AI providers and ask again.', sources: [] };
    const started = Date.now();
    try {
      const r = await deps.web(
        `${past ? `Conversation so far:\n${past}\n\n` : ''}Question: ${question}`,
        `You answer the owner of a small web studio with current information from the web. Short follow-ups ("check", "it does", "what about season 2?") refer to the conversation so far: work out the actual question from it, search for that, and correct any earlier wrong answer plainly. Be brief and concrete; give numbers and dates where they matter. Client names appear as placeholders: keep them as written.${voiceRules(rules.map((x) => redactor.redact(x)))}`,
      );
      deps.logWeb?.({ request: question, answer: r.text, model: r.model, ms: Date.now() - started, status: 'ok', error: null, inputTokens: r.inputTokens, outputTokens: r.outputTokens });
      return { kind: 'reply', mode, reply: redactor.restore(r.text), sources: r.sources };
    } catch (err) {
      const limit = err instanceof WebSearchError && err.limit;
      deps.logWeb?.({ request: question, answer: null, model: '', ms: Date.now() - started, status: limit ? 'limit' : 'error', error: (err as Error).message, inputTokens: null, outputTokens: null });
      return { kind: 'reply', mode, reply: (err as Error).message, sources: [] };
    }
  };

  if (mode === 'search') return webAnswer();

  if (mode === 'casual') {
    const r = await runJson(
      deps.providers,
      {
        task: 'assistant',
        system: `${BASE} This is everyday conversation: answer like a helpful friend. Don't bring up the studio unless asked.
If an honest answer depends on current or recent facts you may not know (releases, episodes and seasons, news, prices, schedules, results, anything that changes), or the owner asks you to check or look something up, don't guess: reply {"search": true} and the question goes to a live web search instead. Never say you'll look something up or do something later; you can't.${voiceRules(rules.map((x) => redactor.redact(x)))}

Reply as {"reply": "..."} or {"search": true}.`,
        prompt: `${past ? `${past}\n` : ''}Owner: ${question}`,
        temperature: 0.7,
        maxTokens: 1200,
        demo: { kind: 'assistant', task: 'answer' },
      },
      casualSchema,
      deps.hooks,
    );
    if (r.data.search || !r.data.reply) return webAnswer();
    return { kind: 'reply', mode, reply: redactor.restore(r.data.reply), sources: [] };
  }

  // A question about your work: numbered context, cited back as links.
  const named = snapshot.projects.find((p) => message.toLowerCase().includes(p.name.toLowerCase()));
  const focus = named?.id ?? opts.projectId ?? null;
  const [scores, hits] = await Promise.all([
    deps.scorecards(),
    deps.embedQuery
      ? deps
          .embedQuery([question])
          .then(([v]) => (v ? deps.match(v, 6, focus) : []))
          .catch(() => [] as ChunkHit[])
      : Promise.resolve([] as ChunkHit[]),
  ]);
  const relevant = hits.filter((h) => h.similarity >= RELEVANT);
  // Chunks use each project's own placeholders ("Client A" is a different business in each);
  // put the real names back, then redact again with this conversation's placeholders.
  const maps = new Map<string, Redactor>();
  for (const id of new Set(relevant.flatMap((h) => (h.projectId ? [h.projectId] : []))))
    maps.set(id, new Redactor(await deps.redactions(id).catch(() => []), { businessName: snapshot.projects.find((p) => p.id === id)?.name }));
  const chunkText = (h: ChunkHit) => redactor.redact(h.projectId && maps.has(h.projectId) ? maps.get(h.projectId)!.restore(h.content) : h.content);
  const name = new Map(snapshot.projects.map((p) => [p.id, p.name]));
  const SOURCE_NAME: Record<string, string> = { project: 'project summary', client_notes: 'client notes', outcomes: 'pitch outcomes' };
  const context: { text: string; source: Source }[] = [
    { text: redactor.redact(factsText(snapshot)), source: { label: 'Studio data', href: `${deps.studioUrl}/` } },
    { text: scorecardText(scores), source: { label: 'Model scorecards', href: `${deps.studioUrl}/sono-ai/scorecards` } },
    ...relevant.map((h) => ({
      text: chunkText(h),
      source: {
        label: `${(h.projectId && name.get(h.projectId)) || 'Studio'} · ${SOURCE_NAME[h.source] ?? h.source}`,
        href: h.projectId ? `${deps.studioUrl}/projects/${h.projectId}` : `${deps.studioUrl}/`,
      },
    })),
    // Last, so the numbers of the records above stay the same.
    { text: STUDIO_GUIDE, source: { label: 'How the studio works', href: `${deps.studioUrl}/` } },
  ];
  const looking = opts.projectId && name.get(opts.projectId) ? `\nThe owner is looking at ${redactor.redact(name.get(opts.projectId)!)} right now.` : '';
  const r = await runJson(
    deps.providers,
    {
      task: 'assistant',
      system: `${BASE} Answer questions about the studio's work, and how to use the studio, using only the numbered context below; it comes from the studio's records and its guide. Do the arithmetic carefully. If the context doesn't hold the answer, say plainly that the knowledge bank has nothing on that yet, instead of guessing. Never invent clients, numbers or events.${voiceRules(rules.map((x) => redactor.redact(x)))}

Context:
${context.map((c, i) => `[${i + 1}] ${c.text}`).join('\n\n')}

Reply as {"reply": "...", "sources": [numbers of the context items you used]}.`,
      prompt: `${past ? `${past}\n` : ''}Owner: ${question}${looking}`,
      temperature: 0.3,
      maxTokens: 1200,
      demo: { kind: 'assistant', task: 'answer' },
    },
    replySchema,
    deps.hooks,
  );
  const used = [...new Set(r.data.sources ?? [])].filter((n) => n >= 1 && n <= context.length).map((n) => context[n - 1].source);
  return { kind: 'reply', mode, reply: redactor.restore(r.data.reply), sources: used };
}
