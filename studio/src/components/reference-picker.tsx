'use client';

import { Image as ImageIcon, Link2, Shapes } from 'lucide-react';
import { useRef, useState, useTransition } from 'react';
import { readLinkAction } from '@/app/(app)/presets/actions';
import { logoPalette, screenshotColors } from '@/generate/browser-images';
import { PRESETS } from '@/lib/presets';
import { styleFromReference, type ReferenceStyle } from '@/style/reference';
import { MiniSpin } from './orbit';
import { btn, inputClass } from './ui';

type Source = 'screenshot' | 'logo' | 'link';

export interface PickedReference {
  style: ReferenceStyle;
  /** "screenshot.png", "kora-kitchen.com", ... */
  label: string;
  source: Source;
}

/**
 * Upload a screenshot or logo, or paste a link: colours, fonts and the closest
 * preset are worked out in code. Images never leave the browser; links are
 * read by the server.
 */
export function ReferencePicker({ onPick, compact = false }: { onPick: (r: PickedReference) => void; compact?: boolean }) {
  const [source, setSource] = useState<Source>('screenshot');
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<PickedReference | null>(null);
  const [pending, start] = useTransition();
  const file = useRef<HTMLInputElement>(null);

  const done = (r: PickedReference) => {
    setResult(r);
    onPick(r);
  };

  const fromFile = (f: File) =>
    start(async () => {
      setError('');
      try {
        if (!/^image\//.test(f.type)) throw new Error('Choose an image (PNG, JPG or WebP).');
        const style =
          source === 'logo'
            ? styleFromReference({ kind: 'logo', colors: (await logoPalette(f)).map((hex, i) => ({ hex, weight: 10 - i })) })
            : styleFromReference({ kind: 'screenshot', colors: await screenshotColors(f) });
        done({ style, label: f.name, source });
      } catch (err) {
        setError((err as Error).message || 'That image couldn’t be read.');
      }
    });

  const fromLink = () =>
    start(async () => {
      setError('');
      const r = await readLinkAction(url);
      if (r.error || !r.style) return setError(r.error ?? 'That page couldn’t be read.');
      done({ style: r.style, label: r.title || url, source: 'link' });
    });

  const tabs: { id: Source; label: string; Icon: typeof Link2; note: string }[] = [
    { id: 'screenshot', label: 'Screenshot', Icon: ImageIcon, note: 'A screenshot of a site, Instagram grid or flyer whose look you like.' },
    { id: 'link', label: 'Link', Icon: Link2, note: 'The client’s current website, or any site whose look you like.' },
    { id: 'logo', label: 'Logo', Icon: Shapes, note: 'Brand colours from the logo, on the closest preset’s background.' },
  ];
  const tab = tabs.find((t) => t.id === source)!;

  return (
    <div className={`flex flex-col gap-3 rounded-card border border-border bg-surface ${compact ? 'p-4' : 'p-[18px]'}`}>
      <div className="flex flex-wrap items-center gap-3">
        <span className={`text-[14px] font-semibold whitespace-nowrap ${compact ? 'basis-full' : 'flex-1'}`}>Start from a reference</span>
        <div role="tablist" className="flex rounded-full bg-sel p-[3px]">
          {tabs.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={source === id}
              onClick={() => {
                setSource(id);
                setError('');
              }}
              className={`flex h-8 cursor-pointer items-center gap-1.5 rounded-full px-3 text-[13px] font-medium ${source === id ? 'bg-surface text-text shadow-[0_1px_3px_rgba(0,0,0,.12)]' : 'text-muted hover:text-text'}`}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>
      </div>
      <p className="m-0 text-[13px] text-muted">{tab.note}</p>
      {source === 'link' ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (url.trim()) fromLink();
          }}
          className="flex gap-2"
        >
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="example.com" aria-label="Reference link" inputMode="url" className={`${inputClass} h-10 text-[14px]`} />
          <button type="submit" disabled={pending || !url.trim()} className={`${btn.secondary} h-10 px-4 text-[14px]`}>
            {pending ? <MiniSpin /> : null}
            {pending ? 'Reading…' : 'Read'}
          </button>
        </form>
      ) : (
        <div>
          <input ref={file} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden onChange={(e) => e.target.files?.[0] && fromFile(e.target.files[0])} />
          <button type="button" disabled={pending} onClick={() => file.current?.click()} className={`${btn.secondary} h-10 px-4 text-[14px]`}>
            {pending ? <MiniSpin /> : <tab.Icon size={15} />}
            {pending ? 'Reading…' : `Choose a ${source}`}
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="m-0 text-[13px] text-danger">
          {error}
        </p>
      )}
      {result && !error && (
        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3 text-[13px]" aria-live="polite">
          <div className="flex">
            {[result.style.theme.colors.background, result.style.theme.colors.text, ...result.style.swatches].slice(0, 6).map((c, i) => (
              <span key={i} title={c} style={{ background: c }} className="-mr-1.5 size-6 rounded-full border-2 border-surface" />
            ))}
          </div>
          <span className="min-w-0 flex-1 pl-2">
            From <span className="font-medium">{result.label}</span>: closest to <span className="font-medium">{PRESETS[result.style.suggested].name}</span> ({result.style.reasons.join(', ')}). Fonts:{' '}
            {result.style.theme.fonts.heading} and {result.style.theme.fonts.body}.
            {result.style.look.length > 0 && <> Also: {result.style.look.join(', ')}.</>}
          </span>
        </div>
      )}
    </div>
  );
}
