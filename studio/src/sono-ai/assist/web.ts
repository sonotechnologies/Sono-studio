import type { Source } from './types';

/*
 * Live web answers through Gemini's grounding with Google Search, which
 * returns the pages it used. Only the (redacted) question is sent.
 */

export interface WebAnswer {
  text: string;
  sources: Source[];
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
}

export type WebSearch = (question: string, system: string) => Promise<WebAnswer>;

export class WebSearchError extends Error {
  constructor(
    message: string,
    readonly limit = false,
  ) {
    super(message);
  }
}

export function geminiWebSearch(apiKey: string, model: string, f: typeof fetch = fetch, base = process.env.SONO_GEMINI_API_URL || 'https://generativelanguage.googleapis.com/v1beta'): WebSearch {
  return async (question, system) => {
    let res: Response;
    try {
      res = await f(`${base}/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: question }] }],
          tools: [{ google_search: {} }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 1200 },
        }),
        signal: AbortSignal.timeout(40_000),
      });
    } catch (err) {
      throw new WebSearchError(`Web search could not be reached: ${(err as Error).message}`);
    }
    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).slice(0, 200);
      throw new WebSearchError(res.status === 429 ? 'Web search hit Gemini’s free limit for now. Try again later.' : `Web search failed (${res.status}): ${detail}`, res.status === 429);
    }
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] }; groundingMetadata?: { groundingChunks?: { web?: { uri?: string; title?: string } }[] } }[];
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };
    const c = data.candidates?.[0];
    const text = c?.content?.parts?.map((p) => p.text ?? '').join('').trim() ?? '';
    if (!text) throw new WebSearchError('Web search returned no answer.');
    const seen = new Set<string>();
    const sources = (c?.groundingMetadata?.groundingChunks ?? [])
      .flatMap((g) => (g.web?.uri ? [{ label: g.web.title || new URL(g.web.uri).hostname, href: g.web.uri }] : []))
      .filter((s) => !seen.has(s.label) && seen.add(s.label))
      .slice(0, 6);
    return { text, sources, model, inputTokens: data.usageMetadata?.promptTokenCount ?? null, outputTokens: data.usageMetadata?.candidatesTokenCount ?? null };
  };
}
