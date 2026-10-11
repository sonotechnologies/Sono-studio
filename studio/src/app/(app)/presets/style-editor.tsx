'use client';

import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { ReferencePicker } from '@/components/reference-picker';
import { btn, ConfirmDialog, inputClass, useToast } from '@/components/ui';
import type { CustomStyle } from '@/lib/data/repo';
import { PRESETS } from '@/lib/presets';
import { SitePageView } from '@/site/render';
import { KORA_KITCHEN } from '@/site/samples/kora-kitchen';
import type { Section, SiteConfig, SiteTheme } from '@/site/schema';
import { preferredLayouts } from '@/site/starter';
import { SECTIONS } from '@/site/registry';
import { ThemePanel } from '@/app/workspace/panels';
import { deleteStyleAction, saveStyleAction } from './actions';

const PREVIEW_TYPES = ['navbar', 'hero', 'features', 'testimonials', 'cta', 'footer'];

/** The sample home page in the base preset's preferred layouts, wearing this theme. */
function previewConfig(theme: SiteTheme): SiteConfig {
  const home = KORA_KITCHEN.pages[0];
  const preferred = preferredLayouts(theme) as Record<string, string | undefined>;
  const sections = home.sections
    .filter((s) => PREVIEW_TYPES.includes(s.type))
    .map((s) => {
      const v = preferred[s.type];
      const ok = v && (SECTIONS[s.type].variants as { id: string }[]).some((x) => x.id === v);
      return (ok ? { ...s, variant: v } : s) as Section;
    });
  return { ...KORA_KITCHEN, theme, pages: [{ ...home, sections }] };
}

export function StyleEditor({ initial }: { initial: CustomStyle | { name: string; note: string; theme: SiteTheme } }) {
  const router = useRouter();
  const toast = useToast();
  const editing = 'id' in initial;
  const [name, setName] = useState(initial.name);
  // A name filled in from a reference follows the next reference too; one you typed stays.
  const [autoName, setAutoName] = useState(!initial.name);
  const [note, setNote] = useState(initial.note);
  const [theme, setTheme] = useState<SiteTheme>(initial.theme);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  const config = useMemo(() => previewConfig(theme), [theme]);
  const ctx = useMemo(() => ({ link: (h: string) => h, editable: false }), []);

  const save = () =>
    start(async () => {
      setError('');
      const r = await saveStyleAction({ id: editing ? initial.id : undefined, name, note, theme });
      if (r.error) return setError(r.error);
      toast(`${r.style!.name} saved`);
      router.push('/presets');
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-6">
      <Link href="/presets" className="flex min-h-8 items-center gap-1.5 self-start text-[14px] text-muted hover:text-text">
        <ChevronLeft size={16} />
        Style presets
      </Link>
      <div className="grid items-start gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
        <div className="flex flex-col gap-5">
          <label className="flex flex-col gap-1.5 text-[14px] font-medium">
            Name
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setAutoName(false);
              }}
              maxLength={60} placeholder="e.g. Coastal calm" className={`${inputClass} h-11 text-[15px]`} />
          </label>
          <label className="flex flex-col gap-1.5 text-[14px] font-medium">
            Note <span className="text-[13px] font-normal text-muted">What it suits, shown on the card (optional)</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="e.g. Seaside cafés and guesthouses" className={`${inputClass} h-11 text-[15px]`} />
          </label>
          <ReferencePicker
            compact
            onPick={(r) => {
              setTheme(r.style.theme);
              if (autoName || !name.trim()) {
                setName(`From ${r.label.replace(/\.[a-z]+$/i, '').slice(0, 40)}`);
                setAutoName(true);
              }
            }}
          />
          <div className="flex flex-col overflow-hidden rounded-card border border-border bg-surface">
            <ThemePanel theme={theme} onChange={(t) => setTheme(t)} baseLabel />
          </div>
          {error && (
            <p role="alert" className="m-0 text-[14px] text-danger">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {editing && (
              <button type="button" onClick={() => setConfirm(true)} className={`${btn.dangerGhost} h-11 px-4 text-[14px]`}>
                Delete
              </button>
            )}
            <span className="flex-1" />
            <Link href="/presets" className={`${btn.secondary} h-11 px-4 text-[14px]`}>
              Cancel
            </Link>
            <button type="button" onClick={save} disabled={pending || !name.trim()} className={`${btn.primary} h-11 px-5 text-[15px]`}>
              {pending ? 'Saving…' : editing ? 'Save changes' : 'Save style'}
            </button>
          </div>
        </div>
        <div className="flex flex-col gap-2 lg:sticky lg:top-6">
          <span className="text-[13px] text-muted">
            Preview · {PRESETS[theme.preset].name} layouts · {theme.fonts.heading} / {theme.fonts.body}
          </span>
          <div
            className="max-h-[78dvh] overflow-auto rounded-xl shadow-[0_18px_50px_rgba(22,20,15,.18)]"
            onClickCapture={(e) => (e.target as HTMLElement).closest('a, button, summary') && e.preventDefault()}
          >
            <SitePageView config={config} page={config.pages[0]} ctx={ctx} />
          </div>
        </div>
      </div>
      {confirm && editing && (
        <ConfirmDialog
          title={`Delete ${initial.name}?`}
          body="Sites already using it keep their look. It just won't be offered for new sites."
          confirmLabel="Delete style"
          pending={pending}
          onCancel={() => setConfirm(false)}
          onConfirm={() =>
            start(async () => {
              await deleteStyleAction(initial.id);
              toast(`${initial.name} deleted`);
              router.push('/presets');
              router.refresh();
            })
          }
        />
      )}
    </div>
  );
}
