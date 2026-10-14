'use client';

import { ThumbsDown, ThumbsUp } from 'lucide-react';
import { useState, useTransition } from 'react';
import { MiniSpin } from '@/components/orbit';
import { btn } from '@/components/ui';
import type { Draft } from '@/sono-ai/assist/types';
import { decideDraftAction, draftAction, feedbackAction } from '../assist-actions';

const KIND = { follow_up: 'Follow-up', quote: 'Quote', checklist: 'Handover checklist' } as const;

/** A draft with who it's for and why, and Approve, Edit and Skip. */
export function DraftCard({ draft, project, href }: { draft: Draft; project: string | null; href: string | null }) {
  const [text, setText] = useState(draft.body);
  const [editing, setEditing] = useState(false);
  const [state, setState] = useState<'open' | 'approved' | 'skipped'>('open');
  const [note, setNote] = useState('');
  const [rating, setRating] = useState<1 | -1 | null>(null);
  const [pending, start] = useTransition();
  if (state !== 'open') return <div className="rounded-card border border-border bg-surface px-4 py-3 text-[14px] text-muted">{draft.title}: {state === 'approved' ? 'approved' : 'skipped'}. {note}</div>;

  const approve = () => {
    // Opened straight from the click (browsers block windows opened later), with the text as it stands now.
    const link = draft.channel === 'whatsapp' ? `https://wa.me/${draft.recipient.replace(/\D/g, '')}?text=${encodeURIComponent(text)}` : href;
    if (draft.channel !== 'whatsapp') void navigator.clipboard?.writeText(text).catch(() => {});
    if (link) window.open(link, '_blank', 'noopener');
    start(async () => {
      const r = await decideDraftAction(draft.id, 'approved', text);
      if (r.error) return setNote(r.error);
      setState('approved');
      setNote(draft.channel === 'whatsapp' ? 'WhatsApp opened with the message.' : draft.channel === 'instagram' ? 'Message copied; paste it in the Instagram chat.' : 'Copied.');
    });
  };

  return (
    <article className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-[16px] font-semibold">{draft.title}</span>
        <span className="text-[13px] text-muted">
          {KIND[draft.kind]}
          {draft.channel ? ` · to ${draft.recipient} on ${draft.channel === 'whatsapp' ? 'WhatsApp' : 'Instagram'}` : project ? ` · ${project}` : ''}
        </span>
      </div>
      <p className="m-0 text-[13px] text-muted">{draft.why}</p>
      {editing ? (
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={Math.min(14, Math.max(4, text.split('\n').length + 1))} className="w-full resize-y rounded-xl border border-border bg-bg p-3 text-[14px] leading-[1.5] outline-none focus:border-terracotta" />
      ) : (
        <div className="rounded-xl bg-hover p-3 text-[14px] leading-[1.5] whitespace-pre-wrap">{text}</div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={pending} onClick={approve} className={`${btn.primary} h-10 px-4 text-[14px]`}>
          {pending ? <MiniSpin /> : null}
          {draft.kind === 'checklist' ? 'Done' : draft.channel === 'whatsapp' ? 'Approve and open WhatsApp' : draft.channel === 'instagram' ? 'Approve and open Instagram' : 'Approve and copy'}
        </button>
        {draft.kind !== 'checklist' && (
          <button type="button" onClick={() => setEditing((v) => !v)} className={`${btn.secondary} h-10 px-4 text-[14px]`}>
            {editing ? 'Done editing' : 'Edit'}
          </button>
        )}
        <button type="button" disabled={pending} onClick={() => start(async () => { await decideDraftAction(draft.id, 'skipped'); setState('skipped'); })} className={`${btn.ghost} h-10 px-4 text-[14px]`}>
          Skip
        </button>
        <span className="ml-auto flex gap-1 text-muted">
          {([1, -1] as const).map((v) => (
            <button key={v} type="button" aria-label={v === 1 ? 'Good draft' : 'Bad draft'} aria-pressed={rating === v} onClick={() => { setRating(v); void feedbackAction('draft', draft.id, v); }} className={`cursor-pointer rounded p-1.5 hover:bg-hover ${rating === v ? 'text-text' : ''}`}>
              {v === 1 ? <ThumbsUp size={14} /> : <ThumbsDown size={14} />}
            </button>
          ))}
        </span>
      </div>
      {note && <span role="status" className="text-[13px] text-danger">{note}</span>}
    </article>
  );
}

/** A quote or handover checklist for one project. */
export function ProjectDraft({ projects }: { projects: { id: string; name: string }[] }) {
  const [id, setId] = useState(projects[0]?.id ?? '');
  const [note, setNote] = useState('');
  const [pending, start] = useTransition();
  const run = (kind: 'quote' | 'checklist') => start(async () => { const r = await draftAction(kind, id); setNote(r.error ?? r.ok ?? ''); });
  if (!projects.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-[14px]">
      <select value={id} onChange={(e) => setId(e.target.value)} className="h-10 rounded-lg border border-border bg-bg px-2">
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <button type="button" disabled={pending} onClick={() => run('quote')} className={`${btn.secondary} h-10 px-4 text-[14px]`}>
        Draft a quote
      </button>
      <button type="button" disabled={pending} onClick={() => run('checklist')} className={`${btn.secondary} h-10 px-4 text-[14px]`}>
        Handover checklist
      </button>
      {pending && <MiniSpin />}
      {note && <span role="status" className="text-muted">{note}</span>}
    </div>
  );
}
