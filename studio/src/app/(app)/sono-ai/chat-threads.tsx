'use client';

import { ChevronDown, MessageSquare, Pencil, Plus, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { ConfirmDialog, inputClass } from '@/components/ui';
import type { Message, Thread } from '@/sono-ai/assist/types';
import { deleteThreadAction, renameThreadAction } from './assist-actions';
import { SonoAiChat } from './sono-ai-chat';

/**
 * Chats with Sono AI: a list to switch between (beside the chat on wide
 * screens, behind a "Chats" button on phones), a new chat, renaming and
 * deleting. Each chat only remembers its own messages.
 */
export function ChatThreads({ initialThreads, initialThread, initialMessages }: { initialThreads: Thread[]; initialThread: Thread | null; initialMessages: Message[] }) {
  const [threads, setThreads] = useState(initialThreads);
  const [current, setCurrent] = useState(initialThread);
  const [messages, setMessages] = useState(initialMessages);
  // Changes only when you switch or start a chat, so a chat made by its first message keeps its state.
  const [chatKey, setChatKey] = useState(0);
  const [listOpen, setListOpen] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; title: string } | null>(null);
  const [deleting, setDeleting] = useState<Thread | null>(null);
  const [busy, setBusy] = useState(false);
  const renaming = useRef<string | null>(null);

  const setUrl = (t: Thread | null) => window.history.replaceState(null, '', t ? `/sono-ai/chat?t=${t.id}` : '/sono-ai/chat?new=1');

  const open = async (t: Thread) => {
    setListOpen(false);
    if (t.id === current?.id) return;
    setLoading(t.id);
    const r = await fetch(`/api/assistant/ask?t=${t.id}`)
      .then((x) => (x.ok ? (x.json() as Promise<{ messages: Message[] }>) : null))
      .catch(() => null);
    setLoading(null);
    if (!r) return;
    setCurrent(t);
    setMessages(r.messages);
    setChatKey((k) => k + 1);
    setUrl(t);
  };

  const fresh = () => {
    setListOpen(false);
    setCurrent(null);
    setMessages([]);
    setChatKey((k) => k + 1);
    setUrl(null);
  };

  const onThread = (t: Thread) => {
    setThreads((list) => [t, ...list.filter((x) => x.id !== t.id)]);
    if (!current) {
      setCurrent(t);
      setUrl(t);
    }
  };

  const rename = async () => {
    if (!editing) return;
    const { id, title } = editing;
    // Enter, then the field's blur as it closes: rename once.
    if (renaming.current === id) return;
    renaming.current = id;
    setEditing(null);
    queueMicrotask(() => (renaming.current = null));
    if (!title.trim() || title.trim() === threads.find((t) => t.id === id)?.title) return;
    const r = await renameThreadAction(id, title);
    if (r.thread) {
      setThreads((list) => list.map((t) => (t.id === id ? { ...t, title: r.thread!.title } : t)));
      setCurrent((c) => (c?.id === id ? { ...c, title: r.thread!.title } : c));
    }
  };

  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    await deleteThreadAction(deleting.id).catch(() => {});
    setBusy(false);
    setThreads((list) => list.filter((t) => t.id !== deleting.id));
    if (current?.id === deleting.id) fresh();
    setDeleting(null);
  };

  const list = (
    <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
      {threads.length === 0 && <li className="px-3 py-2 text-[13px] text-muted">No chats yet.</li>}
      {threads.map((t) => {
        const on = t.id === current?.id;
        return (
          <li key={t.id} className={`group flex items-center gap-1 rounded-lg ${on ? 'bg-sel' : 'hover:bg-hover'}`}>
            {editing?.id === t.id ? (
              <input
                autoFocus
                value={editing.title}
                maxLength={120}
                onChange={(e) => setEditing({ id: t.id, title: e.target.value })}
                onBlur={() => void rename()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void rename();
                  if (e.key === 'Escape') setEditing(null);
                }}
                aria-label="Chat name"
                className={`${inputClass} h-9 flex-1 text-[13px]`}
              />
            ) : (
              <button
                type="button"
                onClick={() => void open(t)}
                aria-current={on ? 'true' : undefined}
                className="min-w-0 flex-1 cursor-pointer truncate px-3 py-2 text-left text-[13px] font-medium"
              >
                {loading === t.id ? 'Opening…' : t.title}
              </button>
            )}
            {editing?.id !== t.id && (
              <span className={`flex flex-none pr-1 ${on ? '' : 'md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100'}`}>
                <button type="button" onClick={() => setEditing({ id: t.id, title: t.title })} aria-label={`Rename “${t.title}”`} className="flex size-9 cursor-pointer items-center justify-center rounded-lg text-muted hover:text-text">
                  <Pencil size={13} />
                </button>
                <button type="button" onClick={() => setDeleting(t)} aria-label={`Delete “${t.title}”`} className="flex size-9 cursor-pointer items-center justify-center rounded-lg text-muted hover:text-danger">
                  <Trash2 size={13} />
                </button>
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );

  const newButton = (
    <button type="button" onClick={fresh} className="flex h-9 flex-none cursor-pointer items-center gap-1.5 rounded-full border border-border px-3 text-[13px] font-medium hover:bg-hover">
      <Plus size={14} /> New chat
    </button>
  );

  return (
    <div className="flex min-h-0 flex-1 gap-4">
      <aside className="hidden w-[240px] flex-none flex-col gap-3 md:flex">
        {newButton}
        <div className="min-h-0 flex-1 overflow-y-auto">{list}</div>
      </aside>
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <SonoAiChat
          key={chatKey}
          initial={messages}
          threadId={current?.id ?? null}
          onThread={onThread}
          header={
            <div className="flex flex-none items-center gap-2 border-b border-border px-3 py-2 md:hidden">
              <button
                type="button"
                onClick={() => setListOpen((o) => !o)}
                aria-expanded={listOpen}
                className="flex h-9 min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-full px-2 text-left text-[14px] font-medium hover:bg-hover"
              >
                <MessageSquare size={15} className="flex-none text-muted" />
                <span className="truncate">{current?.title ?? 'New chat'}</span>
                <ChevronDown size={15} className={`flex-none text-muted transition-transform ${listOpen ? 'rotate-180' : ''}`} />
              </button>
              {newButton}
            </div>
          }
        />
        {listOpen && (
          <div className="absolute inset-x-0 top-[53px] bottom-0 z-10 overflow-y-auto rounded-b-card border-t border-border bg-surface p-2 md:hidden">
            <p className="m-0 px-3 pt-1 pb-2 text-[12px] font-semibold text-muted">Chats</p>
            {list}
          </div>
        )}
      </div>
      {deleting && (
        <ConfirmDialog
          title="Delete this chat?"
          body={`“${deleting.title}” and all its messages will be deleted. This can’t be undone.`}
          confirmLabel="Delete chat"
          pending={busy}
          onConfirm={() => void remove()}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
