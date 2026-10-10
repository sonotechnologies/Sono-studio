'use client';

/* eslint-disable @next/next/no-img-element */
import { History, ImagePlus, Search, Upload, X } from 'lucide-react';
import { useEffect, useRef, useState, useTransition } from 'react';
import { MiniSpin } from '@/components/orbit';
import { btn, inputClass } from '@/components/ui';
import type { Asset } from '@/generate/brief';
import { prepareUpload } from '@/generate/browser-images';
import type { StockPhoto } from '@/generate/stock';
import type { VersionInfo } from '@/lib/data/repo';
import { timeAgo } from '@/lib/format';
import type { SiteImage } from '@/site/schema';
import { addStockAssetAction, listVersionsAction, stockSearchAction } from './actions';

function Dialog({ title, icon, onClose, children, wide = false }: { title: string; icon: React.ReactNode; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div onClick={onClose} className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(22,20,15,.45)] sm:items-center sm:p-5">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={`flex max-h-[88dvh] w-full animate-fade-up flex-col overflow-hidden rounded-t-[18px] border border-border bg-raised shadow-raised sm:rounded-dialog ${wide ? 'sm:w-[760px]' : 'sm:w-[460px]'}`}
      >
        <div className="flex flex-none items-center gap-2.5 border-b border-border py-3 pr-3 pl-5">
          <span className="text-muted">{icon}</span>
          <h2 className="m-0 flex-1 text-[17px] font-semibold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="flex size-9 cursor-pointer items-center justify-center rounded-full text-muted hover:bg-hover hover:text-text">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ---------- Media library ---------- */

export function MediaDialog({
  projectId,
  assets,
  onAssetAdded,
  stockSearch,
  current,
  kind,
  onPick,
  onClose,
}: {
  projectId: string;
  assets: Asset[];
  onAssetAdded: (a: Asset) => void;
  stockSearch: boolean;
  current: SiteImage | null;
  kind: 'photo' | 'logo';
  onPick: (image: SiteImage) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'project' | 'stock'>('project');
  const [query, setQuery] = useState(current?.alt ?? '');
  const [results, setResults] = useState<StockPhoto[] | null>(null);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [pending, start] = useTransition();
  const file = useRef<HTMLInputElement>(null);
  const shown = assets.filter((a) => (kind === 'logo' ? a.kind === 'logo' : true));

  const pickAsset = (a: Asset) => onPick({ src: a.url, alt: current?.alt || a.alt, ...(a.credit ? { credit: a.credit } : {}) });

  const upload = async (f: File) => {
    setError('');
    setUploading(true);
    try {
      if (!/^image\/(jpeg|png|webp|svg\+xml)$/.test(f.type)) throw new Error('Use JPG, PNG or WebP');
      const prepared = await prepareUpload(f, kind);
      const form = new FormData();
      form.set('file', new File([prepared.blob], prepared.name, { type: prepared.blob.type || f.type }));
      form.set('kind', kind);
      form.set('alt', f.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '));
      form.set('width', String(prepared.width));
      form.set('height', String(prepared.height));
      const res = await fetch(`/api/projects/${projectId}/assets`, { method: 'POST', body: form });
      const data = (await res.json()) as { asset?: Asset; error?: string };
      if (!res.ok || !data.asset) throw new Error(data.error ?? 'Upload failed');
      onAssetAdded(data.asset);
      pickAsset(data.asset);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const search = () =>
    start(async () => {
      setError('');
      const r = await stockSearchAction(query);
      if (r.error) setError(r.error);
      setResults(r.photos ?? []);
    });

  const pickStock = (p: StockPhoto) =>
    start(async () => {
      try {
        const asset = await addStockAssetAction(projectId, p);
        onAssetAdded(asset);
        pickAsset(asset);
      } catch (err) {
        setError((err as Error).message);
      }
    });

  const tile = 'relative aspect-[4/3] cursor-pointer overflow-hidden rounded-[10px] border border-border bg-sel hover:ring-2 hover:ring-terracotta focus-visible:ring-2 focus-visible:ring-terracotta outline-none';

  return (
    <Dialog title={kind === 'logo' ? 'Choose a logo' : 'Choose a photo'} icon={<ImagePlus size={18} />} onClose={onClose} wide>
      <div className="flex flex-none flex-wrap items-center gap-2 px-5 pt-4">
        {kind === 'photo' && (
          <div className="flex rounded-full bg-sel p-[3px]">
            {(['project', 'stock'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`h-8 cursor-pointer rounded-full px-3.5 text-[13px] font-medium ${tab === t ? 'bg-surface text-text shadow-[0_1px_3px_rgba(0,0,0,.12)]' : 'text-muted hover:text-text'}`}
              >
                {t === 'project' ? 'This project' : 'Stock photos'}
              </button>
            ))}
          </div>
        )}
        <span className="flex-1" />
        <input ref={file} type="file" accept={kind === 'logo' ? 'image/png,image/jpeg,image/webp,image/svg+xml' : 'image/png,image/jpeg,image/webp'} hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        <button type="button" disabled={uploading} onClick={() => file.current?.click()} className={`${btn.secondary} h-9 px-3.5 text-[13px]`}>
          {uploading ? <MiniSpin /> : <Upload size={15} />}
          {uploading ? 'Uploading…' : 'Upload'}
        </button>
      </div>
      {error && <p className="m-0 px-5 pt-3 text-[13px] text-danger">{error}</p>}
      <div className="min-h-[240px] flex-1 overflow-auto p-5">
        {tab === 'project' ? (
          shown.length ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2.5">
              {shown.map((a) => (
                <button key={a.id} type="button" onClick={() => pickAsset(a)} className={`${tile} ${current?.src === a.url ? 'ring-2 ring-terracotta' : ''}`} title={a.alt}>
                  <img src={a.url} alt={a.alt} loading="lazy" className={`absolute inset-0 size-full ${a.kind === 'logo' ? 'object-contain p-3' : 'object-cover'}`} />
                </button>
              ))}
            </div>
          ) : (
            <p className="m-0 py-10 text-center text-[14px] text-muted">No {kind === 'logo' ? 'logo' : 'photos'} yet. Upload one{kind === 'photo' ? ' or search stock photos' : ''}.</p>
          )
        ) : !stockSearch ? (
          <p className="m-0 py-10 text-center text-[14px] text-muted">
            Add an Unsplash or Pexels key in{' '}
            <a href="/settings?tab=connections" className="font-medium text-accent-text hover:underline">
              Settings → Connections
            </a>{' '}
            to search stock photos.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                search();
              }}
              className="flex gap-2"
            >
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. cosy restaurant interior" className={`${inputClass} h-10 text-[14px]`} aria-label="Search stock photos" />
              <button type="submit" disabled={pending || !query.trim()} className={`${btn.primary} h-10 px-4 text-[14px]`}>
                {pending ? <MiniSpin /> : <Search size={15} />}
                Search
              </button>
            </form>
            {results && !results.length && !pending && <p className="m-0 text-center text-[14px] text-muted">Nothing found. Try simpler words.</p>}
            {results && results.length > 0 && (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2.5">
                {results.map((p) => (
                  <button key={p.url} type="button" disabled={pending} onClick={() => pickStock(p)} className={tile} title={`${p.alt} · ${p.credit}`}>
                    <img src={`${p.url}${p.url.includes('?') ? '&' : '?'}w=400`} alt={p.alt} loading="lazy" className="absolute inset-0 size-full object-cover" />
                    <span className="absolute inset-x-0 bottom-0 truncate bg-[rgba(22,20,15,.55)] px-2 py-1 text-left text-[10px] text-white">{p.credit}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
}

/* ---------- Version history ---------- */

export function HistoryDialog({
  projectId,
  current,
  onRestore,
  onClose,
}: {
  projectId: string;
  current: number;
  onRestore: (version: number) => Promise<void>;
  onClose: () => void;
}) {
  const [versions, setVersions] = useState<VersionInfo[] | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    listVersionsAction(projectId).then(setVersions, (e: Error) => setError(e.message));
  }, [projectId, current]);
  const now = Date.now();

  return (
    <Dialog title="Version history" icon={<History size={18} />} onClose={onClose}>
      <p className="m-0 px-5 pt-4 text-[13px] text-muted">Every save is kept. Restoring copies an old version to the top, so nothing is lost.</p>
      {error && <p className="m-0 px-5 pt-3 text-[13px] text-danger">{error}</p>}
      <ul className="m-0 flex min-h-[200px] list-none flex-col gap-0.5 overflow-auto p-3">
        {!versions && !error && (
          <li className="flex justify-center p-8">
            <MiniSpin />
          </li>
        )}
        {versions?.map((v) => (
          <li key={v.version} className="flex items-center gap-3 rounded-[10px] px-2.5 py-2 hover:bg-hover">
            <span className="w-9 flex-none font-mono text-[12px] text-muted">v{v.version}</span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[14px]">{v.summary || 'Saved'}</span>
              <span className="text-[12px] text-muted">{timeAgo(v.createdAt, now)}</span>
            </span>
            {v.version === current ? (
              <span className="rounded-full bg-sel px-2.5 py-1 text-[12px] font-medium text-muted">Current</span>
            ) : (
              <button
                type="button"
                disabled={busy !== null}
                onClick={async () => {
                  setBusy(v.version);
                  try {
                    await onRestore(v.version);
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(null);
                  }
                }}
                className={`${btn.secondary} h-8 px-3 text-[13px]`}
              >
                {busy === v.version ? <MiniSpin /> : null}
                Restore
              </button>
            )}
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
