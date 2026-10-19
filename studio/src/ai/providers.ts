import {
  ProviderError,
  type AiProviderId,
  type ChatRequest,
  type ChatResult,
  type ProviderClient,
  type Tier,
} from './types';

/*
 * Thin adapters over each provider's REST API. Nothing else in the app knows
 * which provider it is talking to, so one can be added or dropped freely.
 */

type Fetch = typeof fetch;
const TIMEOUT_MS = 50_000;

function retryAfter(res: Response): number | undefined {
  const h = res.headers.get('retry-after');
  if (!h) return undefined;
  const s = Number(h);
  if (Number.isFinite(s)) return s * 1000;
  const at = Date.parse(h);
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : undefined;
}

async function errorFrom(res: Response, provider: string): Promise<ProviderError> {
  let detail = '';
  try {
    detail = (await res.text()).slice(0, 300);
  } catch {}
  const msg = `${provider} ${res.status}${detail ? `: ${detail}` : ''}`;
  if (res.status === 429) return new ProviderError(msg, 'rate_limit', retryAfter(res));
  // Gemini reports a bad key as 400 API_KEY_INVALID rather than 401.
  if (res.status === 401 || res.status === 403 || (res.status === 400 && /API[_ ]?key/i.test(detail))) return new ProviderError(msg, 'auth');
  if (res.status === 404) return new ProviderError(`${provider}: model not found. Pick an available model in Settings → AI providers → Manage. (${detail.slice(0, 120)})`, 'model');
  if (res.status === 413) return new ProviderError(`${provider}: the request is too big for this model`, 'model');
  if (res.status >= 500) return new ProviderError(msg, 'server', retryAfter(res));
  return new ProviderError(msg, 'bad_request');
}

/** Listing models is only a key check, so it gives up much sooner than a generation request. */
const LIST_TIMEOUT_MS = 12_000;

async function send(f: Fetch, url: string, init: RequestInit, provider: string, timeoutMs = TIMEOUT_MS): Promise<Response> {
  try {
    return await f(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    throw new ProviderError(`${provider}: ${(err as Error).message}`, 'network');
  }
}

/* ---------- Google Gemini (Generative Language API) ---------- */

const GEMINI = 'https://generativelanguage.googleapis.com/v1beta';

export function geminiClient(apiKey: string, models: Record<Tier, string>, f: Fetch = fetch): ProviderClient {
  return {
    id: 'gemini',
    models,
    async chat(req: ChatRequest, model: string): Promise<ChatResult> {
      const res = await send(
        f,
        `${GEMINI}/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: req.system }] },
            contents: [{ role: 'user', parts: [{ text: req.prompt }] }],
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: req.temperature ?? 0.7,
              maxOutputTokens: req.maxTokens ?? 8192,
            },
          }),
        },
        'Gemini',
        Math.min(req.timeoutMs ?? TIMEOUT_MS, TIMEOUT_MS),
      );
      if (!res.ok) throw await errorFrom(res, 'Gemini');
      const data = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
        promptFeedback?: { blockReason?: string };
        usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
      };
      if (data.promptFeedback?.blockReason) throw new ProviderError(`Gemini blocked the request: ${data.promptFeedback.blockReason}`, 'bad_request');
      const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
      if (!text) throw new ProviderError(`Gemini returned no text (${data.candidates?.[0]?.finishReason ?? 'unknown'})`, 'server');
      const u = data.usageMetadata;
      return { text, model, ...(u ? { usage: { input: u.promptTokenCount ?? 0, output: u.candidatesTokenCount ?? 0 } } : {}) };
    },
  };
}

export async function geminiModels(apiKey: string, f: Fetch = fetch): Promise<string[]> {
  const res = await send(f, `${GEMINI}/models?pageSize=200`, { headers: { 'x-goog-api-key': apiKey } }, 'Gemini', LIST_TIMEOUT_MS);
  if (!res.ok) throw await errorFrom(res, 'Gemini');
  const data = (await res.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[] };
  return (data.models ?? [])
    .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
    .map((m) => m.name.replace(/^models\//, ''))
    .sort();
}

/* ---------- OpenAI-compatible: Groq and OpenRouter ---------- */

const OPENAI_COMPAT: Record<'groq' | 'openrouter', { base: string; name: string; headers?: Record<string, string> }> = {
  groq: { base: 'https://api.groq.com/openai/v1', name: 'Groq' },
  openrouter: {
    base: 'https://openrouter.ai/api/v1',
    name: 'OpenRouter',
    headers: { 'X-Title': 'Sono Studio' },
  },
};

export function openAiCompatClient(
  id: 'groq' | 'openrouter',
  apiKey: string,
  models: Record<Tier, string>,
  f: Fetch = fetch,
): ProviderClient {
  const cfg = OPENAI_COMPAT[id];
  const call = async (req: ChatRequest, model: string, jsonMode: boolean): Promise<ChatResult> => {
    const res = await send(
      f,
      `${cfg.base}/chat/completions`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}`, ...cfg.headers },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: req.system },
            { role: 'user', content: req.prompt },
          ],
          temperature: req.temperature ?? 0.7,
          max_tokens: req.maxTokens ?? 8192,
          ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
        }),
      },
      cfg.name,
      Math.min(req.timeoutMs ?? TIMEOUT_MS, TIMEOUT_MS),
    );
    if (!res.ok) throw await errorFrom(res, cfg.name);
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      error?: { message?: string; code?: number };
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    // OpenRouter can report upstream failures with a 200 status.
    if (data.error) throw new ProviderError(`${cfg.name}: ${data.error.message ?? 'error'}`, data.error.code === 429 ? 'rate_limit' : 'server');
    const text = data.choices?.[0]?.message?.content ?? '';
    if (!text) throw new ProviderError(`${cfg.name} returned no text`, 'server');
    return { text, model, ...(data.usage ? { usage: { input: data.usage.prompt_tokens ?? 0, output: data.usage.completion_tokens ?? 0 } } : {}) };
  };
  return {
    id,
    models,
    async chat(req, model) {
      try {
        return await call(req, model, true);
      } catch (err) {
        // Some free models reject JSON mode; the prompt still asks for JSON, so retry without it.
        if (err instanceof ProviderError && err.kind === 'bad_request' && /response_format|json/i.test(err.message)) {
          return call(req, model, false);
        }
        throw err;
      }
    },
  };
}

export async function openAiCompatModels(id: 'groq' | 'openrouter', apiKey: string, f: Fetch = fetch): Promise<string[]> {
  const cfg = OPENAI_COMPAT[id];
  const res = await send(f, `${cfg.base}/models`, { headers: { authorization: `Bearer ${apiKey}` } }, cfg.name, LIST_TIMEOUT_MS);
  if (!res.ok) throw await errorFrom(res, cfg.name);
  const data = (await res.json()) as { data?: { id: string; pricing?: { prompt?: string; completion?: string } }[] };
  const list = data.data ?? [];
  // On OpenRouter only free models are useful here.
  const free = id === 'openrouter' ? list.filter((m) => m.id.endsWith(':free') || (m.pricing?.prompt === '0' && m.pricing?.completion === '0')) : list;
  return free.map((m) => m.id).sort();
}

export function makeClient(id: AiProviderId, apiKey: string, models: Record<Tier, string>, f: Fetch = fetch): ProviderClient {
  return id === 'gemini' ? geminiClient(apiKey, models, f) : openAiCompatClient(id, apiKey, models, f);
}

export function listModels(id: AiProviderId, apiKey: string, f: Fetch = fetch): Promise<string[]> {
  return id === 'gemini' ? geminiModels(apiKey, f) : openAiCompatModels(id, apiKey, f);
}
