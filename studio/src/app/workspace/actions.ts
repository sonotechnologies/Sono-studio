'use server';

import { customPrompt, customReplySchema, toCustom } from '@/generate/custom';
import type { CustomDef } from '@/site/schema';

import { applyOps, CHAT_ERROR, chatPrompt, chatReplySchema, chatReplyText, type ChatScope } from '@/ai/chat';
import { AllProvidersFailed, runJson } from '@/ai/router';
import { loadProviders, loadStock, routerHooks } from '@/ai/service';
import type { Asset } from '@/generate/brief';
import type { StockPhoto } from '@/generate/stock';
import { getRepo, requireUser } from '@/lib/auth';
import type { ChatMessage, VersionInfo } from '@/lib/data/repo';
import { siteConfigSchema, type SiteConfig } from '@/site/schema';

export interface SaveConflict {
  /** The newest version, saved elsewhere since this one was loaded. */
  version: number;
  config: SiteConfig;
  /** For a client's edit in /admin: the version they started from, to bring only their changes in. */
  basedOn: SiteConfig | null;
}

/**
 * Saves the workspace's current config as a new version. With `base` (the
 * version the workspace last loaded or saved), a newer version saved
 * elsewhere (another tab, or the client in /admin) is sent back instead, so
 * it can be merged rather than overwritten.
 */
export async function saveSiteAction(projectId: string, config: SiteConfig, summary: string, base?: number): Promise<{ version?: number; error?: string; conflict?: SaveConflict }> {
  await requireUser();
  const parsed = siteConfigSchema.safeParse(config);
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    return { error: `Not saved: ${i?.path.join('.')} ${i?.message}` };
  }
  const repo = await getRepo();
  if (base !== undefined) {
    const latest = await repo.getSiteVersion(projectId);
    if (latest && latest.version > base) {
      const from = await repo.versionBasedOn(projectId, latest.version);
      const basedOn = from !== null ? await repo.getSiteVersionNumber(projectId, from) : null;
      const read = (c: unknown) => siteConfigSchema.safeParse(c);
      const now = read(latest.config);
      if (now.success) return { conflict: { version: latest.version, config: now.data, basedOn: basedOn && read(basedOn.config).success ? read(basedOn.config).data! : null } };
    }
  }
  const version = await repo.saveSiteVersion(projectId, parsed.data, summary.slice(0, 300) || 'Edited');
  // A shop added in the workspace makes the project a store in the projects list.
  if (parsed.data.store && summary.includes('Added a shop')) await repo.updateProject(projectId, { siteType: 'store' });
  if (parsed.data.bookings && summary.includes('Added bookings')) await repo.updateProject(projectId, { siteType: 'booking' });
  // No revalidatePath: it would re-render the whole workspace page on every autosave. Project pages are dynamic and read fresh data anyway.
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
  const providers = await loadProviders(repo, { projectId });
  // The last few turns, so "yes", "do that" and "but bigger" make sense.
  // Errors aren't part of the conversation the model sees.
  const history = (await repo.listChatMessages(projectId).catch(() => []))
    .filter((m) => m.change !== CHAT_ERROR)
    .slice(-6)
    .map((m) => ({ role: m.role, text: m.text }));
  const userMsg = await repo.addChatMessage(projectId, { role: 'user', text: message, scope: input.scope.kind, change: '', version: null });
  try {
    const r = await runJson(
      providers,
      { task: 'chat', ...chatPrompt(parsed.data, input.scope, message, input.businessType, history), temperature: 0.4, maxTokens: 4000, budgetMs: 50_000, demo: { kind: 'chat' } },
      chatReplySchema,
      routerHooks(repo),
    );
    const applied = applyOps(parsed.data, r.data.ops, input.scope);
    const changed = JSON.stringify(applied.config) !== JSON.stringify(parsed.data);
    const version = changed ? await repo.saveSiteVersion(projectId, applied.config, `Chat: ${applied.summary}`.slice(0, 300)) : undefined;
    const aiMsg = await repo.addChatMessage(projectId, {
      role: 'assistant',
      text: chatReplyText(r.data.reply, r.data.ops.length + r.data.unreadable, changed, [...(r.data.unreadable ? [`ops: ${r.data.unreadable === 1 ? 'one change was' : 'some changes were'} written wrongly by the AI`] : []), ...applied.skipped]),
      scope: input.scope.kind,
      change: changed ? applied.summary : 'No change',
      version: version ?? null,
    });
    return { reply: aiMsg.text, config: applied.config, touched: applied.touched, summary: applied.summary, skipped: applied.skipped, version, messages: [userMsg, aiMsg] };
  } catch (err) {
    const text = err instanceof AllProvidersFailed ? err.message : `Something went wrong: ${(err as Error).message}`;
    const aiMsg = await repo.addChatMessage(projectId, { role: 'assistant', text: text.slice(0, 1000), scope: input.scope.kind, change: CHAT_ERROR, version: null });
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


/**
 * Asks the AI for a custom section, or a change to one. The reply is checked
 * (fields, content and code) before it's returned; nothing is saved here.
 */
export async function writeCustomAction(
  projectId: string,
  input: { purpose: string; pageTitle: string; businessType: string; businessName: string; existing?: { def: CustomDef; data: Record<string, unknown>; change: string } },
): Promise<{ def?: CustomDef; data?: Record<string, unknown>; model?: string; error?: string }> {
  await requireUser();
  const purpose = input.purpose.trim().slice(0, 300);
  if (!purpose) return { error: 'Describe what the section should show.' };
  const repo = await getRepo();
  if (!(await repo.getProject(projectId))) return { error: 'Project not found' };
  try {
    const r = await runJson(
      await loadProviders(repo, { projectId }),
      {
        task: 'custom',
        budgetMs: 50_000,
        ...customPrompt({
          businessName: input.businessName,
          businessType: input.businessType,
          purpose,
          pageTitle: input.pageTitle,
          existing: input.existing ? { ...input.existing, change: input.existing.change.trim().slice(0, 600) } : undefined,
        }),
        temperature: 0.4,
        demo: { kind: 'custom', purpose },
      },
      customReplySchema,
      routerHooks(repo),
    );
    const out = toCustom(r.data, purpose);
    return { ...out, model: r.provider === 'demo' ? 'Demo' : r.model };
  } catch (err) {
    return { error: err instanceof AllProvidersFailed ? err.message : `The section couldn’t be written: ${(err as Error).message.slice(0, 300)}` };
  }
}
