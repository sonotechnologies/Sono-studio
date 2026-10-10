'use client';

/* eslint-disable @next/next/no-img-element */
import { Check, ImagePlus, Loader2, Upload, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { Switch, inputClass } from '@/components/ui';
import { BUSINESS_KINDS, PAGE_OPTIONS, type Asset, type Brief, type PageKey } from '@/generate/brief';
import { PRESETS, PRESET_THUMBS } from '@/lib/presets';
import { PRESET_IDS } from '@/lib/types';

export function StepTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="flex flex-col gap-2.5">
      <h1 className="m-0 text-[32px] leading-[1.1] font-semibold tracking-[-0.02em] md:text-[40px]">{title}</h1>
      {sub && <p className="m-0 text-[16px] text-muted">{sub}</p>}
    </div>
  );
}

function Tick({ size = 22 }: { size?: number }) {
  return (
    <span style={{ width: size, height: size }} className="flex items-center justify-center rounded-full bg-terracotta text-white shadow-[0_0_0_3px_var(--surface)]">
      <Check size={12} strokeWidth={3.2} />
    </span>
  );
}

/* ---------- Step 1: Business ---------- */

export function BusinessStep({ brief, set }: { brief: Brief; set: (b: Brief) => void }) {
  const known = BUSINESS_KINDS.some((k) => k.name === brief.businessType);
  const [other, setOther] = useState(!known && !!brief.businessType);
  const pick = (name: string) => {
    const kind = BUSINESS_KINDS.find((k) => k.name === name)!;
    setOther(false);
    set({ ...brief, businessType: name, preset: kind.preset, pages: kind.pages });
  };
  const togglePage = (key: PageKey) => {
    if (key === 'home') return;
    const has = brief.pages.includes(key);
    set({ ...brief, pages: has ? brief.pages.filter((p) => p !== key) : PAGE_OPTIONS.map((p) => p.key).filter((k) => k === key || brief.pages.includes(k)) });
  };
  return (
    <div className="flex flex-col gap-10">
      <StepTitle title="Who is the site for?" sub="The business name and type shape the sections, copy and photos." />
      <label className="flex max-w-[480px] flex-col gap-2 text-[14px] font-medium">
        Business name
        <input
          autoFocus
          value={brief.businessName}
          onChange={(e) => set({ ...brief, businessName: e.target.value })}
          maxLength={80}
          className={`${inputClass} h-[52px] px-4 text-[20px] font-medium`}
        />
      </label>
      <fieldset className="m-0 flex flex-col gap-3.5 border-0 p-0">
        <legend className="mb-3.5 p-0 text-[14px] font-medium">Site type</legend>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3.5">
          {BUSINESS_KINDS.map((k) => {
            const on = !other && brief.businessType === k.name;
            return (
              <button
                key={k.name}
                type="button"
                aria-pressed={on}
                onClick={() => pick(k.name)}
                className={`relative flex cursor-pointer flex-col gap-1.5 rounded-dialog border-2 bg-surface px-5 py-[22px] text-left transition-[border-color,transform] duration-150 hover:-translate-y-0.5 ${
                  on ? 'border-terracotta' : 'border-border'
                }`}
              >
                <span className="text-[20px] font-semibold tracking-[-0.01em]">{k.name}</span>
                <span className="text-[14px] text-muted">{k.desc}</span>
                {on && (
                  <span className="absolute top-3.5 right-3.5">
                    <Tick />
                  </span>
                )}
              </button>
            );
          })}
          <div
            className={`relative flex flex-col gap-1.5 rounded-dialog border-2 bg-surface px-5 py-[22px] ${other ? 'border-terracotta' : 'border-border'}`}
          >
            <button type="button" aria-pressed={other} onClick={() => setOther(true)} className="cursor-pointer text-left">
              <span className="text-[20px] font-semibold tracking-[-0.01em]">Something else</span>
            </button>
            {other ? (
              <input
                autoFocus
                aria-label="Kind of business"
                value={known ? '' : brief.businessType}
                onChange={(e) => set({ ...brief, businessType: e.target.value })}
                placeholder="e.g. Barber, florist, car wash"
                maxLength={60}
                className={`${inputClass} h-10 text-[14px]`}
              />
            ) : (
              <span className="text-[14px] text-muted">Type your own</span>
            )}
          </div>
        </div>
      </fieldset>
      <fieldset className="m-0 flex flex-col border-0 p-0">
        <legend className="mb-3.5 p-0 text-[14px] font-medium">Pages</legend>
        <div className="flex flex-wrap gap-2">
          {PAGE_OPTIONS.map((p) => {
            const on = p.key === 'home' || brief.pages.includes(p.key);
            return (
              <button
                key={p.key}
                type="button"
                aria-pressed={on}
                disabled={p.key === 'home'}
                onClick={() => togglePage(p.key)}
                title={p.note}
                className={`flex h-10 cursor-pointer items-center gap-1.5 rounded-full border px-4 text-[14px] font-medium disabled:cursor-default ${
                  on ? 'border-text bg-text text-bg' : 'border-border text-text hover:bg-hover'
                }`}
              >
                {on && <Check size={14} strokeWidth={2.5} />}
                {p.title}
              </button>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}

/* ---------- Step 2: Style ---------- */

export function StyleStep({ brief, set }: { brief: Brief; set: (b: Brief) => void }) {
  const suggested = BUSINESS_KINDS.find((k) => k.name === brief.businessType)?.preset;
  return (
    <div className="flex flex-col gap-9">
      <StepTitle title="Pick a style" sub="Colours from the logo replace the preset's colours later. Fonts, shapes and layouts stay." />
      <div role="radiogroup" aria-label="Style preset" className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,320px),1fr))] gap-[18px]">
        {PRESET_IDS.map((id) => {
          const p = PRESETS[id];
          const t = PRESET_THUMBS[id];
          const on = brief.preset === id;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => set({ ...brief, preset: id })}
              className={`relative flex cursor-pointer flex-col overflow-hidden rounded-dialog border-2 bg-surface text-left transition-transform duration-150 hover:-translate-y-0.5 ${
                on ? 'border-terracotta' : 'border-border'
              }`}
            >
              <div style={{ background: t.bg, color: t.text }} className="grid h-[190px] grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] items-center gap-4 p-[22px]">
                <div className="flex flex-col gap-3">
                  <span
                    style={{ fontFamily: t.headingFont, fontSize: t.headingSize + 6, letterSpacing: t.headingTracking, textTransform: t.uppercase ? 'uppercase' : 'none' }}
                    className="leading-[1.02]"
                  >
                    {t.sample}
                  </span>
                  <span style={{ background: t.primary, color: t.onPrimary, fontFamily: t.bodyFont, borderRadius: t.buttonRadius }} className="self-start px-3 py-[7px] text-[11px]">
                    {t.cta}
                  </span>
                </div>
                <div
                  style={{ borderRadius: t.imageRadius, border: t.imageBorder, background: `repeating-linear-gradient(135deg, ${t.stripeA} 0 8px, ${t.stripeB} 8px 16px)` }}
                  className="h-[130px]"
                />
              </div>
              <div className="flex flex-col gap-1 px-[18px] py-4">
                <span className="flex items-center gap-2">
                  <span className="flex-1 text-[16px] font-semibold">{p.name}</span>
                  {suggested === id && (
                    <span className="rounded-full bg-sel px-[9px] py-[3px] text-[11px] font-medium">Suggested for {brief.businessType.toLowerCase()}</span>
                  )}
                </span>
                <span className="text-[13px] text-muted">
                  {p.feel} · {p.fonts.heading} / {p.fonts.body}
                </span>
              </div>
              {on && (
                <span className="absolute top-3 right-3">
                  <Tick size={24} />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Step 3: Content ---------- */

export interface UploadTile {
  key: string;
  name: string;
  kind: 'photo' | 'logo';
  state: 'uploading' | 'done' | 'error';
  asset?: Asset;
  error?: string;
}

export function ContentStep({
  brief,
  set,
  tiles,
  onFiles,
  onRemove,
}: {
  brief: Brief;
  set: (b: Brief) => void;
  tiles: UploadTile[];
  onFiles: (files: File[], forceLogo?: boolean) => void;
  onRemove: (tile: UploadTile) => void;
}) {
  const [drag, setDrag] = useState(false);
  const photosInput = useRef<HTMLInputElement>(null);
  const logoInput = useRef<HTMLInputElement>(null);
  const logo = tiles.find((t) => t.kind === 'logo' && t.state === 'done');
  const field = `${inputClass} h-11 rounded-[10px] text-[16px]`;
  const client = (k: keyof Brief['client'], v: string) => set({ ...brief, client: { ...brief.client, [k]: v } });

  return (
    <div className="flex flex-col gap-8">
      <StepTitle title="What do you have from them?" sub="Photos, a logo, a menu or price list. Anything missing is filled with stock photos and drafted copy." />
      <div
        role="button"
        tabIndex={0}
        onClick={() => photosInput.current?.click()}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), photosInput.current?.click())}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          onFiles(Array.from(e.dataTransfer.files));
        }}
        className={`flex min-h-[220px] cursor-pointer flex-col items-center justify-center gap-2.5 rounded-[18px] border-2 border-dashed p-6 text-center transition-colors duration-150 ${
          drag ? 'border-terracotta bg-accent-bg' : 'border-border bg-surface hover:bg-hover'
        }`}
      >
        <span className="flex size-12 items-center justify-center rounded-full bg-sel">
          <Upload size={20} strokeWidth={2} />
        </span>
        <span className="text-[20px] font-semibold">Drop photos and the logo</span>
        <span className="text-[14px] text-muted">or click to browse · JPG, PNG, WebP · files with “logo” in the name become the logo</span>
        <input
          ref={photosInput}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,image/svg+xml"
          className="hidden"
          onChange={(e) => {
            onFiles(Array.from(e.target.files ?? []));
            e.target.value = '';
          }}
        />
      </div>
      <div className="-mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted">
        <button type="button" onClick={() => logoInput.current?.click()} className="flex cursor-pointer items-center gap-1.5 font-medium text-accent-text hover:underline">
          <ImagePlus size={14} strokeWidth={2} />
          {logo ? 'Replace the logo' : 'Add the logo'}
        </button>
        <span>Menus or price lists as PDF: paste the text below instead.</span>
        <input
          ref={logoInput}
          type="file"
          accept="image/png,image/svg+xml,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            onFiles(Array.from(e.target.files ?? []), true);
            e.target.value = '';
          }}
        />
      </div>

      {tiles.length > 0 && (
        <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3 p-0">
          {tiles.map((t) => (
            <li key={t.key} className="flex animate-fade-up flex-col gap-2">
              <div className="relative flex aspect-[4/3] items-end overflow-hidden rounded-xl border border-border bg-[repeating-linear-gradient(135deg,var(--sel)_0_8px,transparent_8px_16px)] p-2">
                {t.asset && (
                  <img src={t.asset.url} alt="" className={`absolute inset-0 h-full w-full ${t.kind === 'logo' ? 'bg-white object-contain p-3' : 'object-cover'}`} />
                )}
                {t.state === 'uploading' && (
                  <span className="absolute inset-0 flex items-center justify-center bg-bg/60">
                    <Loader2 size={20} className="animate-spin" />
                  </span>
                )}
                <span className="relative rounded-full bg-bg/90 px-2 py-0.5 font-mono text-[11px] font-medium text-muted">{t.kind}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className={`min-w-0 flex-1 truncate text-[13px] ${t.state === 'error' ? 'text-danger' : ''}`} title={t.error ?? t.name}>
                  {t.state === 'error' ? t.error : t.name}
                </span>
                <button
                  type="button"
                  onClick={() => onRemove(t)}
                  disabled={t.state === 'uploading'}
                  aria-label={`Remove ${t.name}`}
                  className="flex size-7 cursor-pointer items-center justify-center rounded-full text-muted hover:bg-hover hover:text-text disabled:opacity-40"
                >
                  <X size={14} strokeWidth={2} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {logo && brief.brandColors.length > 0 && (
        <div className="flex flex-wrap items-center gap-4 rounded-card border border-border bg-surface px-[18px] py-4">
          <div className="flex min-w-[200px] flex-1 flex-col gap-0.5">
            <span className="text-[14px] font-semibold">Colours found in {logo.name}</span>
            <span className="text-[13px] text-muted">Applied to {PRESETS[brief.preset].name} only if you keep this on.</span>
          </div>
          <div className="flex gap-1.5">
            {brief.brandColors.map((c) => (
              <span key={c} title={c} style={{ background: c }} className="size-7 rounded-full border border-border" />
            ))}
          </div>
          <label className="flex cursor-pointer items-center gap-2.5 text-[14px]">
            <Switch on={brief.useBrand} onChange={(v) => set({ ...brief, useBrand: v })} label="Use logo colours" />
            Use logo colours
          </label>
        </div>
      )}

      <label className="flex flex-col gap-2 text-[14px] font-medium">
        Paste anything else
        <textarea
          rows={5}
          value={brief.paste}
          onChange={(e) => set({ ...brief, paste: e.target.value })}
          maxLength={6000}
          placeholder="Opening hours, a menu or price list, an Instagram bio, a WhatsApp message from the owner…"
          className={`${inputClass} resize-y px-4 py-3.5 text-[16px] leading-normal`}
        />
      </label>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
        <label className="flex flex-col gap-2 text-[14px] font-medium">
          WhatsApp
          <input type="tel" value={brief.client.whatsapp} onChange={(e) => client('whatsapp', e.target.value)} maxLength={32} placeholder="+1 555 214 0090" className={field} />
        </label>
        <label className="flex flex-col gap-2 text-[14px] font-medium">
          Instagram
          <input value={brief.client.instagram} onChange={(e) => client('instagram', e.target.value)} maxLength={60} placeholder="@korakitchen" className={field} />
        </label>
        <label className="flex flex-col gap-2 text-[14px] font-medium">
          Owner
          <input value={brief.client.ownerName} onChange={(e) => client('ownerName', e.target.value)} maxLength={80} placeholder="Amara Osei" className={field} />
        </label>
        <label className="flex flex-col gap-2 text-[14px] font-medium">
          Address
          <input value={brief.client.address} onChange={(e) => client('address', e.target.value)} maxLength={160} placeholder="14 Mill Lane, Old Town" className={field} />
        </label>
      </div>
    </div>
  );
}

/* ---------- Step 4: Review ---------- */

export function ReviewStep({ rows, notice }: { rows: { label: string; value: string; edit: () => void }[]; notice: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-7">
      <StepTitle title="Ready to build" />
      <dl className="m-0 flex flex-col border-t border-border">
        {rows.map((r) => (
          <div key={r.label} className="grid grid-cols-[110px_minmax(0,1fr)_auto] items-baseline gap-5 border-b border-border py-[18px] md:grid-cols-[160px_minmax(0,1fr)_auto]">
            <dt className="text-[14px] text-muted">{r.label}</dt>
            <dd className="m-0 text-[16px] leading-[1.45] font-medium [overflow-wrap:anywhere]">{r.value}</dd>
            <button type="button" onClick={r.edit} className="cursor-pointer text-[14px] font-medium text-accent-text hover:underline">
              Edit
            </button>
          </div>
        ))}
      </dl>
      <p className="m-0 text-[14px] leading-normal text-muted">You’ll review a page-by-page plan before any copy is written.</p>
      {notice}
    </div>
  );
}
