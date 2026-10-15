'use client';

import { ArrowUp, RotateCcw, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Logo } from '@/components/logo';
import type { CopyEdit } from '@/mirror/edit';
import { copyAiAction } from './actions';

type Message = { id: number; role: 'user' | 'assistant'; text: string; page?: string; before?: CopyEdit[]; changed?: number; undone?: boolean };

const IDEAS = ['Change the phone number to 0809 000 0000 everywhere', 'Make the main heading shorter and punchier', 'Fix any spelling mistakes on this page', 'Point the “Book now” button to WhatsApp: 2348090000000'];

/**
 * Asking AI to change the copy. It works on the page that's open (and the
 * text selected in it, if any); "everywhere" changes reach every page with the
 * same text. Its changes join the editor's list and can be undone together.
 */
export function CopyAiPanel({
  projectId,
  page,
  pageTitle,
  selected,
  hidden,
  getEdits,
  flush,
  onEdits,
}: {
  projectId: string;
  page: string;
  pageTitle: string;
  /** Texts selected in the page, which the AI looks at first. */
  selected: number[];
  hidden: boolean;
  getEdits: () => CopyEdit[];
  /** Waits for changes being saved, so the AI starts from them. */
  flush: () => Promise<void>;
  /** The new list of changes (already saved), to show in the page. */
  onEdits: (edits: CopyEdit[], save: boolean) => void | Promise<void>;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [messages.length, busy]);

  const send = async (text = draft) => {
    const t = text.trim();
    if (!t || busy) return;
    setDraft('');
    setBusy(true);
    const id = Date.now();
    setMessages((m) => [...m, { id, role: 'user', text: t, page }]);
    try {
      await flush();
      const before = getEdits();
      const history = messages.map((m) => ({ role: m.role, text: m.text }));
      const r = await copyAiAction(projectId, { page, message: t, selected, edits: before, history });
      if (r.error || !r.edits) {
        setMessages((m) => [...m, { id: id + 1, role: 'assistant', text: r.error ?? 'Something went wrong.' }]);
      } else {
        if (r.added) await onEdits(r.edits, false);
        setMessages((m) => [...m, { id: id + 1, role: 'assistant', text: r.reply ?? 'Done.', before: r.added ? before : undefined, changed: r.added }]);
      }
    } catch {
      setMessages((m) => [...m, { id: id + 1, role: 'assistant', text: 'That didn’t go through. Check your connection and try again.' }]);
    } finally {
      setBusy(false);
    }
  };

  const undo = async (m: Message) => {
    if (!m.before) return;
    await flush();
    await onEdits(m.before, true);
    setMessages((list) => list.map((x) => (x.id === m.id ? { ...x, undone: true } : x)));
  };

  return (
    <div className={`flex min-h-0 flex-1 flex-col ${hidden ? 'hidden' : ''}`}>
      <div ref={list} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4" aria-live="polite">
        {messages.length === 0 && (
          <div className="flex flex-col gap-3 text-[14px] text-muted">
            <p className="m-0 flex items-center gap-2 font-semibold text-text">
              <Sparkles size={16} /> Ask AI to change the words
            </p>
            <p className="m-0">
              It works on <span className="font-medium text-text">{pageTitle}</span>
              {selected.length ? ', starting with the text you selected' : ''}, and can change the same text on every page. The layout stays exactly as copied.
            </p>
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
              {IDEAS.map((t) => (
                <li key={t}>
                  <button type="button" onClick={() => setDraft(t)} className="w-full cursor-pointer rounded-xl border border-border px-3 py-2 text-left text-[13px] text-text hover:bg-hover">
                    {t}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {messages.map((m) =>
          m.role === 'user' ? (
            <div key={m.id} className="max-w-[90%] self-end rounded-[14px_14px_4px_14px] border border-border bg-raised px-3 py-2 text-[14px] leading-snug whitespace-pre-wrap">
              {m.text}
            </div>
          ) : (
            <div key={m.id} className="flex gap-2">
              <Logo kind="mark" alt="AI" className="mt-[3px] h-3.5 w-auto flex-none" />
              <div className="flex min-w-0 flex-col gap-1.5 text-[14px] leading-snug">
                <div className="whitespace-pre-wrap">{m.text}</div>
                {m.before && (
                  <div className="flex items-center gap-2 text-[12px] text-muted">
                    <span>
                      {m.changed} change{m.changed === 1 ? '' : 's'}
                      {m.undone ? ', undone' : ''}
                    </span>
                    {!m.undone && (
                      <button type="button" onClick={() => void undo(m)} className="inline-flex cursor-pointer items-center gap-1 text-accent-text hover:underline">
                        <RotateCcw size={11} /> Undo
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ),
        )}
        {busy && <div className="text-[13px] text-muted">Working on {pageTitle}…</div>}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        className="m-3 flex flex-none items-end gap-2 rounded-[14px] border border-border bg-bg py-1.5 pr-1.5 pl-3 focus-within:border-terracotta"
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void send();
            }
          }}
          rows={2}
          maxLength={1500}
          placeholder={selected.length ? 'What should change in the selected text?' : 'What should change?'}
          aria-label="Ask AI"
          className="flex-1 resize-none border-none bg-transparent py-1.5 text-[14px] leading-snug text-text outline-none placeholder:text-muted"
        />
        <button type="submit" aria-label="Send" disabled={!draft.trim() || busy} className="flex size-[34px] flex-none cursor-pointer items-center justify-center rounded-full bg-text text-bg disabled:opacity-40">
          <ArrowUp size={16} />
        </button>
      </form>
    </div>
  );
}
