'use server';

import { revalidatePath } from 'next/cache';
import { applyOps, chatPrompt, chatReplySchema, chatReplyText, type ChatScope } from '@/ai/chat';
import { AllProvidersFailed, runJson } from '@/ai/router';
import { loadProviders, loadStock, routerHooks } from '@/ai/service';
import type { Asset } from '@/generate/brief';
import type { StockPhoto } from '@/generate/stock';
import { getRepo, requireUser } from '@/lib/auth';
import type { ChatMessage, VersionInfo } from '@/lib/data/repo';
import { siteConfigSchema, type SiteConfig } from '@/site/schema';

/** Saves the workspace's current config as a new version. */
export async function saveSiteAction(projectId: string, config: SiteConfig, summary: string): Promise<{ version?: number; error?: string }> {
  await requireUser();
  const parsed = siteConfigSchema.safeParse(config);
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    return { error: `Not saved: ${i?.path.join('.')} ${i?.message}` };
  }
  const repo = await getRepo();
  const version = await repo.saveSiteVersion(projectId, parsed.data, summary.slice(0, 300) || 'Edited');
  // A shop added in the workspace makes the project a store in the projects list.
  if (parsed.data.store && summary.includes('Added a shop')) await repo.updateProject(projectId, { siteType: 'store' });
  revalidatePath(`/projects/${projectId}`);
  return { version };
}

export async function listVersionsAction(projectId: string): Promise<VersionInfo[]> {
  await requireUser();
  return (await getRepo()).listSiteVersions(projectId, 100);
}

/** Restoring never deletes history: the old config is saved again as the newest version. */
export async function restoreVersionAction(projectId: string, version: number): Promise<{ version: number; config: SiteConfig }> {
  await requireUser();
  const repo = await getRepo();
  const old = await repo.getSiteVersionNumber(projectId, version);
  if (!old) throw new Error('That version no longer exists');
  const config = siteConfigSchema.parse(old.config);
  const v = await repo.saveSiteVersion(projectId, config, `Restored version ${version}`);
  return { version: v, config };
}

export interface ChatResult {
  error?: string;
  reply?: string;
  config?: SiteConfig;
  touched?: string[];
  summary?: string;
  skipped?: string[];
  version?: number;
  messages?: ChatMessage[];
}

/**
 * One chat turn: the model returns a few operations, they are validated and
 * applied to the config the browser sent, and the result is saved as a version.
 */
export async function chatAction(projectId: string, input: { message: string; scope: ChatScope; config: SiteConfig; businessType: string }): Promise<ChatResult> {
  await requireUser();
  const message = input.message.trim().slice(0, 1500);
  if (!message) return { error: 'Type what you’d like changed.' };
  const parsed = siteConfigSchema.safeParse(input.config);
  if (!parsed.success) return { error: 'The site has an unsaved problem; undo the last edit and try again.' };
  const repo = await getRepo();
  const providers = await loadProviders(repo);
  const userMsg = await repo.addChatMessage(projectId, { role: 'user', text: message, scope: input.scope.kind, change: '', version: null });
  try {
    const r = await runJson(
      providers,
      { task: 'chat', ...chatPrompt(parsed.data, input.scope, message, input.businessType), temperature: 0.4, demo: { kind: 'chat' } },
      chatReplySchema,
      routerHooks(repo),
    );
    const applied = applyOps(parsed.data, r.data.ops, input.scope);
    const changed = JSON.stringify(applied.config) !== JSON.stringify(parsed.data);
    const version = changed ? await repo.saveSiteVersion(projectId, applied.config, `Chat: ${applied.summary}`.slice(0, 300)) : undefined;
    const aiMsg = await repo.addChatMessage(projectId, {
      role: 'assistant',
      text: chatReplyText(r.data.reply, r.data.ops.length, changed, applied.skipped),
      scope: input.scope.kind,
      change: changed ? applied.summary : 'No change',
      version: version ?? null,
    });
    return { reply: aiMsg.text, config: applied.config, touched: applied.touched, summary: applied.summary, skipped: applied.skipped, version, messages: [userMsg, aiMsg] };
  } catch (err) {
    const text = err instanceof AllProvidersFailed ? err.message : `Something went wrong: ${(err as Error).message}`;
    const aiMsg = await repo.addChatMessage(projectId, { role: 'assistant', text: text.slice(0, 1000), scope: input.scope.kind, change: 'No change', version: null });
    return { error: text, messages: [userMsg, aiMsg] };
  }
}

export async function stockSearchAction(query: string): Promise<{ photos?: StockPhoto[]; error?: string }> {
  await requireUser();
  const stock = await loadStock(await getRepo());
  if (!stock?.searchMany) return { error: 'Add an Unsplash or Pexels key in Settings → Connections to search stock photos.' };
  const q = query.trim().slice(0, 100);
  if (!q) return { photos: [] };
  try {
    return { photos: await stock.searchMany(q, 18) };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

export async function addStockAssetAction(projectId: string, photo: StockPhoto): Promise<Asset> {
  await requireUser();
  if (!/^https:\/\/(images\.unsplash\.com|images\.pexels\.com)\//.test(photo.url)) throw new Error('Unexpected image address');
  return (await getRepo()).addAsset(projectId, {
    kind: 'photo',
    source: photo.source,
    url: photo.url,
    alt: photo.alt.slice(0, 200),
    credit: photo.credit.slice(0, 120),
    width: photo.width,
    height: photo.height,
  });
}

