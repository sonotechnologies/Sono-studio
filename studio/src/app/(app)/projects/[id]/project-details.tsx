'use client';

import { ArrowRight, Check, ChevronDown, ChevronLeft, Copy, ExternalLink, Eye, Monitor, Plus, Rocket, Send, Smartphone, Tablet } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { SiteThumb } from '@/components/site-thumb';
import { ConfirmDialog, STATUS_STYLE, Segmented, StatusPill, Switch, btn, inputClass, useToast } from '@/components/ui';
import type { JobStatus } from '@/generate/brief';
import { pitchExpiresAt, type Deployment, type PitchEvent } from '@/lib/data/repo';
import type { ChecklistItem } from '@/export/checklist';
import type { MirrorMeta } from '@/mirror/copy';
import { ChecklistList, DeployDialog, fetchDeployment } from '@/components/deploy-dialog';
import { MiniSpin } from '@/components/orbit';
import { compactWhen, displayUrl, shortDate, timeAgo } from '@/lib/format';
import { PRESETS } from '@/lib/presets';
import {
  PROJECT_STATUSES,
  STATUS_LABELS,
  type Client,
  type PitchExpiryDays,
  type Project,
  type ProjectPatch,
  type ProjectStatus,
} from '@/lib/types';
import type { OrderRecord } from '@/lib/data/repo';
import { OrdersCard } from './orders-card';
import { BookingsCard } from './bookings-card';
import { AdminCard } from './admin-card';
import type { SiteAdmin } from '@/lib/data/repo';
import type { BookingRecord } from '@/lib/data/repo';
import { createStarterSiteAction, deleteProjectAction, updateClientAction, updateProjectAction } from '../actions';

const card = 'flex flex-col rounded-dialog border border-border bg-surface p-[22px]';

const SETUP_LABEL: Record<JobStatus, string> = {
  draft: 'Continue setup',
  running: 'See progress',
  plan_review: 'Review the plan',
  failed: 'Resume generation',
  done: 'Open',
};

export function ProjectDetails({
  project,
  link,
  now,
  setup,
  events,
  website,
  copy,
  orders,
  bookings,
  admins,
  adminUrl,
}: {
  project: Project;
  link: string;
  now: number;
  /** Recent pitch-link opens, newest first. */
  events: PitchEvent[];
  /** Export and deploy state; null until the project has a valid site. */
  website: WebsiteInfo | null;
  /** Set when the project is an exact copy of the client's own site. */
  copy: MirrorMeta | null;
  /** The shop's orders, or null for a site without a shop. */
  orders: OrderRecord[] | null;
  /** Bookings from a week ago on, or null for a site without bookings. */
  bookings: { list: BookingRecord[]; timezone: string } | null;
  /** Client logins for the admin panel; null before the project has a site. */
  admins: SiteAdmin[] | null;
  adminUrl: string;
  /** An unfinished generation for this project, if there is one. */
  setup: { jobId: string; status: JobStatus } | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [p, setP] = useState(project);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, startDelete] = useTransition();
  const [creating, startCreate] = useTransition();

  useEffect(() => setP(project), [project]);

  /** Optimistic update; rolls back and says so if the save fails. */
  const patch = (change: ProjectPatch) => {
    const before = p;
    setP({ ...p, ...change });
    updateProjectAction(p.id, change).catch(() => {
      setP(before);
      toast('Couldn’t save that change');
    });
  };

  const remove = () =>
    startDelete(async () => {
      await deleteProjectAction(p.id);
      toast(`${p.name} deleted`);
      router.push('/');
    });

  return (
    <>
      <Link href="/" className="flex min-h-8 items-center gap-1.5 self-start text-[14px] text-muted hover:text-text">
        <ChevronLeft size={16} strokeWidth={2} />
        All projects
      </Link>

      <div className="flex flex-wrap items-center gap-6">
        <SiteThumb preset={p.preset} name={p.name} headline={p.headline} size="detail" />
        <div className="flex min-w-[240px] flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[28px] font-semibold tracking-[-0.02em]">{p.name}</span>
            <StatusMenu status={p.status} onChange={(status) => patch({ status })} />
          </div>
          <span className="text-[15px] text-muted">
            {p.businessType} · {PRESETS[p.preset].name} · created {shortDate(p.createdAt)}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setConfirmDelete(true)} className={`${btn.dangerGhost} h-11 px-4 text-[14px]`}>
            Delete
          </button>
{copy && p.currentVersion === null ? (
            <a href={`/copy/${p.id}/index.html`} target="_blank" rel="noreferrer" className={`${btn.primary} h-11 px-5 text-[15px]`}>
              Open the copy
              <ExternalLink size={16} strokeWidth={2} />
            </a>
          ) : p.currentVersion !== null ? (
            <>
              <Link href={`/preview/${p.id}`} className={`${btn.secondary} h-11 px-4 text-[14px]`}>
                Preview
              </Link>
              <Link href={`/workspace/${p.id}`} className={`${btn.primary} h-11 px-5 text-[15px]`}>
                Open workspace
                <ArrowRight size={16} strokeWidth={2} />
              </Link>
            </>
          ) : setup ? (
            <Link href={`/new/${setup.jobId}`} className={`${btn.primary} h-11 px-5 text-[15px]`}>
              {SETUP_LABEL[setup.status]}
              <ArrowRight size={16} strokeWidth={2} />
            </Link>
          ) : (
            <button
              type="button"
              disabled={creating}
              onClick={() => startCreate(() => createStarterSiteAction(p.id))}
              title="Builds version 1 from this project's details, without AI"
              className={`${btn.primary} h-11 px-5 text-[15px]`}
            >
              {creating ? 'Creating…' : 'Create starter site'}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,340px),1fr))] items-start gap-5">
        <div className="flex flex-col gap-5">
          <PitchCard p={p} link={link} onPatch={patch} events={events} now={now} />
          <ClientCard id={p.id} client={p.client} />
        </div>
        <div className="flex flex-col gap-5">
          {copy && <CopyCard p={p} copy={copy} now={now} />}
          {website && <WebsiteCard p={p} info={website} now={now} onLive={() => router.refresh()} />}
          {bookings && <BookingsCard projectId={p.id} bookings={bookings.list} timezone={bookings.timezone} now={now} />}
          {orders && <OrdersCard projectId={p.id} orders={orders} now={now} />}
          {admins && <AdminCard projectId={p.id} admins={admins} adminUrl={adminUrl} now={now} businessName={p.name} />}
          <ActivityCard p={p} now={now} events={events} />
        </div>
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title={`Delete ${p.name}?`}
          body="The site, its versions and the pitch link will be removed. This can't be undone."
          confirmLabel={deleting ? 'Deleting…' : 'Delete site'}
          pending={deleting}
          onConfirm={remove}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </>
  );
}

function StatusMenu({ status, onChange }: { status: ProjectStatus; onChange: (s: ProjectStatus) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Status: ${STATUS_LABELS[status]}. Change status`}
        onClick={() => setOpen(!open)}
        className={`flex cursor-pointer items-center gap-1 rounded-full py-1 pr-2 pl-[11px] text-[12px] font-medium ${STATUS_STYLE[status].pill}`}
      >
        {STATUS_LABELS[status]}
        <ChevronDown size={14} strokeWidth={2} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute top-[calc(100%+6px)] left-0 z-30 flex min-w-[200px] animate-fade-up flex-col rounded-xl border border-border bg-raised p-1.5 shadow-raised"
        >
          {PROJECT_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              role="menuitemradio"
              aria-checked={s === status}
              onClick={() => {
                setOpen(false);
                if (s !== status) onChange(s);
              }}
              className="flex h-10 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 text-left text-[14px] hover:bg-hover"
            >
              <span className={`size-2 rounded-full ${STATUS_STYLE[s].dot}`} />
              <span className="flex-1">{STATUS_LABELS[s]}</span>
              {s === status && <Check size={16} strokeWidth={2} className="text-accent-text" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SettingRow({
  title,
  note,
  on,
  onChange,
}: {
  title: string;
  note: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex min-h-[52px] cursor-pointer items-center gap-3 border-b border-border py-1.5">
      <span className="flex flex-1 flex-col gap-0.5">
        <span className="text-[14px] font-medium">{title}</span>
        <span className="text-[13px] text-muted">{note}</span>
      </span>
      <Switch on={on} onChange={onChange} label={title} />
    </label>
  );
}

const EXPIRY: { value: PitchExpiryDays; label: string }[] = [
  { value: 7, label: '7 days' },
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
  { value: null, label: 'Never' },
];

function PitchCard({ p, link, onPatch, events, now }: { p: Project; link: string; onPatch: (c: ProjectPatch) => void; events: PitchEvent[]; now: number }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      toast('Couldn’t copy. Select the link and copy it by hand.');
      return;
    }
    clearTimeout(timer.current);
    setCopied(true);
    timer.current = setTimeout(() => setCopied(false), 1000);
    // Sending the link is the usual next step, so offer to record it.
    if (p.status === 'draft') toast('Pitch link copied', { label: 'Mark as sent', onClick: () => onPatch({ status: 'pitch_sent' }) });
    else toast('Pitch link copied');
  };

  const expiresAt = pitchExpiresAt(p);
  const expired = !!expiresAt && new Date(expiresAt).getTime() <= now;
  const opens = events.filter((e) => !e.isBot);
  const state =
    p.currentVersion === null
      ? { tone: 'text-muted', text: 'The link starts working once version 1 of the site exists.' }
      : p.pitchPaused
        ? { tone: 'text-warn', text: 'Paused: visitors see a “This concept is paused” page.' }
        : expired
          ? { tone: 'text-danger', text: `Expired on ${shortDate(expiresAt!)}. Choose a longer time or Never to reopen it.` }
          : { tone: 'text-success', text: expiresAt ? `Live until ${shortDate(expiresAt)}` : 'Live, no expiry' };

  return (
    <section className={`${card} gap-4`}>
      <h2 className="m-0 text-[16px] font-semibold">Pitch link</h2>
      <div className="flex items-center gap-2">
        <div
          className={`flex h-11 min-w-0 flex-1 items-center rounded-xl border border-border bg-bg px-3.5 font-mono text-[13px] ${
            p.pitchPaused ? 'opacity-45' : ''
          }`}
        >
          <span className="truncate select-all">{displayUrl(link)}</span>
        </div>
        <button
          type="button"
          onClick={copy}
          className={`${btn.secondary} h-11 px-4 text-[14px] ${copied ? 'text-success' : ''}`}
        >
          {copied ? <Check size={16} strokeWidth={2} /> : <Copy size={16} strokeWidth={2} />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
        <a href={link} target="_blank" rel="noreferrer" title="Open the pitch page (your own visits aren’t counted)" aria-label="Open the pitch page" className={`${btn.secondary} size-11`}>
          <ExternalLink size={16} strokeWidth={2} />
        </a>
      </div>
      <div className="-mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[13px]">
        <span className={state.tone}>{state.text}</span>
        {p.currentVersion !== null && (
          <span className="text-muted">
            {opens.length ? `${opens.length}${events.length >= 50 ? '+' : ''} open${opens.length === 1 ? '' : 's'} · last ${timeAgo(opens[0].openedAt, now)}` : 'Not opened yet'}
          </span>
        )}
      </div>
      <div className="flex flex-col border-t border-border">
        <SettingRow
          title="Pause link"
          note={p.pitchPaused ? 'Visitors see a “This concept is paused” page' : 'Anyone with the link can view the site'}
          on={p.pitchPaused}
          onChange={(v) => onPatch({ pitchPaused: v })}
        />
        <SettingRow
          title="Show Sono banner"
          note="Concept by Sono Technologies, with WhatsApp and Instagram"
          on={p.pitchBanner}
          onChange={(v) => onPatch({ pitchBanner: v })}
        />
        <div className="flex min-h-[52px] flex-wrap items-center gap-3 py-1.5">
          <span className="flex-1 text-[14px] font-medium">Link expires</span>
          <Segmented
            label="Link expires"
            options={EXPIRY}
            value={p.pitchExpiryDays}
            onChange={(v) => onPatch({ pitchExpiryDays: v })}
          />
        </div>
      </div>
    </section>
  );
}

const CLIENT_FIELDS: { key: Exclude<keyof Client, 'notes'>; label: string; type?: string }[] = [
  { key: 'ownerName', label: 'Owner' },
  { key: 'whatsapp', label: 'WhatsApp', type: 'tel' },
  { key: 'instagram', label: 'Instagram' },
  { key: 'address', label: 'Address' },
];

function ClientCard({ id, client }: { id: string; client: Client }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(client);
  const [saved, setSaved] = useState(client);
  const [saving, startSave] = useTransition();
  const savedRef = useRef(client);

  // A server refresh (after any save on this page) only replaces fields the user isn't editing.
  useEffect(() => {
    const prev = savedRef.current;
    savedRef.current = client;
    setSaved(client);
    setDraft((d) => {
      const next = { ...d };
      for (const k of Object.keys(client) as (keyof Client)[]) if (d[k] === prev[k]) next[k] = client[k];
      return next;
    });
  }, [client]);

  const save = (change: Partial<Client>, after?: () => void) =>
    startSave(async () => {
      try {
        await updateClientAction(id, change);
        savedRef.current = { ...savedRef.current, ...change };
        setSaved(savedRef.current);
        after?.();
      } catch {
        toast('Couldn’t save the client details');
      }
    });

  const saveNotes = () => {
    if (draft.notes !== saved.notes) save({ notes: draft.notes });
  };

  return (
    <section className={`${card} gap-3.5`}>
      <div className="flex items-center justify-between">
        <h2 className="m-0 text-[16px] font-semibold">Client</h2>
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="cursor-pointer text-[14px] font-medium text-accent-text hover:underline"
          >
            Edit
          </button>
        )}
      </div>
      {editing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const { notes: _notes, ...fields } = draft;
            save(fields, () => setEditing(false));
          }}
          className="flex flex-col gap-3"
        >
          {CLIENT_FIELDS.map((f) => (
            <label key={f.key} className="flex flex-col gap-1.5 text-[14px] font-medium">
              {f.label}
              <input
                type={f.type ?? 'text'}
                value={draft[f.key]}
                onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                className={`${inputClass} h-11 bg-bg text-[14px]`}
              />
            </label>
          ))}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                setDraft({ ...saved, notes: draft.notes });
                setEditing(false);
              }}
              className={`${btn.ghost} h-10 px-4 text-[14px]`}
            >
              Cancel
            </button>
            <button type="submit" disabled={saving} className={`${btn.secondary} h-10 px-4 text-[14px]`}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      ) : (
        <dl className="m-0 grid grid-cols-[110px_minmax(0,1fr)] gap-x-4 gap-y-3 text-[14px]">
          {CLIENT_FIELDS.map((f) => (
            <div key={f.key} className="contents">
              <dt className="text-muted">{f.label}</dt>
              <dd className="m-0 [overflow-wrap:anywhere]">{saved[f.key] || <span className="text-muted">—</span>}</dd>
            </div>
          ))}
        </dl>
      )}
      <label className="flex flex-col gap-1.5 pt-1 text-[14px] font-medium">
        <span className="flex items-center justify-between">
          Notes
          <span className="text-[12px] font-normal text-muted" aria-live="polite">
            {saving ? 'Saving…' : draft.notes !== saved.notes ? 'Unsaved' : ''}
          </span>
        </span>
        <textarea
          rows={4}
          value={draft.notes}
          onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
          onBlur={saveNotes}
          maxLength={4000}
          className={`${inputClass} resize-y bg-bg py-3 text-[14px] leading-normal`}
        />
      </label>
    </section>
  );
}

interface Activity {
  key: string;
  title: string;
  meta: string;
  at: string;
  url?: string;
  icon: React.ReactNode;
  tone: string;
}

/** An exact copy of the client's own site: what's in it, and copying it again. */
function CopyCard({ p, copy, now }: { p: Project; copy: MirrorMeta; now: number }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const recopy = async () => {
    setBusy(true);
    const res = await fetch('/api/site-copy', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: copy.sourceUrl, confirmed: true, projectId: p.id }) });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!res.ok) return toast(body.error ?? 'The site couldn’t be copied again');
    toast('Copied again from the live site');
    router.refresh();
  };
  const mb = (copy.bytes / 1024 / 1024).toFixed(1);
  return (
    <section className={`${card} gap-4`}>
      <h2 className="m-0 text-[16px] font-semibold">Exact copy</h2>
      <div className="flex flex-col gap-1 text-[14px]">
        <span>
          Of{' '}
          <a href={copy.sourceUrl} target="_blank" rel="noreferrer" className="font-mono text-[13px] text-accent-text hover:underline">
            {displayUrl(copy.sourceUrl)}
          </a>
        </span>
        <span className="text-[13px] text-muted">
          {copy.pages.length} page{copy.pages.length === 1 ? '' : 's'} · {copy.files} files · {mb} MB · copied {compactWhen(copy.copiedAt, now)}
        </span>
      </div>
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-[14px] font-medium">
          <ChevronDown size={15} className="-rotate-90 text-muted transition-transform group-open:rotate-0" />
          Pages
        </summary>
        <ul className="m-0 mt-2 flex list-none flex-col gap-1 p-0 text-[13px]">
          {copy.pages.map((pg) => (
            <li key={pg.path} className="flex gap-2">
              <a href={`/copy/${p.id}/${pg.path}`} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-accent-text hover:underline">
                {pg.title || pg.path}
              </a>
              <span className="font-mono text-[12px] text-muted">{pg.path}</span>
            </li>
          ))}
        </ul>
      </details>
      <div className="flex flex-wrap gap-2">
        <a href={`/copy/${p.id}/index.html`} target="_blank" rel="noreferrer" className={`${btn.secondary} h-10 px-4 text-[14px]`}>
          Open the copy
        </a>
        <button type="button" disabled={busy} onClick={recopy} className={`${btn.secondary} h-10 px-4 text-[14px]`}>
          {busy ? <MiniSpin /> : null}
          {busy ? 'Copying… (up to 3 minutes)' : 'Copy again'}
        </button>
      </div>
      <p className="m-0 text-[12px] text-muted">The copy is the client’s site as visitors see it. It can’t be edited in the workspace; forms and anything their old host ran on its server don’t come across.</p>
    </section>
  );
}

export interface WebsiteInfo {
  version: number;
  checklist: ChecklistItem[];
  hasVercel: boolean;
  hasGithub: boolean;
  latest: Deployment | null;
  /** Card payments the shop takes. */
  payments?: ('paystack' | 'stripe')[];
}

/** Export, deploy and the handover checklist. */
function WebsiteCard({ p, info, now, onLive }: { p: Project; info: WebsiteInfo; now: number; onLive: () => void }) {
  const [open, setOpen] = useState(false);
  const [d, setD] = useState(info.latest);
  useEffect(() => setD(info.latest), [info.latest]);
  // Keep checking while a build runs, even with the dialog closed.
  const building = d?.status === 'building' && !open;
  useEffect(() => {
    if (!building) return;
    const t = setInterval(async () => {
      const next = await fetchDeployment(p.id).catch(() => null);
      if (next && next.status !== 'building') {
        setD(next);
        if (next.status === 'ready') onLive();
      }
    }, 5000);
    return () => clearInterval(t);
  }, [building, p.id, onLive]);
  const todo = info.checklist.filter((c) => !c.done).length;
  const live = d?.status === 'ready' ? d : null;
  const outdated = live && live.version < info.version;

  return (
    <section className={`${card} gap-4`}>
      <h2 className="m-0 text-[16px] font-semibold">Website</h2>
      <div className="flex flex-col gap-1.5 text-[14px]">
        {!d && <span className="text-muted">Not deployed yet. Export the code or deploy it to Vercel.</span>}
        {d?.status === 'building' && (
          <span className="flex items-center gap-2">
            <MiniSpin /> Deploying version {d.version}…
          </span>
        )}
        {d?.status === 'error' && <span className="text-danger">The last deploy failed: {d.error}</span>}
        {d?.status !== 'error' && d?.error && <span className="text-[13px] text-warn">{d.error}</span>}
        {(live ?? (p.liveUrl ? { url: p.liveUrl } : null))?.url && (
          <a href={(live?.url ?? p.liveUrl)!} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 self-start font-mono text-[13px] font-medium text-accent-text hover:underline">
            {(live?.url ?? p.liveUrl)!.replace(/^https:\/\//, '')}
            <ExternalLink size={13} />
          </a>
        )}
        {live && (
          <span className="text-[13px] text-muted">
            Version {live.version} deployed {compactWhen(live.updatedAt, now)}
            {outdated ? ` · version ${info.version} has changes not deployed yet` : ''}
          </span>
        )}
        {(d?.repoUrl ?? p.repoUrl) && (
          <a href={(d?.repoUrl ?? p.repoUrl)!} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 self-start text-[13px] text-muted hover:text-text hover:underline">
            Code on GitHub{d?.repoFullName ? `: ${d.repoFullName}` : ''}
            <ExternalLink size={12} />
          </a>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <a href={`/api/projects/${p.id}/export`} className={`${btn.secondary} h-10 px-4 text-[14px]`}>
          Export zip
        </a>
        <button type="button" onClick={() => setOpen(true)} className={`${btn.primary} h-10 px-4 text-[14px]`}>
          {d?.status === 'building' ? 'See progress' : live ? 'Redeploy' : 'Deploy'}
        </button>
      </div>
      <details className="group border-t border-border pt-3">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-[14px] font-medium">
          <ChevronDown size={15} className="-rotate-90 text-muted transition-transform group-open:rotate-0" />
          Handover checklist
          <span className="text-[13px] font-normal text-muted">{todo ? `${todo} to do` : 'all done'}</span>
        </summary>
        <div className="pt-3">
          <ChecklistList items={info.checklist} />
        </div>
      </details>
      {open && (
        <DeployDialog
          projectId={p.id}
          projectName={p.name}
          version={info.version}
          checklist={info.checklist}
          hasVercel={info.hasVercel}
          hasGithub={info.hasGithub}
          payments={info.payments}
          initial={d}
          onDone={(next) => {
            setD(next);
            onLive();
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </section>
  );
}

const DEVICE = {
  mobile: { label: 'Phone', Icon: Smartphone },
  tablet: { label: 'Tablet', Icon: Tablet },
  desktop: { label: 'Computer', Icon: Monitor },
} as const;

/** Pitch opens (link previews left out), status milestones and creation. Deployments join in phase 6. */
function ActivityCard({ p, now, events }: { p: Project; now: number; events: PitchEvent[] }) {
  const items: Activity[] = [];
  const opens = events.filter((e) => !e.isBot).slice(0, 15);
  for (const e of opens) {
    const { label, Icon } = DEVICE[e.device];
    items.push({ key: e.id, title: 'Pitch opened', meta: `${label}${e.path !== '/' ? ` · ${e.path}` : ''}`, at: e.openedAt, icon: <Icon size={16} strokeWidth={2} />, tone: 'bg-warn-bg text-warn' });
  }
  // Opens from before tracking existed only left a timestamp.
  if (!opens.length && p.lastOpenedAt)
    items.push({ key: 'open', title: 'Pitch opened', meta: 'Most recent open', at: p.lastOpenedAt, icon: <Eye size={16} strokeWidth={2} />, tone: 'bg-warn-bg text-warn' });
  const previews = events.filter((e) => e.isBot).length;
  if (p.liveAt)
    items.push({ key: 'live', title: 'Went live', meta: 'Production', at: p.liveAt, url: p.liveUrl ?? undefined, icon: <Rocket size={16} strokeWidth={2} />, tone: 'bg-success-bg text-success' });
  if (p.pitchSentAt)
    items.push({ key: 'sent', title: 'Pitch sent', meta: p.client.ownerName ? `To ${p.client.ownerName}` : 'Marked as sent', at: p.pitchSentAt, icon: <Send size={16} strokeWidth={2} />, tone: 'bg-sel text-text' });
  items.push({ key: 'created', title: 'Project created', meta: `${PRESETS[p.preset].name} preset`, at: p.createdAt, icon: <Plus size={16} strokeWidth={2} />, tone: 'bg-sel text-text' });
  items.sort((a, b) => b.at.localeCompare(a.at));

  return (
    <section className={`${card} gap-1.5`}>
      <div className="flex items-baseline gap-2 pb-2">
        <h2 className="m-0 flex-1 text-[16px] font-semibold">Activity</h2>
        {previews > 0 && (
          <span className="text-[12px] text-muted" title="WhatsApp, Instagram and other apps fetch the page to show a preview. These aren’t counted as opens.">
            {previews} link preview{previews === 1 ? '' : 's'} not counted
          </span>
        )}
      </div>
      <ul className="m-0 list-none p-0">
        {items.map((a) => (
          <li key={a.key} className="flex gap-3.5 border-t border-border py-3">
            <span className={`flex size-8 flex-none items-center justify-center rounded-full ${a.tone}`}>{a.icon}</span>
            <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
              <span className="text-[14px] font-medium">{a.title}</span>
              <span className="text-[13px] text-muted">{a.meta}</span>
              {a.url && (
                <a href={a.url} target="_blank" rel="noreferrer" className="truncate font-mono text-[12px] text-accent-text hover:underline">
                  {displayUrl(a.url)}
                </a>
              )}
            </div>
            <span className="text-[12px] whitespace-nowrap text-muted">{compactWhen(a.at, now)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
