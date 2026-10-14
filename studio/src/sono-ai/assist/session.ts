import 'server-only';
import { loadProviders, routerHooks } from '@/ai/service';
import { PROVIDER_INFO } from '@/ai/types';
import { decryptSecret } from '@/lib/crypto';
import type { Repo } from '@/lib/data/repo';
import { pitchUrl, siteUrl } from '@/lib/format';
import { defer } from '../index';
import { geminiEmbedder } from '../knowledge';
import { settingsStore } from '../notify-store';
import { getStore } from '../store';
import { computeScorecards, type Snapshot } from './context';
import type { DraftDeps } from './drafts';
import type { AssistDeps } from './engine';
import { forAssistant } from './reserve';
import { assistStore, type AssistStore } from './store';
import type { ScoreRow } from './types';
import { geminiWebSearch } from './web';

/** Scorecards are recalculated at most once a day, or when you ask. */
const SCORECARD_AGE_MS = 24 * 3_600_000;

export async function snapshotOf(repo: Repo): Promise<Snapshot> {
  const [projects, settings] = await Promise.all([repo.listProjects(), (await settingsStore()).get()]);
  return {
    now: new Date().toISOString(),
    followUpDays: settings.followUpDays,
    projects: projects.map((p) => ({
      id: p.id, name: p.name, businessType: p.businessType, siteType: p.siteType, status: p.status, createdAt: p.createdAt,
      pitchSentAt: p.pitchSentAt, lastOpenedAt: p.lastOpenedAt, liveAt: p.liveAt, pitchSlug: p.pitchSlug,
      client: { ownerName: p.client.ownerName, whatsapp: p.client.whatsapp, instagram: p.client.instagram, address: p.client.address, notes: p.client.notes },
    })),
  };
}

export async function recalcScorecards(assist: AssistStore): Promise<ScoreRow[]> {
  const bank = await getStore();
  const rows = computeScorecards(await bank.listInteractions({ limit: 5000 }), await bank.listOutcomes());
  await assist.saveScorecards(rows);
  return rows;
}

export async function scorecardsOf(assist: AssistStore): Promise<ScoreRow[]> {
  const saved = await assist.scorecards();
  const fresh = saved.length && Date.now() - new Date(saved[0].updatedAt).getTime() < SCORECARD_AGE_MS;
  return fresh ? saved : recalcScorecards(assist);
}

/** Everything the assistant needs, for the signed-in owner. */
export async function sessionAssist(repo: Repo, projectId: string | null) {
  const [assist, bank, keys, all] = await Promise.all([assistStore(), getStore(), repo.listProviderKeys(), loadProviders(repo, { projectId: projectId ?? undefined })]);
  const today = new Date().toISOString().slice(0, 10);
  const providers = forAssistant(all, keys.map((k) => ({ provider: k.provider, dailyLimit: k.dailyLimit, used: k.usageDay === today ? k.usageCount : 0 })));
  const gemini = keys.find((k) => k.provider === 'gemini');
  const geminiKey = gemini ? decryptSecret(gemini.ciphertext) : null;
  const geminiFree = providers.some((p) => p.id === 'gemini');
  let snap: Promise<Snapshot> | null = null;
  const snapshot = () => (snap ??= snapshotOf(repo));
  const rules = async () => (await assist.rules()).filter((r) => r.enabled && r.confirmed).map((r) => r.text);

  const deps: AssistDeps = {
    studioUrl: siteUrl(),
    providers,
    hooks: routerHooks(repo),
    snapshot,
    rules,
    history: async () => (await assist.messages('studio', 16)).map((m) => ({ role: m.role, text: m.text })),
    scorecards: () => scorecardsOf(assist),
    embedQuery: geminiKey ? geminiEmbedder(geminiKey, fetch, undefined, 'RETRIEVAL_QUERY') : null,
    match: (v, n, p) => bank.matchChunks(v, n, p),
    redactions: (id) => bank.getRedactions(id),
    web: geminiKey && geminiFree ? geminiWebSearch(geminiKey, gemini!.models.light || PROVIDER_INFO.gemini.defaults.light) : null,
    logWeb: (row) =>
      defer(() =>
        bank
          .addInteractions([{ ...row, task: 'assistant', provider: 'gemini', projectId, siteType: null, source: 'live', sourceRef: null, system: 'web search', answer: row.answer }])
          .catch(() => {}),
      ),
  };
  const draftDeps = async (): Promise<DraftDeps> => ({
    providers,
    hooks: deps.hooks,
    snapshot: await snapshot(),
    rules: await rules(),
    voice: await assist.voice(),
    pitchUrl,
  });
  return { deps, draftDeps, assist, snapshot };
}
