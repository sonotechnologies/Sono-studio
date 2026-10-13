import type { GenerationJob } from '@/generate/brief';
import type { ChatMessage, PitchEvent, VersionInfo } from '@/lib/data/repo';
import type { Project } from '@/lib/types';
import { Redactor, type ClientDetails } from './redact';
import type { Interaction, NewInteraction, Outcome, SonoAiStore } from './store';

/*
 * Imports the studio's past AI work into the knowledge bank (redacted), and
 * links results to what came of them, using events the studio already saves:
 * site versions, chat undos, pitch opens and project status. Read-only on
 * studio data; safe to run any number of times.
 */

/** The studio reads the bank needs, matching the studio's Repo. */
export interface StudioReader {
  listProjects(): Promise<Project[]>;
  getLatestJob(projectId: string): Promise<GenerationJob | null>;
  listChatMessages(projectId: string): Promise<ChatMessage[]>;
  listSiteVersions(projectId: string, limit?: number): Promise<VersionInfo[]>;
  listPitchEvents(projectId: string, limit?: number): Promise<PitchEvent[]>;
}

export interface BackfillResult {
  projects: number;
  interactions: number;
  outcomes: number;
}

const GENERATION_TASKS = ['parse', 'plan', 'fill', 'custom'];

export function clientOf(p: Project): ClientDetails {
  return { businessName: p.name, ownerName: p.client.ownerName, whatsapp: p.client.whatsapp, instagram: p.client.instagram, address: p.client.address };
}

const json = (v: unknown) => (v === undefined || v === null ? '' : JSON.stringify(v));

/** One generation step as it ran: what it was asked (as far as the job kept it) and what it produced. */
function stepText(job: GenerationJob, key: string): { task: string; request: string; answer: string } | null {
  if (key === 'parse') return { task: 'parse', request: json(job.brief), answer: json(job.extracted) };
  if (key === 'plan') return { task: 'plan', request: json({ brief: job.brief, extracted: job.extracted }), answer: json(job.plan) };
  if (key.startsWith('write:')) {
    const pageId = key.slice(6);
    const page = job.plan?.pages.find((p) => p.id === pageId);
    return { task: 'fill', request: json(page ?? { page: pageId }), answer: json(job.filled[pageId]) };
  }
  if (key.startsWith('custom:')) {
    const id = key.slice(7);
    const planned = job.plan?.pages.flatMap((p) => p.sections).find((s) => s.id === id);
    return { task: 'custom', request: planned?.note ?? '', answer: json(planned?.custom) };
  }
  return null;
}

/** Past interactions for one project, redacted. */
export function historyOf(project: Project, job: GenerationJob | null, chat: ChatMessage[], redactor: Redactor): NewInteraction[] {
  const base = { projectId: project.id, siteType: project.siteType, source: 'backfill' as const, system: '', inputTokens: null, outputTokens: null };
  const out: NewInteraction[] = [];
  if (job) {
    job.steps.forEach((step, i) => {
      if (!step.provider || step.provider === 'local' || step.status === 'skipped') return;
      const text = stepText(job, step.key);
      if (!text) return;
      const failed = step.status === 'failed';
      out.push({
        ...base,
        task: text.task,
        sourceRef: `job:${job.id}:${i}`,
        request: redactor.redact(text.request),
        answer: failed ? null : redactor.redact(text.answer),
        provider: step.provider,
        model: step.model ?? '',
        ms: step.ms,
        status: failed ? (/limit|429/i.test(step.detail ?? '') ? 'limit' : 'error') : 'ok',
        error: failed ? redactor.redact(step.detail ?? 'failed').slice(0, 1000) : null,
        createdAt: step.at,
      });
    });
  }
  // A chat request is the owner's message; its answer is the assistant's reply and the change it made.
  chat.forEach((m, i) => {
    if (m.role !== 'assistant') return;
    const asked = chat.slice(0, i).reverse().find((x) => x.role === 'user');
    out.push({
      ...base,
      task: 'chat',
      sourceRef: `chat:${m.id}`,
      request: redactor.redact(asked?.text ?? ''),
      answer: redactor.redact(json({ reply: m.text, change: m.change, scope: m.scope, version: m.version })),
      provider: '',
      model: '',
      ms: null,
      status: 'ok',
      error: null,
      createdAt: m.createdAt,
    });
  });
  return out;
}

const NOT_EDITS = /^(Generated site|Starter site|Chat: |Restored version|Undo|Undid a chat change)/;
const at = (s: string) => new Date(s).getTime();

/** What came of each result, from the studio's own events. */
export function outcomesOf(project: Project, versions: VersionInfo[], interactions: Interaction[], pitchEvents: PitchEvent[]): Outcome[] {
  const asc = [...versions].sort((a, b) => a.version - b.version);
  const ok = interactions.filter((i) => i.status === 'ok').sort((a, b) => at(a.createdAt) - at(b.createdAt));
  const out: Outcome[] = [];
  const add = (o: Omit<Outcome, 'projectId'>) => out.push({ ...o, projectId: project.id });
  const generated = asc.filter((v) => v.summary === 'Generated site');

  generated.forEach((v, n) => {
    const from = n > 0 ? at(generated[n - 1].createdAt) : -Infinity;
    const run = ok.filter((i) => GENERATION_TASKS.includes(i.task) && at(i.createdAt) > from && at(i.createdAt) <= at(v.createdAt) + 5_000);
    const next = generated[n + 1];
    const until = next ? at(next.createdAt) : Infinity;
    const edits = asc.filter((x) => x.version > v.version && at(x.createdAt) < until && !NOT_EDITS.test(x.summary));
    for (const i of run) {
      if (next) add({ interactionId: i.id, kind: 'regenerated', version: next.version, detail: '', key: `regenerated:${i.id}`, happenedAt: next.createdAt });
      else add({ interactionId: i.id, kind: 'kept', version: v.version, detail: '', key: `kept:${i.id}`, happenedAt: v.createdAt });
      // Your own edits on top of what was generated; that version holds your version of it.
      if (edits.length && (i.task === 'fill' || i.task === 'custom')) {
        const last = edits.at(-1)!;
        add({ interactionId: i.id, kind: 'edited', version: last.version, detail: `${edits.length} edit${edits.length === 1 ? '' : 's'} after generation`, key: `edited:${i.id}`, happenedAt: last.createdAt });
      }
    }
  });

  // Chat: each chat version comes from the chat request just before it; an "Undid a chat change" after it undoes the latest one still standing.
  const standing: { interaction: Interaction; version: VersionInfo }[] = [];
  for (const v of asc) {
    if (v.summary.startsWith('Chat: ')) {
      const i = ok.filter((x) => x.task === 'chat' && at(x.createdAt) <= at(v.createdAt) + 5_000 && at(x.createdAt) >= at(v.createdAt) - 180_000).at(-1);
      if (i) standing.push({ interaction: i, version: v });
    } else if (v.summary === 'Undid a chat change') {
      const last = standing.pop();
      if (last) add({ interactionId: last.interaction.id, kind: 'undone', version: v.version, detail: '', key: `undone:${last.interaction.id}`, happenedAt: v.createdAt });
    }
  }
  for (const s of standing) add({ interactionId: s.interaction.id, kind: 'kept', version: s.version.version, detail: s.version.summary.slice(0, 300), key: `kept:${s.interaction.id}`, happenedAt: s.version.createdAt });

  // The pitch and the project: first real open, approval, going live.
  const firstOpen = pitchEvents.filter((e) => !e.isBot).sort((a, b) => at(a.openedAt) - at(b.openedAt))[0];
  if (firstOpen) add({ interactionId: null, kind: 'pitch_opened', version: null, detail: firstOpen.device, key: `pitch_opened:${project.id}`, happenedAt: firstOpen.openedAt });
  if (project.status === 'client_approved' || project.status === 'live') add({ interactionId: null, kind: 'approved', version: project.currentVersion, detail: '', key: `approved:${project.id}`, happenedAt: project.updatedAt });
  if (project.status === 'live') add({ interactionId: null, kind: 'live', version: project.currentVersion, detail: project.liveUrl ?? '', key: `live:${project.id}`, happenedAt: project.liveAt ?? project.updatedAt });
  return out;
}

/** Imports past history and links outcomes, project by project. */
export async function backfill(studio: StudioReader, store: SonoAiStore): Promise<BackfillResult> {
  const result: BackfillResult = { projects: 0, interactions: 0, outcomes: 0 };
  // Anything after live recording started is already in the bank, with its full request.
  const since = await store.firstLive();
  const before = (iso?: string) => !since || !iso || iso < since;
  for (const project of await studio.listProjects()) {
    const [job, chat, versions, events, existing] = await Promise.all([
      studio.getLatestJob(project.id),
      studio.listChatMessages(project.id),
      studio.listSiteVersions(project.id, 500),
      studio.listPitchEvents(project.id, 500),
      store.getRedactions(project.id),
    ]);
    const redactor = new Redactor(existing, clientOf(project));
    const rows = historyOf(project, job, chat, redactor).filter((r) => before(r.createdAt));
    if (redactor.added.length) await store.addRedactions(project.id, redactor.added.splice(0));
    await store.addInteractions(rows);
    const interactions = await store.listInteractions({ projectId: project.id, limit: 2000 });
    const outcomes = outcomesOf(project, versions, interactions, events);
    await store.addOutcomes(outcomes);
    result.projects++;
    result.interactions += rows.length;
    result.outcomes += outcomes.length;
  }
  return result;
}
