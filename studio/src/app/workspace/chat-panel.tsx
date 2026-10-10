'use client';

import { ArrowUp, ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Logo } from '@/components/logo';
import type { ChatMessage } from '@/lib/data/repo';
import type { AiMode } from '../new/setup-flow';

export interface ChatView extends ChatMessage {
  canUndo: boolean;
  undone: boolean;
}

export function ChatPanel({
  messages,
  scopeLabel,
  onCycleScope,
  thinking,
  aiMode,
  draft,
  setDraft,
  onSend,
  onUndo,
  inputRef,
}: {
  messages: ChatView[];
  scopeLabel: string;
  onCycleScope: () => void;
  thinking: string | null;
  aiMode: AiMode;
  draft: string;
  setDraft: (v: string) => void;
  onSend: () => void;
  onUndo: (id: string) => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const list = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);
  useEffect(() => {
    if (atBottom) list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [messages.length, thinking, atBottom]);

  return (
    <>
      <div
        ref={list}
        onScroll={(e) => {
          const el = e.currentTarget;
          setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 40);
        }}
        className="flex flex-1 flex-col gap-[18px] overflow-auto p-5"
        aria-live="polite"
      >
        {messages.length === 0 && !thinking && (
          <div className="flex flex-col gap-2 text-[14px] leading-normal text-muted">
            <p className="m-0">Ask for changes in plain words. For example:</p>
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
              {['Make the hero headline shorter and warmer', 'Add an FAQ about booking', 'Move the gallery above the testimonials', 'Use a deeper green for buttons'].map((t) => (
                <li key={t}>
                  <button type="button" onClick={() => setDraft(t)} className="cursor-pointer rounded-full border border-border px-3 py-1 text-left text-[13px] text-text hover:bg-hover">
                    {t}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className="flex animate-fade-up flex-col">
            {m.role === 'user' ? (
              <div className="max-w-[85%] self-end rounded-[14px_14px_4px_14px] border border-border bg-raised px-3.5 py-2.5 text-[14px] leading-[1.45] whitespace-pre-wrap">{m.text}</div>
            ) : (
              <div className="flex gap-2.5">
                <Logo kind="mark" alt="Sono" className="mt-[3px] h-3.5 w-auto flex-none" />
                <div className="flex min-w-0 flex-col gap-2 text-[14px] leading-normal">
                  <div className="whitespace-pre-wrap">{m.text}</div>
                  <div className="flex flex-wrap items-center gap-2.5">
                    {m.change && <span className="rounded-full border border-border px-2.5 py-[3px] text-[12px] text-muted">{m.change}</span>}
                    {m.canUndo && !m.undone && (
                      <button type="button" onClick={() => onUndo(m.id)} className="cursor-pointer text-[13px] font-medium text-accent-text hover:underline">
                        Undo this change
                      </button>
                    )}
                    {m.undone && <span className="text-[13px] text-muted">Change undone</span>}
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
        {thinking && (
          <div className="flex items-center gap-2.5 text-[13px] text-muted">
            <span className="w-[15px] flex-none">
              <span className="sono-orbit block">
                <Logo kind="mark" alt="" className="h-auto w-full" />
              </span>
            </span>
            <span>{thinking}</span>
          </div>
        )}
      </div>
      <div className="flex flex-none flex-col gap-2.5 border-t border-border px-4 pt-3 pb-4">
        {aiMode === 'none' ? (
          <p className="m-0 text-[13px] text-muted">
            Chat needs an AI provider.{' '}
            <Link href="/settings?tab=providers" className="font-medium text-accent-text hover:underline">
              Add a key in Settings
            </Link>
          </p>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-muted">Will change</span>
              <button type="button" onClick={onCycleScope} title="Change scope" className="flex min-w-0 cursor-pointer items-center gap-1.5 rounded-full bg-sel px-2.5 py-1 text-[12px] font-medium hover:bg-hover">
                <span className="truncate">{scopeLabel}</span>
                <ChevronDown size={12} strokeWidth={3} className="flex-none" />
              </button>
              {aiMode === 'demo' && <span className="ml-auto text-[11px] text-muted">Demo AI</span>}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                onSend();
              }}
              className="flex items-end gap-2 rounded-[14px] border border-border bg-bg py-1.5 pr-1.5 pl-3.5 focus-within:border-terracotta"
            >
              <textarea
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    onSend();
                  }
                }}
                rows={2}
                maxLength={1500}
                placeholder="Ask for a change…"
                aria-label="Ask for a change"
                className="flex-1 resize-none border-none bg-transparent py-1.5 text-[14px] leading-[1.45] text-text outline-none placeholder:text-muted"
              />
              <button
                type="submit"
                title="Send"
                aria-label="Send"
                disabled={!draft.trim() || !!thinking}
                className="flex size-[34px] flex-none cursor-pointer items-center justify-center rounded-full bg-text text-bg active:scale-[0.94] disabled:opacity-40"
              >
                <ArrowUp size={16} />
              </button>
            </form>
          </>
        )}
      </div>
    </>
  );
}
