'use client';

import { useState, useTransition } from 'react';
import { MiniSpin } from '@/components/orbit';
import { btn } from '@/components/ui';
import { connectTelegramAction, setFollowUpDaysAction } from './notify-actions';

type Result = { ok?: string; error?: string; link?: string };

/** A button that runs a server action and shows what came of it. */
export function ActionButton({ label, busyLabel, action, primary = false }: { label: string; busyLabel?: string; action: () => Promise<Result>; primary?: boolean }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<Result | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled={pending}
        className={`${primary ? btn.primary : btn.secondary} h-10 px-4 text-[14px]`}
        onClick={() => start(async () => setResult(await action()))}
      >
        {pending ? <MiniSpin /> : null}
        {pending ? (busyLabel ?? label) : label}
      </button>
      {result && (
        <span role="status" className={`text-[14px] ${result.error ? 'text-danger' : 'text-muted'}`}>
          {result.error ?? result.ok}
        </span>
      )}
    </div>
  );
}

/** Registers the webhook and shows the one-time link that connects your chat. */
export function ConnectTelegram() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<Result | null>(null);
  return (
    <div className="flex flex-col gap-3">
      <div>
        <button type="button" disabled={pending} className={`${btn.primary} h-10 px-4 text-[14px]`} onClick={() => start(async () => setResult(await connectTelegramAction()))}>
          {pending ? <MiniSpin /> : null}
          {pending ? 'Connecting…' : result?.link ? 'Make a new link' : 'Connect Telegram'}
        </button>
      </div>
      {result?.error && <span role="status" className="text-[14px] text-danger">{result.error}</span>}
      {result?.link && (
        <div role="status" className="flex flex-col gap-1.5 text-[14px]">
          <a href={result.link} target="_blank" rel="noreferrer" className="font-semibold text-terracotta underline">
            Open the bot in Telegram
          </a>
          <span className="text-muted">Press Start there, then reload this page. The link works once, for 15 minutes.</span>
        </div>
      )}
    </div>
  );
}

export function FollowUpDays({ value }: { value: number }) {
  const [pending, start] = useTransition();
  const [note, setNote] = useState('');
  return (
    <label className="flex flex-wrap items-center gap-2 text-[14px]">
      A pitch needs a follow-up after
      <select
        defaultValue={value}
        disabled={pending}
        onChange={(e) => {
          const days = Number(e.target.value);
          start(async () => setNote((await setFollowUpDaysAction(days)).ok ?? ''));
        }}
        className="h-9 rounded-lg border border-border bg-surface px-2"
      >
        {[1, 2, 3, 4, 5, 7, 10, 14].map((d) => (
          <option key={d} value={d}>
            {d} day{d === 1 ? '' : 's'}
          </option>
        ))}
      </select>
      without a reply.
      {note && <span className="text-muted">{note}</span>}
    </label>
  );
}
