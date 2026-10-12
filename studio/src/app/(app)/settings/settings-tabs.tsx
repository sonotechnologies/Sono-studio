'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { Switch, btn, inputClass, useToast } from '@/components/ui';
import type { StudioSettings } from '@/lib/types';
import { signOutAction } from '../../login/actions';
import { saveSettingsAction } from './actions';
import { ConnectionsPanel, PaymentsPanel, ProvidersPanel, type KeyView } from './keys-panels';

export type SettingsTab = 'providers' | 'connections' | 'payments' | 'pitch' | 'account';

const TAB_NAMES: Record<SettingsTab, string> = {
  providers: 'AI providers',
  connections: 'Connections',
  payments: 'Test payments',
  pitch: 'Pitch defaults',
  account: 'Account',
};

export function SettingsTabs({
  tab,
  settings,
  email,
  keys,
  demo,
  supabase,
  siteUrl,
}: {
  tab: SettingsTab;
  settings: StudioSettings;
  email: string;
  keys: KeyView[];
  demo: boolean;
  supabase: boolean;
  /** The studio's public address, for the webhook URLs. */
  siteUrl: string;
}) {
  return (
    <>
      <nav aria-label="Settings sections" className="-mb-1 flex gap-[22px] overflow-x-auto border-b border-border">
        {(Object.keys(TAB_NAMES) as SettingsTab[]).map((t) => (
          <Link
            key={t}
            href={`/settings?tab=${t}`}
            replace
            aria-current={t === tab ? 'page' : undefined}
            className={`flex h-11 items-center text-[14px] font-medium whitespace-nowrap ${
              t === tab ? 'text-accent-text shadow-[inset_0_-2px_0_var(--terracotta)]' : 'text-muted hover:text-text'
            }`}
          >
            {TAB_NAMES[t]}
          </Link>
        ))}
      </nav>
      {tab === 'providers' && <ProvidersPanel rows={keys} demo={demo} />}
      {tab === 'connections' && <ConnectionsPanel rows={keys} supabase={supabase} />}
      {tab === 'payments' && <PaymentsPanel rows={keys} siteUrl={siteUrl} />}
      {tab === 'pitch' && <PitchDefaults initial={settings} />}
      {tab === 'account' && (
        <div className="flex flex-wrap items-center gap-4 rounded-card border border-border bg-surface p-[18px]">
          <div className="flex min-w-[200px] flex-1 flex-col gap-[3px]">
            <span className="text-[15px] font-semibold">Signed in</span>
            <span className="text-[13px] text-muted">{email}</span>
          </div>
          <form action={signOutAction}>
            <button type="submit" className={`${btn.secondary} h-10 px-4 text-[14px]`}>
              Sign out
            </button>
          </form>
        </div>
      )}
    </>
  );
}

function PitchDefaults({ initial }: { initial: StudioSettings }) {
  const toast = useToast();
  const [s, setS] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [pending, start] = useTransition();
  const dirty = JSON.stringify(s) !== JSON.stringify(saved);

  const save = (next: StudioSettings) =>
    start(async () => {
      try {
        await saveSettingsAction(next);
        setSaved(next);
        toast('Pitch defaults saved');
      } catch {
        toast('Couldn’t save pitch defaults');
      }
    });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save(s);
      }}
      className="flex flex-col gap-5"
    >
      <label className="flex cursor-pointer items-center gap-4 rounded-card border border-border bg-surface p-[18px]">
        <span className="flex flex-1 flex-col gap-[3px]">
          <span className="text-[15px] font-semibold">Show banner on new pitches</span>
          <span className="text-[13px] text-muted">Each project can still switch it off on its own page.</span>
        </span>
        <Switch on={s.bannerDefault} onChange={(v) => setS({ ...s, bannerDefault: v })} label="Show banner on new pitches" />
      </label>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4">
        <label className="flex flex-col gap-1.5 text-[14px] font-medium">
          WhatsApp on banner
          <input
            type="tel"
            value={s.bannerWhatsapp}
            onChange={(e) => setS({ ...s, bannerWhatsapp: e.target.value })}
            placeholder="+1 555 300 1188"
            className={`${inputClass} h-11 rounded-[10px] text-[15px]`}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-[14px] font-medium">
          Instagram on banner
          <input
            value={s.bannerInstagram}
            onChange={(e) => setS({ ...s, bannerInstagram: e.target.value })}
            placeholder="@sono.technologies"
            className={`${inputClass} h-11 rounded-[10px] text-[15px]`}
          />
        </label>
      </div>
      <div className="flex flex-col gap-2.5">
        <span className="text-[14px] font-medium">Preview</span>
        <div className="flex flex-wrap items-center gap-3.5 rounded-card bg-ink px-4 py-3 text-paper">
          <img src="/logo/sono-mark-inverse.svg" alt="Sono" className="block h-[15px] w-auto flex-none" />
          <span className="min-w-[160px] flex-1 text-[14px]">
            Concept by <b className="font-semibold">Sono Technologies</b>
          </span>
          {s.bannerWhatsapp && (
            <span className="flex h-[34px] items-center rounded-full bg-terracotta px-3.5 text-[13px] font-semibold text-white">
              WhatsApp
            </span>
          )}
          {s.bannerInstagram && (
            <span className="flex h-[34px] items-center rounded-full border border-[rgba(247,245,241,.3)] px-3.5 text-[13px] font-medium">
              Instagram
            </span>
          )}
        </div>
      </div>
      <div className="flex justify-end">
        <button type="submit" disabled={!dirty || pending} className={`${btn.primary} h-11 px-5 text-[15px]`}>
          {pending ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}
