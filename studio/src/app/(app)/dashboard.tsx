'use client';

import { Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { Logo } from '@/components/logo';
import { useQueryParam } from '@/components/shell';
import { SiteThumb } from '@/components/site-thumb';
import { STATUS_STYLE, StatusPill, Switch, btn } from '@/components/ui';
import { needsFollowUp, seenLine } from '@/lib/format';
import { PROJECT_STATUSES, STATUS_LABELS, type Project, type ProjectStatus } from '@/lib/types';

export function Dashboard({ projects, now }: { projects: Project[]; now: number }) {
  const [q, setQ] = useQueryParam('q');
  const [statusParam, setStatus] = useQueryParam('status');
  const [type, setType] = useQueryParam('type');
  const [followParam, setFollow] = useQueryParam('follow');

  const status = (PROJECT_STATUSES as readonly string[]).includes(statusParam) ? (statusParam as ProjectStatus) : null;
  const follow = followParam === '1';

  if (projects.length === 0) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-[22px] text-center">
        <Logo kind="mark" alt="Sono" className="h-12 w-auto" />
        <p className="m-0 text-[20px] font-medium">No sites yet. Build the first one for a business you know.</p>
        <Link href="/projects/new" className={`${btn.primary} h-11 px-5 text-[15px]`}>
          <Plus size={16} strokeWidth={2} />
          New site
        </Link>
      </div>
    );
  }

  const followUps = new Set(projects.filter((p) => needsFollowUp(p, now)).map((p) => p.id));
  const types = Array.from(new Set(projects.map((p) => p.businessType)));
  const needle = q.trim().toLowerCase();
  const filtered = projects.filter(
    (p) =>
      (!status || p.status === status) &&
      (!type || p.businessType === type) &&
      (!follow || followUps.has(p.id)) &&
      (!needle ||
        [p.name, p.businessType, p.client.ownerName, p.client.instagram].join(' ').toLowerCase().includes(needle)),
  );
  const clear = () => {
    setStatus('');
    setType('');
    setFollow('');
    setQ('');
  };

  return (
    <>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
        {PROJECT_STATUSES.map((s) => {
          const on = status === s;
          return (
            <button
              key={s}
              type="button"
              aria-pressed={on}
              onClick={() => setStatus(on ? '' : s)}
              className={`flex cursor-pointer flex-col gap-1.5 rounded-dialog border-[1.5px] bg-surface px-5 py-[18px] text-left transition-[border-color] duration-150 ease-out ${
                on ? 'border-terracotta' : 'border-border hover:border-muted'
              }`}
            >
              <span className="text-[40px] leading-none font-semibold tracking-[-0.03em]">
                {projects.filter((p) => p.status === s).length}
              </span>
              <span className="flex items-center gap-2 text-[14px] font-medium text-muted">
                <span className={`size-2 rounded-full ${STATUS_STYLE[s].dot}`} />
                {STATUS_LABELS[s]}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex h-11 w-full items-center gap-2 rounded-full border border-border bg-surface px-3.5 text-muted focus-within:border-terracotta focus-within:shadow-focus md:hidden">
          <Search size={16} strokeWidth={2} className="flex-none" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search"
            aria-label="Search sites and clients"
            className="min-w-0 flex-1 border-none bg-transparent text-[16px] text-text outline-none placeholder:text-muted"
          />
        </label>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by type">
          {['', ...types].slice(0, 6).map((t) => {
            const on = type === t;
            return (
              <button
                key={t || 'all'}
                type="button"
                aria-pressed={on}
                onClick={() => setType(t)}
                className={`flex h-9 cursor-pointer items-center rounded-full border px-3.5 text-[13px] font-medium whitespace-nowrap ${
                  on ? 'border-text bg-text text-bg' : 'border-border text-text hover:bg-hover'
                }`}
              >
                {t || 'All'}
              </button>
            );
          })}
        </div>
        <div className="flex-1" />
        <label className="flex h-9 cursor-pointer items-center gap-2.5 text-[13px] font-medium">
          <Switch on={follow} onChange={(v) => setFollow(v ? '1' : '')} label="Needs follow-up" size="sm" />
          <span>Needs follow-up · {followUps.size}</span>
        </label>
      </div>

      {filtered.length > 0 ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(270px,1fr))] gap-[18px]">
          {filtered.map((p) => (
            <Link
              key={p.id}
              href={`/projects/${p.id}`}
              className="flex flex-col overflow-hidden rounded-dialog border border-border bg-surface transition-[transform,box-shadow] duration-[180ms] ease-out hover:-translate-y-0.5 hover:shadow-raised"
            >
              <SiteThumb preset={p.preset} name={p.name} headline={p.headline} />
              <div className="flex flex-col gap-1.5 px-4 pt-3.5 pb-4">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-[16px] font-semibold">{p.name}</span>
                  <StatusPill status={p.status} />
                </div>
                <div className="flex flex-wrap gap-1.5 text-[13px] text-muted">
                  <span>{p.businessType}</span>
                  <span>·</span>
                  <span className={followUps.has(p.id) ? 'text-warn' : undefined}>{seenLine(p, now)}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <span className="text-[16px]">No sites match these filters.</span>
          <button
            type="button"
            onClick={clear}
            className="cursor-pointer text-[14px] font-medium text-accent-text hover:underline"
          >
            Clear filters
          </button>
        </div>
      )}
    </>
  );
}
