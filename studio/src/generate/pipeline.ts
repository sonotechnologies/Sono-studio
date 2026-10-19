import type { DemoContext } from '@/ai/demo';
import { AllProvidersFailed, runJson, type RouterHooks } from '@/ai/router';
import type { ProviderClient } from '@/ai/types';
import type { Section, SiteConfig } from '@/site/schema';
import { buildConfig } from './assemble';
import { EMPTY_EXTRACTED, extractedSchema, rawPlanSchema, type Asset, type GenerationJob, type StepLog } from './brief';
import { customPrompt, customReplySchema, toCustom } from './custom';
import { fillPrompt, fillResponseSchema, libraryPage, toSections } from './fill';
import { placeImages } from './images';
import { parsePrompt } from './ingest';
import { briefSummary, normalisePlan, planPrompt } from './plan';
import type { StockPhoto, StockSearch } from './stock';

export interface PipelineDeps {
  providers: ProviderClient[];
  hooks?: RouterHooks;
  stock: StockSearch | null;
  assets: Asset[];
  saveVersion(config: SiteConfig): Promise<number>;
  recordStock(photos: StockPhoto[]): Promise<void>;
  now?(): number;
}

export interface StepView {
  key: string;
  label: string;
  state: 'done' | 'active' | 'pending' | 'failed' | 'skipped';
  meta: string;
}

/** The visible list of pipeline steps, so generation is never just a spinner. */
export function stepsFor(job: GenerationJob): StepView[] {
  const log = (key: string) => job.steps.filter((s) => s.key === key).at(-1);
  const pages = job.plan?.pages ?? [];
  const defs: { key: string; label: string }[] = [
    { key: 'read', label: 'Reading your inputs' },
    { key: 'plan', label: 'Planning pages and sections' },
    ...(pages.length ? pages.map((p) => ({ key: `write:${p.id}`, label: `Writing copy · ${p.title}` })) : [{ key: 'write', label: 'Writing copy' }]),
    ...pages.flatMap((p) => p.sections.filter((s) => s.type === 'custom').map((s) => ({ key: `custom:${s.id}`, label: `Writing a custom section · ${s.note.slice(0, 40)}` }))),
    { key: 'photos', label: 'Choosing photos' },
    { key: 'assemble', label: 'Assembling and checking' },
  ];
  const next = nextUnit(job);
  return defs.map((d) => {
    const l = log(d.key);
    const meta = l ? [l.provider === 'demo' ? 'Demo' : l.model ?? l.provider, `${(l.ms / 1000).toFixed(1)}s`].filter(Boolean).join(' · ') : '';
    if (l?.status === 'done' || l?.status === 'skipped') return { ...d, state: l.status, meta };
    if (l?.status === 'failed' && job.status === 'failed') return { ...d, state: 'failed', meta: l.detail ?? 'Failed' };
    const active = job.status === 'running' && next?.key === d.key;
    return { ...d, state: active ? 'active' : 'pending', meta: '' };
  });
}

type Unit = { key: string; label: string };

export function nextUnit(job: GenerationJob): Unit | null {
  if (job.status === 'draft' || job.status === 'done' || job.status === 'plan_review') return null;
  if (!job.extracted) return { key: 'read', label: 'Reading your inputs' };
  if (!job.plan) return { key: 'plan', label: 'Planning pages and sections' };
  const page = job.plan.pages.find((p) => !job.filled[p.id]);
  if (page) return { key: `write:${page.id}`, label: `Writing copy · ${page.title}` };
  const custom = job.plan.pages.flatMap((p) => p.sections).find((s) => s.type === 'custom' && !s.custom);
  if (custom) return { key: `custom:${custom.id}`, label: `Writing a custom section · ${custom.note.slice(0, 40)}` };
  if (!job.imagesDone) return { key: 'photos', label: 'Choosing photos' };
  return { key: 'assemble', label: 'Assembling and checking' };
}

/**
 * Runs the next unit of work and returns the updated job. Each call is short
 * (one AI request plus a possible repair), which keeps it inside serverless
 * time limits; the browser calls again until the job is done or needs review.
 */
export async function advance(job: GenerationJob, deps: PipelineDeps): Promise<{ job: GenerationJob; version?: number }> {
  const unit = nextUnit(job);
  if (!unit) return { job };
  const now = deps.now ?? Date.now;
  const started = now();
  const j: GenerationJob = structuredClone(job);
  const log = (entry: Omit<StepLog, 'key' | 'label' | 'at' | 'ms'> & { ms?: number }) =>
    j.steps.push({ key: unit.key, label: unit.label, at: new Date(now()).toISOString(), ms: entry.ms ?? now() - started, ...entry });
  const demo = (ctx: DemoContext) => ctx;

  try {
    if (unit.key === 'read') {
      if (!j.brief.paste.trim()) {
        j.extracted = { ...EMPTY_EXTRACTED };
        log({ status: 'skipped', provider: 'local', detail: 'Nothing pasted' });
      } else {
        const r = await runJson(deps.providers, { task: 'parse', budgetMs: 100_000, ...parsePrompt(j.brief), temperature: 0.1, demo: demo({ kind: 'parse', brief: j.brief }) }, extractedSchema, deps.hooks);
        j.extracted = r.data;
        log({ status: 'done', provider: r.provider, model: r.model, ms: r.ms });
      }
    } else if (unit.key === 'plan') {
      const r = await runJson(deps.providers, { task: 'plan', budgetMs: 100_000, ...planPrompt(j.brief, j.extracted), temperature: 0.4, demo: demo({ kind: 'plan', brief: j.brief }) }, rawPlanSchema, deps.hooks);
      j.plan = normalisePlan(r.data, j.brief, j.extracted);
      j.status = 'plan_review';
      log({ status: 'done', provider: r.provider, model: r.model, ms: r.ms });
    } else if (unit.key.startsWith('write:')) {
      const page = j.plan!.pages.find((p) => `write:${p.id}` === unit.key)!;
      if (!libraryPage(page).sections.length) {
        j.filled[page.id] = [];
        log({ status: 'skipped', provider: 'local', detail: 'No sections' });
      } else {
        const photos = deps.assets.filter((a) => a.kind === 'photo').length;
        const r = await runJson(
          deps.providers,
          { task: 'fill', budgetMs: 100_000, ...fillPrompt(j.brief, j.extracted, page, photos), temperature: 0.7, demo: demo({ kind: 'fill', brief: j.brief, extracted: j.extracted, page: libraryPage(page) }) },
          fillResponseSchema(page),
          deps.hooks,
        );
        j.filled[page.id] = toSections(r.data, page, j.brief, j.extracted);
        log({ status: 'done', provider: r.provider, model: r.model, ms: r.ms });
      }
    } else if (unit.key.startsWith('custom:')) {
      const page = j.plan!.pages.find((p) => p.sections.some((s) => `custom:${s.id}` === unit.key))!;
      const planned = page.sections.find((s) => `custom:${s.id}` === unit.key)!;
      try {
        const r = await runJson(
          deps.providers,
          {
            task: 'custom',
            budgetMs: 100_000,
            ...customPrompt({ businessName: j.brief.businessName, businessType: j.brief.businessType, purpose: planned.note, pageTitle: page.title, facts: briefSummary(j.brief, j.extracted) }),
            temperature: 0.4,
            demo: demo({ kind: 'custom', purpose: planned.note }),
          },
          customReplySchema,
          deps.hooks,
        );
        planned.custom = toCustom(r.data, planned.note);
        log({ status: 'done', provider: r.provider, model: r.model, ms: r.ms });
      } catch (err) {
        // A custom section is extra: the site is finished without it, and the plan says why.
        planned.custom = { failed: ((err as Error).message || 'Couldn’t be written').slice(0, 300) };
        log({ status: 'skipped', provider: 'local', detail: `Left out: ${planned.custom.failed.slice(0, 200)}` });
      }
    } else if (unit.key === 'photos') {
      const order = j.plan!.pages.map((p) => p.id);
      const res = await placeImages(j.filled as Record<string, Section[]>, order, deps.assets, deps.stock, j.brief.businessType);
      j.filled = res.pages;
      j.imagesDone = true;
      await deps.recordStock(res.stock);
      const own = deps.assets.filter((a) => a.kind === 'photo').length;
      log({
        status: 'done',
        provider: res.stock.length ? res.stock[0].source : 'local',
        model: [own && `${own} of yours`, res.stock.length && `${res.stock.length} stock`].filter(Boolean).join(', ') || 'placeholders',
      });
    } else {
      const assets = deps.assets;
      const config = buildConfig(j.brief, j.extracted, j.plan!, j.filled, assets);
      const version = await deps.saveVersion(config);
      j.status = 'done';
      j.error = null;
      log({ status: 'done', provider: 'local', model: `version ${version}` });
      return { job: j, version };
    }
    j.error = null;
    return { job: j };
  } catch (err) {
    const message = err instanceof AllProvidersFailed ? err.message : `${unit.label} failed: ${(err as Error).message}`;
    j.status = 'failed';
    j.error = message.slice(0, 1000);
    log({ status: 'failed', detail: message.slice(0, 300) });
    return { job: j };
  }
}
