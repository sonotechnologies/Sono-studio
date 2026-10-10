'use client';

import { ArrowDown, ArrowUp, ExternalLink, GripVertical } from 'lucide-react';
import { useState, useTransition } from 'react';
import { btn, inputClass, useToast } from '@/components/ui';
import { AI_PROVIDERS, PROVIDER_INFO, type AiProviderId } from '@/ai/types';
import {
  clearCooldownAction,
  listModelsAction,
  removeKeyAction,
  reorderProvidersAction,
  saveKeyAction,
  setDailyLimitAction,
  setModelsAction,
} from './ai-actions';

export interface KeyView {
  provider: string;
  hint: string;
  models: { strong?: string; light?: string };
  position: number;
  dailyLimit: number | null;
  usage: number;
  cooldownUntil: string | null;
  state: 'ready' | 'cooling' | 'limit';
}

const STOCK_INFO = {
  unsplash: { name: 'Unsplash', note: 'Stock photos when a client sends none', keyUrl: 'https://unsplash.com/oauth/applications', keyLabel: 'Access Key' },
  pexels: { name: 'Pexels', note: 'Backup stock photo source', keyUrl: 'https://www.pexels.com/api/new/', keyLabel: 'API key' },
} as const;

function KeyForm({ provider, label, onSaved }: { provider: string; label: string; onSaved?: (models?: string[]) => void }) {
  const toast = useToast();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setError(null);
          const r = await saveKeyAction(provider, value);
          if (r.error) return setError(r.error);
          setValue('');
          toast(r.warning ?? 'Key saved');
          onSaved?.(r.models);
        });
      }}
      className="flex flex-col gap-1.5"
    >
      <div className="flex flex-wrap gap-2">
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          aria-label={label}
          placeholder={label}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className={`${inputClass} h-10 min-w-0 flex-1 rounded-[10px] font-mono text-[13px]`}
        />
        <button type="submit" disabled={pending || !value.trim()} className={`${btn.secondary} h-10 px-4 text-[13px]`}>
          {pending ? 'Checking…' : 'Save key'}
        </button>
      </div>
      {error && (
        <p role="alert" className="m-0 text-[13px] text-danger">
          {error}
        </p>
      )}
    </form>
  );
}

function ProviderRow({
  row,
  index,
  total,
  move,
  dragProps,
}: {
  row: KeyView;
  index: number;
  total: number;
  move: (from: number, to: number) => void;
  dragProps: React.HTMLAttributes<HTMLDivElement> & { draggable: boolean };
}) {
  const id = row.provider as AiProviderId;
  const info = PROVIDER_INFO[id];
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [models, setModels] = useState({ strong: row.models.strong ?? info.defaults.strong, light: row.models.light ?? info.defaults.light });
  const [options, setOptions] = useState<string[]>([]);
  const [limit, setLimit] = useState(row.dailyLimit ? String(row.dailyLimit) : '');
  const [pending, start] = useTransition();
  const pct = row.dailyLimit ? Math.min(100, Math.round((row.usage / row.dailyLimit) * 100)) : 0;
  const hot = row.dailyLimit ? row.usage / row.dailyLimit > 0.85 : false;
  const run = (fn: () => Promise<unknown>, done?: string) =>
    start(async () => {
      try {
        await fn();
        if (done) toast(done);
      } catch (err) {
        toast((err as Error).message);
      }
    });

  return (
    <div {...dragProps} className={`flex flex-col rounded-card border bg-surface ${dragProps.className ?? ''}`}>
      <div className="grid cursor-grab grid-cols-[auto_auto_minmax(0,1fr)] items-center gap-4 px-[18px] py-4 md:grid-cols-[auto_auto_minmax(0,1fr)_minmax(140px,220px)_auto]">
        <GripVertical size={16} strokeWidth={2} className="text-muted opacity-60" aria-hidden />
        <span className="flex size-7 items-center justify-center rounded-full bg-sel text-[13px] font-semibold" title={`Tried ${index === 0 ? 'first' : `${index + 1}th`}`}>
          {index + 1}
        </span>
        <div className="flex min-w-0 flex-col gap-[3px]">
          <span className="text-[15px] font-semibold">{info.name}</span>
          <span className={`truncate text-[13px] ${row.state === 'ready' ? 'text-muted' : 'text-warn'}`}>
            Key saved · ends {row.hint}
            {row.state === 'cooling' && row.cooldownUntil && ` · resting until ${new Date(row.cooldownUntil).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
            {row.state === 'limit' && ' · at today’s limit'}
          </span>
        </div>
        <div className="col-span-3 flex flex-col gap-1.5 md:col-span-1">
          <span className={`text-right font-mono text-[12px] ${hot ? 'text-warn' : 'text-muted'}`}>
            {row.dailyLimit ? `${pct}% · ${row.usage} / ${row.dailyLimit} today` : `${row.usage} request${row.usage === 1 ? '' : 's'} today`}
          </span>
          <div className="h-1.5 overflow-hidden rounded-full bg-sel" role="meter" aria-label={`${info.name} usage today`} aria-valuenow={row.usage} aria-valuemin={0} aria-valuemax={row.dailyLimit ?? undefined}>
            <div style={{ width: `${row.dailyLimit ? pct : 0}%` }} className={`h-full rounded-full ${hot ? 'bg-warn-fill' : 'bg-text'}`} />
          </div>
        </div>
        <div className="col-span-3 flex items-center justify-end gap-1 md:col-span-1">
          <button type="button" aria-label={`Move ${info.name} up`} disabled={index === 0} onClick={() => move(index, index - 1)} className="flex size-8 cursor-pointer items-center justify-center rounded-full text-muted hover:bg-hover disabled:opacity-30">
            <ArrowUp size={14} />
          </button>
          <button type="button" aria-label={`Move ${info.name} down`} disabled={index === total - 1} onClick={() => move(index, index + 1)} className="flex size-8 cursor-pointer items-center justify-center rounded-full text-muted hover:bg-hover disabled:opacity-30">
            <ArrowDown size={14} />
          </button>
          <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className={`${btn.secondary} h-9 px-3.5 text-[13px]`}>
            {open ? 'Done' : 'Manage'}
          </button>
        </div>
      </div>
      {open && (
        <div className="flex flex-col gap-5 border-t border-border px-[18px] py-5">
          <div className="grid gap-4 md:grid-cols-2">
            {(['strong', 'light'] as const).map((tier) => (
              <label key={tier} className="flex flex-col gap-1.5 text-[14px] font-medium">
                {tier === 'strong' ? 'Strong model (plans)' : 'Light model (copy, parsing)'}
                <input
                  list={`${id}-models`}
                  value={models[tier]}
                  onChange={(e) => setModels({ ...models, [tier]: e.target.value })}
                  className={`${inputClass} h-10 rounded-[10px] font-mono text-[13px]`}
                />
              </label>
            ))}
            <datalist id={`${id}-models`}>
              {options.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={pending} onClick={() => run(() => setModelsAction(id, models), 'Models saved')} className={`${btn.secondary} h-9 px-3.5 text-[13px]`}>
              Save models
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                run(async () => {
                  const r = await listModelsAction(id);
                  if (r.error) throw new Error(r.error);
                  setOptions(r.models ?? []);
                }, 'Model list loaded; pick from the suggestions')
              }
              className={`${btn.ghost} h-9 px-3.5 text-[13px]`}
            >
              Load available models
            </button>
          </div>
          <label className="flex max-w-[320px] flex-col gap-1.5 text-[14px] font-medium">
            Daily request limit
            <span className="flex gap-2">
              <input
                inputMode="numeric"
                value={limit}
                onChange={(e) => setLimit(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="No limit set"
                className={`${inputClass} h-10 rounded-[10px] text-[14px]`}
              />
              <button type="button" disabled={pending} onClick={() => run(() => setDailyLimitAction(id, limit ? Number(limit) : null), 'Limit saved')} className={`${btn.secondary} h-10 px-3.5 text-[13px]`}>
                Save
              </button>
            </span>
            <span className="text-[12px] font-normal text-muted">From the provider’s free-tier page. The meter warns near it and the router skips the provider once it’s reached.</span>
          </label>
          <div className="flex flex-col gap-2">
            <span className="text-[14px] font-medium">Replace key</span>
            <KeyForm provider={id} label={`New ${info.name} key`} />
          </div>
          <div className="flex flex-wrap gap-2 border-t border-border pt-4">
            {row.state === 'cooling' && (
              <button type="button" disabled={pending} onClick={() => run(() => clearCooldownAction(id), 'Cooldown cleared')} className={`${btn.ghost} h-9 px-3.5 text-[13px]`}>
                Try it again now
              </button>
            )}
            <button type="button" disabled={pending} onClick={() => run(() => removeKeyAction(id), `${info.name} removed`)} className={`${btn.dangerGhost} h-9 px-3.5 text-[13px]`}>
              Remove {info.name}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function ProvidersPanel({ rows, demo }: { rows: KeyView[]; demo: boolean }) {
  const ai = rows.filter((r) => (AI_PROVIDERS as readonly string[]).includes(r.provider)).sort((a, b) => a.position - b.position);
  const [order, setOrder] = useState(ai.map((r) => r.provider));
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [, start] = useTransition();
  const known = new Set(ai.map((r) => r.provider));
  // Keep local order in step when providers are added or removed.
  const current = [...order.filter((p) => known.has(p)), ...ai.map((r) => r.provider).filter((p) => !order.includes(p))];
  const sorted = current.map((p) => ai.find((r) => r.provider === p)!);
  const missing = AI_PROVIDERS.filter((p) => !known.has(p));

  const move = (from: number, to: number) => {
    if (to < 0 || to >= current.length || from === to) return;
    const next = [...current];
    const [it] = next.splice(from, 1);
    next.splice(to, 0, it);
    setOrder(next);
    start(() => reorderProvidersAction(next));
  };

  return (
    <div className="flex flex-col gap-6">
      <p className="m-0 text-[14px] leading-normal text-muted">
        Drag to set the order. If a provider hits its limit or fails, the next one takes over. Keys are encrypted before they’re stored and never reach the browser again.
      </p>
      {demo && (
        <p className="m-0 rounded-card border border-border bg-surface p-4 text-[14px] leading-normal">
          No key yet: in development the wizard uses <b className="font-semibold">Demo mode</b> (template copy, no AI). Add any one provider below for real generation.
        </p>
      )}
      {sorted.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {sorted.map((row, i) => (
            <ProviderRow
              key={row.provider}
              row={row}
              index={i}
              total={sorted.length}
              move={move}
              dragProps={{
                draggable: true,
                onDragStart: (e) => {
                  e.dataTransfer.effectAllowed = 'move';
                  setDrag(i);
                },
                onDragOver: (e) => {
                  e.preventDefault();
                  setOver(i);
                },
                onDrop: (e) => {
                  e.preventDefault();
                  if (drag !== null) move(drag, i);
                  setDrag(null);
                  setOver(null);
                },
                onDragEnd: () => {
                  setDrag(null);
                  setOver(null);
                },
                className: `${over === i && drag !== null && drag !== i ? 'border-terracotta' : 'border-border'} ${drag === i ? 'opacity-40' : ''}`,
              }}
            />
          ))}
        </div>
      )}
      {missing.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="m-0 text-[16px] font-semibold">{sorted.length ? 'Add another provider' : 'Add a provider'}</h2>
          {missing.map((p) => (
            <div key={p} className="flex flex-col gap-3 rounded-card border border-dashed border-border p-[18px]">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-[15px] font-semibold">{PROVIDER_INFO[p].name}</span>
                <a href={PROVIDER_INFO[p].keyUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[13px] font-medium text-accent-text hover:underline">
                  Get a free key
                  <ExternalLink size={12} />
                </a>
              </div>
              <KeyForm provider={p} label={`${PROVIDER_INFO[p].name} API key`} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ConnectionRow({ initial, name, note, status, good, children }: { initial: string; name: string; note: string; status: string; good: boolean; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-b border-border py-3">
      <div className="flex min-h-11 flex-wrap items-center gap-4">
        <span className="flex size-9 items-center justify-center rounded-[10px] bg-sel text-[14px] font-bold">{initial}</span>
        <span className="flex min-w-[180px] flex-1 flex-col gap-0.5">
          <span className="text-[15px] font-semibold">{name}</span>
          <span className="text-[13px] text-muted">{note}</span>
        </span>
        <span className={`rounded-full px-2.5 py-1 text-[12px] font-medium ${good ? 'bg-success-bg text-success' : 'bg-sel text-muted'}`}>{status}</span>
      </div>
      {children}
    </div>
  );
}

export function ConnectionsPanel({ rows, supabase }: { rows: KeyView[]; supabase: boolean }) {
  const toast = useToast();
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col border-t border-border">
      <ConnectionRow initial="S" name="Supabase" note="Stores projects, versions, uploads and pitch analytics" status={supabase ? 'Connected' : 'Dev store'} good={supabase} />
      {(['unsplash', 'pexels'] as const).map((p) => {
        const row = rows.find((r) => r.provider === p);
        const info = STOCK_INFO[p];
        return (
          <ConnectionRow key={p} initial={info.name[0]} name={info.name} note={info.note} status={row ? `Key ends ${row.hint}` : 'No key'} good={!!row}>
            <div className="flex flex-col gap-2 pl-0 md:pl-[52px]">
              <KeyForm provider={p} label={`${info.name} ${info.keyLabel}`} />
              <div className="flex flex-wrap gap-4 text-[13px]">
                <a href={info.keyUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 font-medium text-accent-text hover:underline">
                  Get a free key
                  <ExternalLink size={12} />
                </a>
                {row && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => start(async () => (await removeKeyAction(p), toast(`${info.name} removed`)))}
                    className="cursor-pointer font-medium text-danger hover:underline"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          </ConnectionRow>
        );
      })}
      <ConnectionRow initial="G" name="GitHub" note="Pushes each site to its own repository" status="Phase 6" good={false} />
      <ConnectionRow initial="V" name="Vercel" note="Deploys to project.vercel.app or a custom domain" status="Phase 6" good={false} />
    </div>
  );
}
