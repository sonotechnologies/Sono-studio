export const AI_PROVIDERS = ['gemini', 'groq', 'openrouter'] as const;
export type AiProviderId = (typeof AI_PROVIDERS)[number];
export type ProviderId = AiProviderId | 'demo';

export const STOCK_PROVIDERS = ['unsplash', 'pexels'] as const;
export type StockProviderId = (typeof STOCK_PROVIDERS)[number];

/** Strongest model for planning and custom code; light and fast for copy, chat edits and parsing. */
export type Tier = 'strong' | 'light';

export type AiTask = 'plan' | 'fill' | 'parse';

export const TASK_TIER: Record<AiTask, Tier> = { plan: 'strong', fill: 'light', parse: 'light' };

export const PROVIDER_INFO: Record<AiProviderId, { name: string; keyUrl: string; defaults: Record<Tier, string> }> = {
  gemini: {
    name: 'Google Gemini',
    keyUrl: 'https://aistudio.google.com/apikey',
    defaults: { strong: 'gemini-2.5-flash', light: 'gemini-2.5-flash-lite' },
  },
  groq: {
    name: 'Groq',
    keyUrl: 'https://console.groq.com/keys',
    defaults: { strong: 'llama-3.3-70b-versatile', light: 'llama-3.1-8b-instant' },
  },
  openrouter: {
    name: 'OpenRouter',
    keyUrl: 'https://openrouter.ai/settings/keys',
    defaults: { strong: 'meta-llama/llama-3.3-70b-instruct:free', light: 'meta-llama/llama-3.3-70b-instruct:free' },
  },
};

export interface ChatRequest {
  task: AiTask;
  system: string;
  prompt: string;
  temperature?: number;
  maxTokens?: number;
  /** Structured input the demo provider uses instead of reading the prompt. */
  demo?: unknown;
}

export interface ChatResult {
  text: string;
  model: string;
}

export type ProviderErrorKind = 'rate_limit' | 'auth' | 'bad_request' | 'server' | 'network';

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly kind: ProviderErrorKind,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

/** One provider, ready to call: its key and the model chosen for each tier. */
export interface ProviderClient {
  id: ProviderId;
  models: Record<Tier, string>;
  chat(req: ChatRequest, model: string): Promise<ChatResult>;
}
