'use client';

import { AlertTriangle, ArrowDown, ArrowUp, Check, GripVertical, Plus, X } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { MiniSpin, Orbit } from '@/components/orbit';
import { buildConfig } from '@/generate/assemble';
import type { Asset, GenerationJob, Plan, PlanSection } from '@/generate/brief';
import { stepsFor } from '@/generate/pipeline';
import { PLANNABLE_TYPES } from '@/generate/plan';
import { SECTIONS } from '@/site/registry';
import { SitePageView } from '@/site/render';
import type { SectionType, SiteConfig } from '@/site/schema';
import { layoutsFor } from '@/generate/plan';

export function PipelineColumn({ job }: { job: GenerationJob }) {
  const name = job.brief.businessName || 'your site';
  const title =
    job.status === 'plan_review' ? 'Review the plan' : job.status === 'failed' ? 'Something went wrong' : job.status === 'done' ? `${name} is ready` : job.plan ? `Writing ${name}` : `Planning ${name}`;
  return (
    <div className="flex min-h-0 flex-col justify-[safe_center] gap-9 overflow-auto border-border px-6 py-8 md:border-r md:px-14 md:py-12">
      <div className="flex flex-col gap-5">
        {job.status === 'failed' ? (
          <span className="flex size-[84px] items-center justify-center text-danger">
            <AlertTriangle size={44} strokeWidth={1.8} />
          </span>
        ) : job.status === 'done' ? (
          <span className="flex size-[84px] items-center justify-center">
            <span className="flex size-14 items-center justify-center rounded-full bg-terracotta text-white">
              <Check size={28} strokeWidth={3} />
            </span>
          </span>
        ) : (
          <Orbit />
        )}
        <h1 className="m-0 text-[32px] leading-[1.1] font-semibold tracking-[-0.02em] md:text-[40px]">{title}</h1>
      </div>
      {job.status === 'failed' && job.error && (
        <div role="alert" className="flex flex-col gap-2 rounded-card border border-border bg-surface p-4 text-[14px] leading-normal">
          <span className="[overflow-wrap:anywhere]">{job.error}</span>
          {/Settings/.test(job.error) && (
            <Link href="/settings?tab=providers" className="font-medium text-accent-text hover:underline">
              Open AI provider settings
            </Link>
          )}
      <ol className="m-0 flex list-none flex-col gap-0.5 p-0" aria-label="Progress">
        {stepsFor(job).map((s) => {
          const lit = s.state !== 'pending';
          return (
            <li key={s.key} className={`flex min-h-11 items-center gap-3.5 transition-opacity duration-200 ${lit ? 'opacity-100' : 'opacity-40'}`}>
              <span
                className={`flex size-[22px] flex-none items-center justify-center rounded-full text-white ${
                  s.state === 'done' ? 'bg-terracotta' : s.state === 'skipped' ? 'bg-muted' : s.state === 'failed' ? 'bg-danger-fill' : s.state === 'pending' ? 'border-2 border-border' : ''
                }`}
              >
                {(s.state === 'done' || s.state === 'skipped') && <Check size={12} strokeWidth={3.2} />}
                {s.state === 'failed' && <X size={12} strokeWidth={3.2} />}
                {s.state === 'active' && <MiniSpin />}
              </span>
              <span className={`flex-1 text-[16px] ${s.state === 'active' ? 'font-semibold' : ''}`}>
                {s.label}
                {s.state === 'active' && <span className="sr-only"> (in progress)</span>}
              </span>
              <span className="max-w-[45%] truncate text-right font-mono text-[12px] text-muted" title={s.meta}>
                {s.state === 'skipped' ? 'Skipped' : s.state === 'failed' ? 'Failed' : s.meta}
              </span>
            </li>
          );
        })}
      </ol>
        </div>
      )}
    </div>
  );
}

/* ---------- Plan review ---------- */

export function PlanReview({ plan, setPlan, brief }: { plan: Plan; setPlan: (p: Plan) => void; brief: GenerationJob['brief'] }) {
  const layouts = layoutsFor(brief);
  const [drag, setDrag] = useState<{ page: string; id: string } | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const count = plan.pages.reduce((n, p) => n + p.sections.length, 0);

  const update = (pageId: string, fn: (s: PlanSection[]) => PlanSection[]) =>
    setPlan({ pages: plan.pages.map((p) => (p.id === pageId ? { ...p, sections: fn(p.sections) } : p)) });
  const move = (pageId: string, from: number, to: number) =>
    update(pageId, (s) => {
      if (to < 0 || to >= s.length) return s;
      const arr = [...s];
      const [it] = arr.splice(from, 1);
      arr.splice(to, 0, it);
      return arr;
    });
  const add = (pageId: string, type: SectionType) =>
    update(pageId, (s) => [
      ...s,
      {
        id: `${pageId}-${type}-${Math.random().toString(36).slice(2, 6)}`,
        type,
        variant: SECTIONS[type].variants.some((v) => v.id === layouts[type]) ? layouts[type] : SECTIONS[type].variants[0].id,
        note: SECTIONS[type].purpose,
      },
    ]);

  return (
    <>
      <div className="flex flex-col gap-1">
        <h2 className="m-0 text-[20px] font-semibold">
          Plan · {count} sections across {plan.pages.length} {plan.pages.length === 1 ? 'page' : 'pages'}
        </h2>
        <span className="text-[13px] text-text/75">Drag to reorder. Remove or add before copy is written. Navbar and footer are added to every page.</span>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] items-start gap-4">
        {plan.pages.map((pg) => (
          <section key={pg.id} aria-label={`${pg.title} page`} className="flex animate-fade-up flex-col gap-2 rounded-dialog bg-surface p-3.5">
            <div className="flex items-center gap-2 px-1 pt-0.5 pb-1.5">
              <span className="flex-1 text-[15px] font-semibold">{pg.title}</span>
              <span className="text-[12px] text-muted">{pg.sections.length} sections</span>
            </div>
            {pg.sections.map((s, i) => (
              <div
                key={s.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', s.id);
                  setDrag({ page: pg.id, id: s.id });
                }}
                onDragOver={(e) => {
                  if (drag?.page !== pg.id) return;
                  e.preventDefault();
                  setOver(s.id);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (drag?.page === pg.id) move(pg.id, pg.sections.findIndex((x) => x.id === drag.id), i);
                  setDrag(null);
                  setOver(null);
                }}
                onDragEnd={() => {
                  setDrag(null);
                  setOver(null);
                }}
                className={`group flex cursor-grab items-center gap-2.5 rounded-xl border-[1.5px] bg-bg py-2.5 pr-2.5 pl-2 ${
                  over === s.id && drag?.id !== s.id ? 'border-terracotta' : 'border-transparent'
                } ${drag?.id === s.id ? 'opacity-40' : ''}`}
              >
                <GripVertical size={14} strokeWidth={2} className="flex-none text-muted opacity-60" />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[14px] font-medium">{SECTIONS[s.type].label}</span>
                  <span className="text-[12px] leading-[1.35] text-muted">{s.note}</span>
                </div>
                <div className="flex flex-none opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                  <button type="button" aria-label={`Move ${SECTIONS[s.type].label} up`} disabled={i === 0} onClick={() => move(pg.id, i, i - 1)} className="flex size-[26px] cursor-pointer items-center justify-center rounded-full text-muted hover:bg-hover hover:text-text disabled:opacity-30">
                    <ArrowUp size={13} strokeWidth={2} />
                  </button>
                  <button type="button" aria-label={`Move ${SECTIONS[s.type].label} down`} disabled={i === pg.sections.length - 1} onClick={() => move(pg.id, i, i + 1)} className="flex size-[26px] cursor-pointer items-center justify-center rounded-full text-muted hover:bg-hover hover:text-text disabled:opacity-30">
                    <ArrowDown size={13} strokeWidth={2} />
                  </button>
                </div>
                <button
                  type="button"
                  title="Remove"
                  aria-label={`Remove ${SECTIONS[s.type].label}`}
                  onClick={() => update(pg.id, (list) => list.filter((x) => x.id !== s.id))}
                  className="flex size-[26px] flex-none cursor-pointer items-center justify-center rounded-full text-muted hover:bg-hover hover:text-text"
                >
                  <X size={14} strokeWidth={2} />
                </button>
              </div>
            ))}
            {adding === pg.id ? (
              <div className="flex flex-col gap-1 rounded-[10px] border border-border p-1.5">
                {PLANNABLE_TYPES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      add(pg.id, t);
                      setAdding(null);
                    }}
                    className="flex cursor-pointer flex-col items-start rounded-lg px-2.5 py-1.5 text-left hover:bg-hover"
                  >
                    <span className="text-[13px] font-medium">{SECTIONS[t].label}</span>
                    <span className="text-[11px] text-muted">{SECTIONS[t].purpose}</span>
                  </button>
                ))}
                <button type="button" onClick={() => setAdding(null)} className="h-8 cursor-pointer rounded-lg text-[13px] text-muted hover:bg-hover">
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={pg.sections.length >= 12}
                onClick={() => setAdding(pg.id)}
                className="flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-[10px] border border-dashed border-border text-[13px] font-medium text-muted hover:bg-hover hover:text-text disabled:opacity-40"
              >
                <Plus size={14} strokeWidth={2} />
                Add section
              </button>
            )}
          </section>
        ))}
      </div>
    </>
  );
}

/* ---------- Live preview while writing ---------- */

/** The site as written so far, scaled to fit the stage; sections fade in as they arrive. */
export function LivePreview({ job, assets }: { job: GenerationJob; assets: Asset[] }) {
  const [scale, setScale] = useState(0.5);
  const [pageId, setPageId] = useState<string | null>(null);
  const observer = useRef<ResizeObserver | null>(null);
  // A callback ref: the frame only exists once the first page is written.
  const box = useCallback((el: HTMLDivElement | null) => {
    observer.current?.disconnect();
    if (!el) return;
    observer.current = new ResizeObserver(([e]) => setScale(Math.min(1, e.contentRect.width / 1200)));
    observer.current.observe(el);
  }, []);
  useEffect(() => () => observer.current?.disconnect(), []);

  let config: SiteConfig | null = null;
  try {
    if (job.plan) config = buildConfig(job.brief, job.extracted, job.plan, job.filled, assets);
  } catch {
    config = null;
  }
  const written = job.plan?.pages.filter((p) => job.filled[p.id]) ?? [];
  if (!config || !written.length) {
    return <div className="flex flex-1 items-center justify-center text-[14px] text-text/75">The site appears here as each page is written.</div>;
  }
  // Follow the newest written page unless one was picked.
  const current = written.find((p) => p.id === pageId) ?? written.at(-1)!;
  const page = config.pages.find((p) => p.id === current.id)!;
  return (
    <div className="flex flex-col gap-3">
      <div role="tablist" aria-label="Pages written" className="flex flex-wrap gap-1">
        {written.map((p) => (
          <button
            key={p.id}
            role="tab"
            type="button"
            aria-selected={p.id === current.id}
            onClick={() => setPageId(p.id)}
            className={`h-8 cursor-pointer rounded-full px-3 text-[13px] font-medium ${p.id === current.id ? 'bg-surface text-text' : 'text-text/70 hover:bg-hover'}`}
          >
            {p.title}
          </button>
        ))}
      </div>
      <div ref={box} className="w-full">
        <div className="gen-preview w-fit overflow-hidden rounded-xl shadow-[0_18px_50px_rgba(22,20,15,.25)]">
          <div style={{ width: 1200, zoom: scale }}>
            <SitePageView config={config} page={page} ctx={{ link: () => '#', editable: false }} />
          </div>
        </div>
      </div>
    </div>
  );
}
