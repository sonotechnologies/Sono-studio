'use client';

import { ArrowUp, Check, Copy, ExternalLink, ThumbsDown, ThumbsUp, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState, useTransition } from 'react';
import { Logo } from '@/components/logo';
import type { Message, Mode, Thread } from '@/sono-ai/assist/types';
import { confirmRuleAction, deleteMessageAction, feedbackAction, type AskResult } from './assist-actions';

const MODES: { id: Mode | 'auto'; label: string; hint: string }[] = [
  { id: 'auto', label: 'Auto', hint: 'Sono AI picks for each message' },
  { id: 'studio', label: 'My studio', hint: 'Answers from your projects, pitches and the knowledge bank' },
  { id: 'search', label: 'Web', hint: 'Live web search with links' },
  { id: 'casual', label: 'Chat', hint: 'Everyday conversation' },
];
const MODE_NOTE: Record<string, string> = { studio: 'From your studio', search: 'From the web', casual: '', rule: 'Rule', draft: '', build: '' };

const SUGGESTIONS = [
  'Which pitches need a follow-up?',
  'Draft follow-ups',
  'Which kind of business should I pitch next?',
  'Which model writes the best copy?',
  'Always quote in dollars for UK clients',
  'Build a pitch site for a bakery called Crumbs in Yaba',
];

/** Sono AI's chat: the full page under the sidebar, and the workspace tab (with the project as context). */
export function SonoAiChat({
  initial,
  threadId = null,
  onThread,
  projectId = null,
  compact = false,
  header,
}: {
  initial: Message[];
  /** The chat these messages are in; null for a new chat, made with its first message. */
  threadId?: string | null;
  /** The chat was made (first message) or moved up the list (any message). */
  onThread?: (t: Thread) => void;
  projectId?: string | null;
  compact?: boolean;
  header?: React.ReactNode;
}) {
  const [messages, setMessages] = useState(initial);
  const thread = useRef(threadId);
  const [actions, setActions] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [mode, setMode] = useState<Mode | 'auto'>('auto');
  const [pending, start] = useTransition();
  const [rules, setRules] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<Record<string, string>>({});
  const [rated, setRated] = useState<Record<string, 1 | -1>>({});
  const list = useRef<HTMLDivElement>(null);
  // Braces matter: newer Chrome returns a promise from scrollTo, and React would treat a returned value as a cleanup function.
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [messages.length, pending]);

  const send = (text = draft) => {
    const t = text.trim();
    if (!t || pending) return;
    setDraft('');
    const temp: Message = { id: `temp-${Date.now()}`, projectId, channel: 'studio', role: 'user', text: t, mode: null, sources: [], createdAt: new Date().toISOString() };
    setMessages((m) => [...m, temp]);
    start(async () => {
      try {
        const res = await fetch('/api/assistant/ask', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: t, mode, projectId, threadId: thread.current }) });
        if (res.status === 401) {
          window.location.href = '/login';
          return;
        }
        if (!res.ok && res.status !== 400) throw new Error(`HTTP ${res.status}`);
        const r = (await res.json()) as AskResult;
        if (r.thread) {
          thread.current = r.thread.id;
          onThread?.({ ...r.thread, updatedAt: new Date().toISOString() });
        }
        setMessages((m) => [...m.filter((x) => x.id !== temp.id), ...(r.messages ?? [{ ...temp, id: `err-${Date.now()}`, role: 'assistant', text: r.error ?? 'Something went wrong.' }])]);
        if (r.ruleId && r.messages) setRules((x) => ({ ...x, [r.messages!.at(-1)!.id]: r.ruleId! }));
      } catch {
        // The reply took too long or the connection dropped. The answer is usually saved anyway: fetch it.
        await catchUp(temp);
      }
    });
  };

  const catchUp = async (temp: Message) => {
    for (const wait of [0, 4000, 8000]) {
      await new Promise((r) => setTimeout(r, wait));
      const got = await fetch(`/api/assistant/ask${thread.current ? `?t=${thread.current}` : ''}`)
        .then((r) => (r.ok ? (r.json() as Promise<{ thread: Thread | null; messages: Message[] }>) : null))
        .catch(() => null);
      const latest = got?.messages ?? null;
      if (latest && latest.at(-1)?.role === 'assistant' && latest.some((m) => m.role === 'user' && m.text === temp.text)) {
        // A new chat was made on the server even though its reply didn't arrive.
        if (!thread.current && got?.thread) {
          thread.current = got.thread.id;
          onThread?.(got.thread);
        }
        setMessages(latest);
        return;
      }
    }
    setMessages((m) => [
      ...m.filter((x) => x.id !== temp.id),
      temp,
      { ...temp, id: `err-${Date.now()}`, role: 'assistant', text: 'That took too long to come back. Try again in a moment.' },
    ]);
  };

  /** Deleting takes two taps: the bin, then "Delete". Messages not saved yet (temp-, err-) just go. */
  const remove = async (id: string) => {
    if (confirming !== id) return setConfirming(id);
    setConfirming(null);
    setActions(null);
    const before = messages;
    setMessages((m) => m.filter((x) => x.id !== id));
    if (/^(temp|err)-/.test(id)) return;
    const r = await deleteMessageAction(id).catch(() => ({ error: 'x' }));
    if (r.error) setMessages(before);
  };

  const copy = async (m: Message) => {
    await navigator.clipboard?.writeText(m.text).catch(() => {});
    setCopied(m.id);
    setTimeout(() => setCopied((c) => (c === m.id ? null : c)), 1500);
  };

  const binButton = (m: Message) => (
    <button
      type="button"
      onClick={() => void remove(m.id)}
      aria-label={confirming === m.id ? 'Confirm delete' : 'Delete message'}
      className={`inline-flex cursor-pointer items-center gap-1 rounded p-1 hover:bg-hover ${confirming === m.id ? 'px-2 font-semibold text-danger' : ''}`}
    >
      <Trash2 size={13} />
      {confirming === m.id ? 'Delete' : null}
    </button>
  );

  const rate = (id: string, rating: 1 | -1) => {
    setRated((r) => ({ ...r, [id]: rating }));
    feedbackAction('reply', id, rating).catch(() => {});
  };

  return (
    <div className={`flex min-h-0 flex-1 flex-col ${compact ? '' : 'rounded-card border border-border bg-surface'}`}>
      {header}
      <div ref={list} className="flex flex-1 flex-col gap-[18px] overflow-auto p-5" aria-live="polite">
        {messages.length === 0 && (
          <div className="flex flex-col gap-2 text-[14px] leading-normal text-muted">
            <p className="m-0">Ask about your work, look something up, or just chat. For example:</p>
            <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
              {SUGGESTIONS.map((t) => (
                <li key={t}>
                  <button type="button" onClick={() => send(t)} className="cursor-pointer rounded-full border border-border px-3 py-1 text-left text-[13px] text-text hover:bg-hover">
                    {t}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {messages.map((m) =>
          m.role === 'user' ? (
            <div key={m.id} className="flex max-w-[85%] flex-col items-end gap-1 self-end">
              <button
                type="button"
                onClick={() => {
                  setActions((a) => (a === m.id ? null : m.id));
                  setConfirming(null);
                }}
                aria-expanded={actions === m.id}
                className="cursor-pointer rounded-[14px_14px_4px_14px] border border-border bg-raised px-3.5 py-2.5 text-left text-[14px] leading-[1.45] whitespace-pre-wrap text-text"
              >
                {m.text}
              </button>
              {actions === m.id && (
                <div className="flex items-center gap-1 text-[12px] text-muted">
                  <button type="button" onClick={() => void copy(m)} aria-label="Copy message" className="cursor-pointer rounded p-1 hover:bg-hover">
                    {copied === m.id ? <Check size={13} /> : <Copy size={13} />}
                  </button>
                  {binButton(m)}
                </div>
              )}
            </div>
          ) : (
            <div key={m.id} className="flex gap-2.5">
              <Logo kind="mark" alt="Sono AI" className="mt-[3px] h-3.5 w-auto flex-none" />
              <div className="flex min-w-0 flex-col gap-2 text-[14px] leading-normal">
                <div className="whitespace-pre-wrap">{m.text}</div>
                {m.sources.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {m.sources.map((s, i) => {
                      const external = /^https?:\/\//.test(s.href) && !s.href.includes(typeof window === 'undefined' ? '' : window.location.host);
                      return external ? (
                        <a key={i} href={s.href} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-1 truncate rounded-full border border-border px-2.5 py-[3px] text-[12px] text-muted hover:bg-hover hover:text-text">
                          {s.label} <ExternalLink size={11} aria-hidden />
                        </a>
                      ) : (
                        <Link key={i} href={s.href.replace(/^https?:\/\/[^/]+/, '') || '/'} className="max-w-full truncate rounded-full border border-border px-2.5 py-[3px] text-[12px] text-muted hover:bg-hover hover:text-text">
                          {s.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted">
                  {m.mode && MODE_NOTE[m.mode] ? <span>{MODE_NOTE[m.mode]}</span> : null}
                  {rules[m.id] && !saved[m.id] && (
                    <button
                      type="button"
                      onClick={async () => {
                        const r = await confirmRuleAction(rules[m.id]).catch(() => ({ ok: undefined, error: 'Couldn’t save it. Try again.' }));
                        setSaved((x) => ({ ...x, [m.id]: r.ok ?? r.error ?? '' }));
                      }}
                      className="cursor-pointer rounded-full bg-text px-3 py-1 text-[12px] font-semibold text-bg"
                    >
                      Save rule
                    </button>
                  )}
                  {saved[m.id] && (
                    <span>
                      {saved[m.id]}{' '}
                      <Link href="/sono-ai/rules" className="text-accent-text hover:underline">
                        Rulebook
                      </Link>
                    </span>
                  )}
                  <span className="flex gap-1">
                    <button type="button" onClick={() => void copy(m)} aria-label="Copy message" className="cursor-pointer rounded p-1 hover:bg-hover">
                      {copied === m.id ? <Check size={13} /> : <Copy size={13} />}
                    </button>
                    {binButton(m)}
                  </span>
                  {(m.mode === 'casual' || m.mode === 'studio' || m.mode === 'search') && (
                    <span className="flex gap-1">
                      <button type="button" aria-label="Good answer" aria-pressed={rated[m.id] === 1} onClick={() => rate(m.id, 1)} className={`cursor-pointer rounded p-1 hover:bg-hover ${rated[m.id] === 1 ? 'text-text' : ''}`}>
                        <ThumbsUp size={13} />
                      </button>
                      <button type="button" aria-label="Bad answer" aria-pressed={rated[m.id] === -1} onClick={() => rate(m.id, -1)} className={`cursor-pointer rounded p-1 hover:bg-hover ${rated[m.id] === -1 ? 'text-text' : ''}`}>
                        <ThumbsDown size={13} />
                      </button>
                    </span>
                  )}
                </div>
              </div>
            </div>
          ),
        )}
        {pending && (
          <div className="flex items-center gap-2.5 text-[13px] text-muted">
            <span className="w-[15px] flex-none">
              <span className="sono-orbit block">
                <Logo kind="mark" alt="" className="h-auto w-full" />
              </span>
            </span>
            <span>{mode === 'search' ? 'Searching the web…' : 'Thinking…'}</span>
          </div>
        )}
      </div>
      <div className="flex flex-none flex-col gap-2.5 border-t border-border px-4 pt-3 pb-4">
        <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Answer from">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={mode === m.id}
              title={m.hint}
              onClick={() => setMode(m.id)}
              className={`cursor-pointer rounded-full px-2.5 py-1 text-[12px] font-medium ${mode === m.id ? 'bg-sel text-text' : 'text-muted hover:bg-hover'}`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="flex items-end gap-2 rounded-[14px] border border-border bg-bg py-1.5 pr-1.5 pl-3.5 focus-within:border-terracotta"
        >
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
            rows={2}
            maxLength={2000}
            placeholder="Ask Sono AI…"
            aria-label="Ask Sono AI"
            className="flex-1 resize-none border-none bg-transparent py-1.5 text-[14px] leading-[1.45] text-text outline-none placeholder:text-muted"
          />
          <button type="submit" title="Send" aria-label="Send" disabled={!draft.trim() || pending} className="flex size-[34px] flex-none cursor-pointer items-center justify-center rounded-full bg-text text-bg active:scale-[0.94] disabled:opacity-40">
            <ArrowUp size={16} />
          </button>
        </form>
      </div>
    </div>
  );
}
