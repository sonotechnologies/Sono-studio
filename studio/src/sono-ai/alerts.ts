import 'server-only';
import type { Repo } from '@/lib/data/repo';
import { siteUrl } from '@/lib/format';
import { defer, sonoAiEnabled } from './index';
import { keyedStore, keyedStoreSignedIn, type KeyedStore } from './notify-store';
import { escapeHtml, telegram, telegramToken } from './telegram';

/*
 * Alerts, sent to Telegram the moment the event is saved: a pitch link's first
 * real open, a failed generation or deploy, a provider hitting its limit, and
 * every AI provider resting at once. Each is recorded so it goes only once,
 * runs after the response, and never affects the request that caused it.
 */

const PROVIDER: Record<string, string> = { gemini: 'Gemini', groq: 'Groq', openrouter: 'OpenRouter' };
const link = (projectId: string) => `<a href="${siteUrl()}/projects/${projectId}">Open</a>`;

function run(task: (send: (chatId: number, html: string) => Promise<void>) => Promise<void>): void {
  const token = telegramToken();
  if (!sonoAiEnabled() || !token) return;
  defer(async () => {
    try {
      const bot = telegram(token);
      await task((chatId, html) => bot.send(chatId, html));
    } catch (err) {
      console.warn('Sono AI alert not sent:', (err as Error).message);
    }
  });
}

async function claimAndSend(store: KeyedStore, send: (chatId: number, html: string) => Promise<void>, kind: string, ref: string, html: string) {
  const chatId = await store.claimAlert(kind, ref);
  if (chatId) await send(chatId, html);
}

/** Called after a pitch open is logged (no signed-in user there). Bots are filtered by the caller. */
export function alertPitchOpen(slug: string): void {
  run(async (send) => {
    const hit = await keyedStore().pitchAlert(slug);
    if (hit) await send(hit.chatId, `👀 <b>${escapeHtml(hit.name)}</b>: the pitch link was opened for the first time (${escapeHtml(hit.device)}). ${link(hit.projectId)}`);
  });
}

export function alertGenerationFailed(job: { id: string; projectId: string; steps: unknown[]; error: string | null }, name: () => Promise<string>): void {
  run(async (send) => {
    const projectName = await name();
    const reason = (job.error ?? 'unknown error').split('. ')[0].slice(0, 200);
    await claimAndSend(await keyedStoreSignedIn(), send, 'build_failed', `job:${job.id}:${job.steps.length}`, `⚠️ Generating <b>${escapeHtml(projectName)}</b> failed: ${escapeHtml(reason)}. ${link(job.projectId)}`);
  });
}

export function alertDeployFailed(deployment: { id: string; projectId: string; error: string | null }, name: () => Promise<string>): void {
  run(async (send) => {
    const projectName = await name();
    const reason = (deployment.error ?? 'the build failed').slice(0, 200);
    await claimAndSend(await keyedStoreSignedIn(), send, 'deploy_failed', `deploy:${deployment.id}`, `⚠️ Deploying <b>${escapeHtml(projectName)}</b> failed: ${escapeHtml(reason)} ${link(deployment.projectId)}`);
  });
}

/**
 * A provider was put to rest. A long rest means it hit its limit (short ones
 * are momentary server errors, not worth a message). If every AI provider is
 * now resting, that's a second alert: generation will wait.
 */
export function alertProviderRest(repo: Repo, provider: string, until: Date): void {
  const restMs = until.getTime() - Date.now();
  if (restMs < 30_000) return;
  run(async (send) => {
    const store = await keyedStoreSignedIn();
    const hour = new Date().toISOString().slice(0, 13);
    const back = until.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos' });
    await claimAndSend(store, send, 'provider_limit', `limit:${provider}:${hour}`, `⏳ ${PROVIDER[provider] ?? provider} hit its limit; the studio moved on to the next provider. It's back around ${back} (Lagos).`);
    const now = new Date();
    const ai = (await repo.listProviderKeys()).filter((k) => k.provider in PROVIDER);
    const resting = (k: (typeof ai)[number]) =>
      (k.cooldownUntil && new Date(k.cooldownUntil) > now) || (k.dailyLimit && k.usageDay === now.toISOString().slice(0, 10) && k.usageCount >= k.dailyLimit);
    if (ai.length && ai.every(resting))
      await claimAndSend(store, send, 'all_resting', `resting:${hour}`, '🛑 Every AI provider is resting (cooling down or at today’s limit). Generation and chat will wait until one is back, or add another provider in Settings.');
  });
}
