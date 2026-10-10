import type { z } from 'zod';
import { ProviderError, TASK_TIER, type ChatRequest, type ProviderClient, type ProviderId } from './types';

/** Pulls a JSON value out of a model reply, tolerating code fences and chatter around it. */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {}
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  if (fenced) {
    try {
      return JSON.parse(fenced[1]);
    } catch {}
  }
  const start = trimmed.search(/[[{]/);
  const end = Math.max(trimmed.lastIndexOf('}'), trimmed.lastIndexOf(']'));
  if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
  throw new Error('No JSON found in the reply');
}

function describeIssues(err: z.ZodError): string {
  return err.issues
    .slice(0, 12)
    .map((i) => `- ${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('\n');
}

export interface Attempt {
  provider: ProviderId;
  model: string;
  outcome: 'ok' | 'invalid' | 'rate_limit' | 'auth' | 'bad_request' | 'server' | 'network';
  detail?: string;
}

export interface RouterHooks {
  /** Called once per request sent, for the daily usage meter. */
  onRequest?(provider: ProviderId): void | Promise<void>;
  /** A provider hit its limit or is failing; skip it until `until`. */
  onCooldown?(provider: ProviderId, until: Date): void | Promise<void>;
  now?(): number;
}

const OUTCOME_TEXT: Record<Attempt['outcome'], string> = {
  ok: 'answered',
  invalid: 'replied in the wrong format',
  rate_limit: 'hit its rate limit (it rests for a minute, or until its daily quota resets)',
  auth: 'rejected the key (check it in Settings → AI providers)',
  bad_request: 'refused the request',
  server: 'had a server error',
  network: 'could not be reached',
};

/** One line per provider, saying what went wrong in plain words. */
export function describeAttempts(attempts: Attempt[]): string {
  const last = new Map<string, Attempt>();
  for (const a of attempts) last.set(a.provider, a);
  return [...last.values()]
    .map((a) => {
      const name = a.provider === 'gemini' ? 'Gemini' : a.provider === 'groq' ? 'Groq' : a.provider === 'openrouter' ? 'OpenRouter' : a.provider;
      const detail = a.outcome === 'bad_request' && a.detail ? `: ${a.detail.replace(/^\w+ \d+: /, '').slice(0, 220)}` : a.outcome === 'invalid' && a.detail ? ` (${a.detail.split('\n')[0].slice(0, 160)})` : '';
      return `${name} (${a.model}) ${OUTCOME_TEXT[a.outcome]}${detail}`;
    })
    .join('. ');
}

export class AllProvidersFailed extends Error {
  constructor(readonly attempts: Attempt[]) {
    super(
      attempts.length
        ? `Every AI provider failed. ${describeAttempts(attempts)}.`
        : 'No AI provider is set up. Add a key in Settings → AI providers.',
    );
    this.name = 'AllProvidersFailed';
  }
}

export interface RouterResult<T> {
  data: T;
  provider: ProviderId;
  model: string;
  ms: number;
  attempts: Attempt[];
}

const DEFAULT_COOLDOWN_MS = 60_000;

/**
 * Sends a task to the first available provider for its tier and returns
 * schema-checked JSON. A reply that fails the schema is retried once with the
 * errors; after that, or on a rate limit or error, the next provider is tried.
 */
export async function runJson<T>(
  providers: ProviderClient[],
  req: ChatRequest,
  schema: z.ZodType<T>,
  hooks: RouterHooks = {},
): Promise<RouterResult<T>> {
  const tier = TASK_TIER[req.task];
  const now = hooks.now ?? Date.now;
  const attempts: Attempt[] = [];
  const started = now();

  for (const client of providers) {
    const model = client.models[tier];
    if (!model) continue;
    let prompt = req.prompt;
    for (let round = 0; round < 2; round++) {
      try {
        await hooks.onRequest?.(client.id);
        const reply = await client.chat({ ...req, prompt }, model);
        let parsed: unknown;
        try {
          parsed = extractJson(reply.text);
        } catch (err) {
          attempts.push({ provider: client.id, model, outcome: 'invalid', detail: (err as Error).message });
          prompt = `${req.prompt}\n\nYour previous reply was not valid JSON. Reply again with only the JSON object.`;
          continue;
        }
        const check = schema.safeParse(parsed);
        if (check.success) {
          attempts.push({ provider: client.id, model, outcome: 'ok' });
          return { data: check.data, provider: client.id, model: reply.model, ms: now() - started, attempts };
        }
        const issues = describeIssues(check.error);
        attempts.push({ provider: client.id, model, outcome: 'invalid', detail: issues });
        prompt = `${req.prompt}\n\nYour previous reply did not match the required format:\n${issues}\n\nReply again with only the corrected JSON object.`;
      } catch (err) {
        if (!(err instanceof ProviderError)) throw err;
        attempts.push({ provider: client.id, model, outcome: err.kind, detail: err.message });
        if (err.kind === 'rate_limit' || err.kind === 'server' || err.kind === 'network') {
          await hooks.onCooldown?.(client.id, new Date(now() + (err.retryAfterMs ?? DEFAULT_COOLDOWN_MS)));
        }
        break;
      }
    }
  }
  throw new AllProvidersFailed(attempts);
}
