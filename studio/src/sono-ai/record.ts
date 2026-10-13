import { ProviderError, type ChatResult, type ProviderClient } from '@/ai/types';
import { Redactor, type ClientDetails } from './redact';
import type { NewInteraction, SonoAiStore } from './store';

/*
 * The one wrapper around the AI router's providers. Each request goes to the
 * provider exactly as before; a redacted copy of the request and answer is
 * written to the knowledge bank afterwards. If writing fails, the request is
 * unaffected: errors from the bank are swallowed, never thrown.
 */

/** Keeps a single request and answer from filling the database. */
const MAX_TEXT = 60_000;

export interface RecordContext {
  projectId: string | null;
  siteType: string | null;
  client: ClientDetails;
}

export interface Recorder {
  store: SonoAiStore;
  /** Loads what the redactor needs (the project's client details and placeholder map). Called once, lazily. */
  context: () => Promise<RecordContext>;
  /** Runs work after the response (Next's `after`), or right away where that isn't available. */
  defer: (task: () => Promise<void>) => void;
  now?: () => number;
}

const clip = (s: string) => (s.length > MAX_TEXT ? `${s.slice(0, MAX_TEXT)}\n…[cut at ${MAX_TEXT} characters]` : s);

export function recorded(providers: ProviderClient[], rec: Recorder): ProviderClient[] {
  const now = rec.now ?? Date.now;
  let ready: Promise<{ ctx: RecordContext; redactor: Redactor }> | null = null;
  const prepare = () =>
    (ready ??= (async () => {
      const ctx = await rec.context();
      const existing = ctx.projectId ? await rec.store.getRedactions(ctx.projectId) : [];
      return { ctx, redactor: new Redactor(existing, ctx.client) };
    })());

  const write = (row: Omit<NewInteraction, 'projectId' | 'siteType' | 'source' | 'sourceRef' | 'system' | 'request' | 'answer'>, text: { system: string; request: string; answer: string | null }) =>
    rec.defer(async () => {
      try {
        const { ctx, redactor } = await prepare();
        const redacted = { system: clip(redactor.redact(text.system)), request: clip(redactor.redact(text.request)), answer: text.answer === null ? null : clip(redactor.redact(text.answer)) };
        const error = row.error ? redactor.redact(row.error).slice(0, 1000) : null;
        if (ctx.projectId && redactor.added.length) await rec.store.addRedactions(ctx.projectId, redactor.added.splice(0));
        await rec.store.addInteractions([{ ...row, ...redacted, error, projectId: ctx.projectId, siteType: ctx.siteType, source: 'live', sourceRef: null }]);
      } catch (err) {
        console.warn('Sono AI could not record a request:', (err as Error).message);
      }
    });

  return providers.map((client) => ({
    ...client,
    async chat(req, model) {
      const started = now();
      let reply: ChatResult;
      try {
        reply = await client.chat(req, model);
      } catch (err) {
        const kind = err instanceof ProviderError ? err.kind : 'error';
        write(
          { task: req.task, provider: client.id, model, ms: now() - started, inputTokens: null, outputTokens: null, status: kind === 'rate_limit' ? 'limit' : 'error', error: `${kind}: ${(err as Error).message}` },
          { system: req.system, request: req.prompt, answer: null },
        );
        throw err;
      }
      write(
        { task: req.task, provider: client.id, model: reply.model, ms: now() - started, inputTokens: reply.usage?.input ?? null, outputTokens: reply.usage?.output ?? null, status: 'ok', error: null },
        { system: req.system, request: req.prompt, answer: reply.text },
      );
      return reply;
    },
  }));
}
