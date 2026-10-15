'use client';

import { ArrowLeft, ExternalLink, ImagePlus, Link2, MousePointerClick, RotateCcw, Sparkles, Type } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { MiniSpin } from '@/components/orbit';
import { btn, inputClass, Segmented, useToast } from '@/components/ui';
import type { Asset } from '@/generate/brief';
import { prepareUpload } from '@/generate/browser-images';
import { tidy, type CopyEdit } from '@/mirror/edit';
import { pagesWithTextAction, saveCopyEditsAction } from './actions';
import { CopyAiPanel } from './ai-panel';

/*
 * The copy shown with its scripts off (as in the preview), each text, picture
 * and link marked by the server. Clicking one opens it in the side panel;
 * typing updates the page at once and saves a moment later. Edits replace
 * only those characters in the original HTML, so the layout can't change.
 */

type PageInfo = { path: string; title: string };
type TextField = { index: number; value: string; from: string; everywhere: boolean };
type Selection = {
  page: string;
  texts: TextField[];
  image: { index: number; src: string; from: string; alt: string } | null;
  link: { index: number; href: string; from: string } | null;
};

/** Hover and selection outlines, added to the page in the frame (outlines don't move anything). */
const HIGHLIGHT = `
[data-sono-t]:hover, [data-sono-img]:hover { outline: 2px dashed rgba(200, 90, 60, .7) !important; outline-offset: 2px; cursor: pointer !important; }
[data-sono-selected] { outline: 2px solid #c85a3c !important; outline-offset: 2px; }
`;

const keyOf = (e: Pick<CopyEdit, 'page' | 'kind' | 'index'>) => `${e.page}|${e.kind}|${e.index}`;
const directTexts = (el: Element) => [...el.childNodes].filter((n) => n.nodeType === 3 && n.nodeValue?.trim()) as Text[];
const indicesOf = (el: Element) => (el.getAttribute('data-sono-t') ?? '').split(' ').filter(Boolean).map(Number);

export function CopyEditor({ projectId, name, pages, initialEdits, stale, startPage }: { projectId: string; name: string; pages: PageInfo[]; initialEdits: CopyEdit[]; stale: number[]; startPage: string }) {
  const toast = useToast();
  const [page, setPage] = useState(startPage);
  const [edits, setEdits] = useState(initialEdits);
  const [staleEdits, setStaleEdits] = useState(() => stale.map((i) => initialEdits[i]));
  const [sel, setSel] = useState<Selection | null>(null);
  const [device, setDevice] = useState<'desktop' | 'phone'>('desktop');
  const [saving, setSaving] = useState<'idle' | 'pending' | 'saving' | 'saved' | 'error'>('idle');
  const [frameKey, setFrameKey] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [others, setOthers] = useState<Record<number, string[]>>({});
  const [tab, setTab] = useState<'edit' | 'ai'>('edit');
  const frame = useRef<HTMLIFrameElement>(null);
  const editsRef = useRef(edits);
  editsRef.current = edits;
  const file = useRef<HTMLInputElement>(null);

  /* ---------- Saving: a moment after the last change, one save at a time ---------- */
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef<Promise<unknown> | null>(null);
  const save = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    while (inFlight.current) await inFlight.current;
    setSaving('saving');
    const run = saveCopyEditsAction(projectId, editsRef.current)
      .then((r) => {
        if (r.error) throw new Error(r.error);
        setSaving((s) => (s === 'saving' ? 'saved' : s));
      })
      .catch((err: Error) => {
        setSaving('error');
        toast(err.message || 'Couldn’t save. Check your connection.');
      })
      .finally(() => (inFlight.current = null));
    inFlight.current = run;
    await run;
  }, [projectId, toast]);
  const change = (next: CopyEdit[]) => {
    setEdits(next);
    editsRef.current = next;
    setSaving('pending');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(save, 700);
  };
  // Leaving with a change not yet saved: save it now, and warn if it can't finish.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (timer.current || inFlight.current) {
        void save();
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [save]);

  /* ---------- The page in the frame ---------- */
  const doc = () => frame.current?.contentDocument ?? null;
  const textEl = (index: number) => [...(doc()?.querySelectorAll('[data-sono-t]') ?? [])].find((el) => indicesOf(el).includes(index)) ?? null;

  const select = useCallback(
    (target: Element) => {
      const d = doc();
      if (!d) return;
      const current = editsRef.current;
      d.querySelectorAll('[data-sono-selected]').forEach((el) => el.removeAttribute('data-sono-selected'));
      // The clicked words, widened to the whole line or paragraph when they're inside one (a bold word in a heading).
      let block = target.closest('[data-sono-t]');
      while (block && d.defaultView?.getComputedStyle(block).display === 'inline' && block.parentElement?.closest('[data-sono-t]')) block = block.parentElement.closest('[data-sono-t]');
      const texts: TextField[] = [];
      if (block) {
        const els = [block, ...block.querySelectorAll('[data-sono-t]')];
        for (const el of els) {
          const nodes = directTexts(el);
          indicesOf(el).forEach((index, i) => {
            const value = tidy(nodes[i]?.nodeValue ?? '');
            const own = current.find((e) => e.kind === 'text' && e.page === page && e.index === index);
            const all = !own ? current.find((e) => e.kind === 'text' && e.page === '*' && tidy(e.to) === value) : undefined;
            texts.push({ index, value, from: (own ?? all)?.from ?? value, everywhere: !!all });
          });
        }
        texts.sort((a, b) => a.index - b.index);
        texts.splice(30);
      }
      const img = target.closest('[data-sono-img]') as HTMLImageElement | null;
      const a = target.closest('[data-sono-a]');
      const image = img
        ? (() => {
            const index = Number(img.getAttribute('data-sono-img'));
            const own = current.find((e) => e.kind === 'image' && e.page === page && e.index === index) as Extract<CopyEdit, { kind: 'image' }> | undefined;
            const src = img.getAttribute('src') ?? img.getAttribute('data-src') ?? '';
            return { index, src: img.currentSrc || src, from: own?.from ?? src, alt: img.getAttribute('alt') ?? '' };
          })()
        : null;
      const link = a
        ? (() => {
            const index = Number(a.getAttribute('data-sono-a'));
            const own = current.find((e) => e.kind === 'link' && e.page === page && e.index === index);
            const href = a.getAttribute('href') ?? '';
            return { index, href, from: own?.from ?? href };
          })()
        : null;
      if (!texts.length && !image && !link) {
        setSel(null);
        return;
      }
      (img ?? block ?? a)?.setAttribute('data-sono-selected', '');
      setSel({ page, texts: image && !block ? [] : texts, image, link });
    },
    [page],
  );

  const onFrameLoad = () => {
    const d = doc();
    if (!d) return;
    const style = d.createElement('style');
    style.textContent = HIGHLIGHT;
    d.head?.appendChild(style);
    // Clicks choose what to edit instead of following links or pressing buttons.
    d.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.target instanceof d.defaultView!.Element) select(e.target);
      },
      true,
    );
    d.addEventListener('submit', (e) => e.preventDefault(), true);
    setSel(null);
  };

  /* ---------- Changing things ---------- */
  const setText = (field: TextField, to: string, everywhere = field.everywhere) => {
    const el = textEl(field.index);
    if (el) {
      const node = directTexts(el)[indicesOf(el).indexOf(field.index)];
      if (node) {
        const v = node.nodeValue ?? '';
        node.nodeValue = `${/^\s*/.exec(v)![0]}${to.trim() || ' '}${/\s*$/.exec(v)![0]}`;
      }
    }
    setSel((s) => s && { ...s, texts: s.texts.map((t) => (t.index === field.index ? { ...t, value: to, everywhere } : t)) });
    let next = editsRef.current.filter((e) => !(e.kind === 'text' && e.page === page && e.index === field.index));
    // An "every page" change is kept per original text: replace the one for this text, if any.
    next = next.filter((e) => !(e.kind === 'text' && e.page === '*' && tidy(e.from) === tidy(field.from)));
    if (tidy(to) !== tidy(field.from)) next.push({ kind: 'text', page: everywhere ? '*' : page, index: field.index, from: field.from, to });
    change(next);
  };

  const setImage = (img: NonNullable<Selection['image']>, patch: { src?: string; alt?: string }) => {
    const el = doc()?.querySelector(`[data-sono-img="${img.index}"]`) as HTMLImageElement | null;
    if (el && patch.src) {
      el.removeAttribute('srcset');
      el.parentElement?.tagName === 'PICTURE' && el.parentElement.querySelectorAll('source').forEach((s) => s.remove());
      el.src = patch.src;
    }
    if (el && patch.alt !== undefined) el.alt = patch.alt;
    const prev = editsRef.current.find((e) => e.kind === 'image' && e.page === page && e.index === img.index) as Extract<CopyEdit, { kind: 'image' }> | undefined;
    const merged: CopyEdit = { kind: 'image', page, index: img.index, from: img.from, ...(prev?.src ? { src: prev.src } : {}), ...(prev?.alt !== undefined ? { alt: prev.alt } : {}), ...patch };
    setSel((s) => s && s.image && { ...s, image: { ...s.image, ...(patch.src ? { src: patch.src } : {}), ...(patch.alt !== undefined ? { alt: patch.alt } : {}) } });
    change([...editsRef.current.filter((e) => keyOf(e) !== keyOf(merged)), merged]);
  };

  const setLink = (link: NonNullable<Selection['link']>, href: string) => {
    doc()?.querySelector(`[data-sono-a="${link.index}"]`)?.setAttribute('href', href);
    setSel((s) => s && s.link && { ...s, link: { ...s.link, href } });
    const rest = editsRef.current.filter((e) => !(e.kind === 'link' && e.page === page && e.index === link.index));
    change(href.trim() === link.from || !href.trim() ? rest : [...rest, { kind: 'link', page, index: link.index, from: link.from, href: href.trim() }]);
  };

  const upload = async (img: NonNullable<Selection['image']>, f: File) => {
    setUploading(true);
    try {
      if (!/^image\/(jpeg|png|webp)$/.test(f.type)) throw new Error('Use a JPG, PNG or WebP picture.');
      const prepared = await prepareUpload(f, 'photo');
      const form = new FormData();
      form.set('file', new File([prepared.blob], prepared.name, { type: prepared.blob.type || f.type }));
      form.set('kind', 'photo');
      form.set('alt', img.alt || f.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '));
      form.set('width', String(prepared.width));
      form.set('height', String(prepared.height));
      const res = await fetch(`/api/projects/${projectId}/assets`, { method: 'POST', body: form });
      const data = (await res.json()) as { asset?: Asset; error?: string };
      if (!res.ok || !data.asset) throw new Error(data.error ?? 'Upload failed');
      setImage(img, { src: data.asset.url });
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setUploading(false);
    }
  };

  /** Undoing a change: saved straight away, then the page is reloaded with the changes that are left. */
  const revert = async (gone: CopyEdit[]) => {
    const drop = new Set(gone);
    const next = editsRef.current.filter((e) => !drop.has(e));
    setEdits(next);
    editsRef.current = next;
    setStaleEdits((s) => s.filter((e) => !drop.has(e)));
    await save();
    setSel(null);
    setFrameKey((k) => k + 1);
  };

  /** Waits for any change still being saved. */
  const flush = async () => {
    if (timer.current) await save();
    while (inFlight.current) await inFlight.current;
  };

  /** Changes from the AI (already saved), or its changes undone (saved here); the page reloads to show them. */
  const fromAi = async (next: CopyEdit[], persist: boolean) => {
    setEdits(next);
    editsRef.current = next;
    if (persist) await save();
    else setSaving('saved');
    setSel(null);
    setFrameKey((k) => k + 1);
  };

  const goTo = async (p: string) => {
    if (timer.current) await save();
    setPage(p);
    setSel(null);
    window.history.replaceState(null, '', `?page=${encodeURIComponent(p)}`);
  };

  // Whether the selected texts also appear on other pages, for "every page".
  useEffect(() => {
    if (!sel) return;
    let live = true;
    for (const t of sel.texts) {
      if (others[t.index] !== undefined || t.from.length > 300) continue;
      pagesWithTextAction(projectId, t.from)
        .then((list) => live && setOthers((o) => ({ ...o, [t.index]: list.filter((p) => p !== page) })))
        .catch(() => {});
    }
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel?.texts.map((t) => t.index).join(','), page]);
  useEffect(() => setOthers({}), [page]);

  const pageTitle = (p: string) => (p === '*' ? 'Every page' : (pages.find((x) => x.path === p)?.title ?? p));
  const status = { idle: '', pending: 'Unsaved…', saving: 'Saving…', saved: 'Saved', error: 'Not saved' }[saving];
  const describe = (e: CopyEdit) =>
    e.kind === 'text' ? `“${tidy(e.from).slice(0, 40)}” → “${tidy(e.to).slice(0, 40)}”` : e.kind === 'image' ? (e.src ? 'Picture replaced' : `Picture description: “${(e.alt ?? '').slice(0, 40)}”`) : `Link → ${e.href.slice(0, 50)}`;

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-bg text-text">
      <header className="flex h-14 flex-none items-center gap-3 border-b border-border px-3 md:px-4">
        <Link href={`/projects/${projectId}`} className={`${btn.ghost} h-9 px-2.5 text-[14px]`} aria-label="Back to the project">
          <ArrowLeft size={16} />
          <span className="hidden sm:inline">{name}</span>
        </Link>
        <select
          value={page}
          onChange={(e) => void goTo(e.target.value)}
          aria-label="Page"
          className={`${inputClass} h-9 max-w-[260px] min-w-0 flex-1 text-[14px] sm:flex-none`}
        >
          {pages.map((p) => (
            <option key={p.path} value={p.path}>
              {p.title || p.path} · {p.path}
            </option>
          ))}
        </select>
        <div className="flex-1" />
        <span className={`hidden text-[13px] sm:inline ${saving === 'error' ? 'text-danger' : 'text-muted'}`} aria-live="polite">
          {status}
        </span>
        <Segmented
          value={device}
          onChange={setDevice}
          label="Preview size"
          options={[
            { value: 'desktop', label: 'Desktop' },
            { value: 'phone', label: 'Phone' },
          ]}
        />
        <a href={`/copy/${projectId}/${page}`} target="_blank" rel="noreferrer" className={`${btn.secondary} hidden h-9 px-3 text-[14px] md:inline-flex`}>
          Preview <ExternalLink size={14} />
        </a>
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <main className="flex min-h-0 flex-1 justify-center overflow-hidden bg-stage p-2 md:p-4">
          <iframe
            key={`${page}:${frameKey}`}
            ref={frame}
            src={`/copy/${projectId}/${page}?edit=1`}
            onLoad={onFrameLoad}
            title="The copied site"
            className={`h-full rounded-lg border border-border bg-white shadow-sm ${device === 'phone' ? 'w-[390px] max-w-full' : 'w-full'}`}
          />
        </main>

        <aside className="flex max-h-[50dvh] flex-none flex-col border-t border-border md:max-h-none md:w-[360px] md:border-t-0 md:border-l">
          <div role="tablist" aria-label="Panel" className="flex flex-none gap-1 border-b border-border px-3 py-2">
            {(
              [
                ['edit', 'Edit', MousePointerClick],
                ['ai', 'Ask AI', Sparkles],
              ] as const
            ).map(([id, label, Icon]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={`flex h-8 cursor-pointer items-center gap-1.5 rounded-full px-3 text-[13px] font-medium ${tab === id ? 'bg-sel text-text' : 'text-muted hover:bg-hover'}`}
              >
                <Icon size={14} /> {label}
              </button>
            ))}
          </div>
          <CopyAiPanel
            projectId={projectId}
            page={page}
            pageTitle={pageTitle(page)}
            selected={sel?.page === page ? sel.texts.map((t) => t.index) : []}
            hidden={tab !== 'ai'}
            getEdits={() => editsRef.current}
            flush={flush}
            onEdits={fromAi}
          />
          <div className={`flex min-h-0 flex-col gap-5 overflow-y-auto p-4 ${tab === 'edit' ? '' : 'hidden'}`}>
            {!sel ? (
              <div className="flex flex-col gap-2 text-[14px] text-muted">
                <p className="m-0 flex items-center gap-2 font-semibold text-text">
                  <MousePointerClick size={16} /> Click anything to change it
                </p>
                <p className="m-0">Click a piece of text, a picture or a link in the page. Your changes save by themselves and go into the export and the next deploy.</p>
                <p className="m-0 text-[13px]">The layout, styles and scripts stay exactly as copied. Pictures set in the CSS (backgrounds) can’t be swapped here.</p>
              </div>
            ) : (
              <>
                {sel.texts.length > 0 && (
                  <section className="flex flex-col gap-3">
                    <h2 className="m-0 flex items-center gap-2 text-[14px] font-semibold">
                      <Type size={15} /> Text
                    </h2>
                    {sel.texts.map((t) => (
                      <div key={t.index} className="flex flex-col gap-1.5">
                        <textarea
                          value={t.value}
                          onChange={(e) => setText(t, e.target.value)}
                          rows={Math.min(8, Math.max(1, Math.ceil(t.value.length / 34)))}
                          aria-label="Text"
                          className={`${inputClass} resize-y py-2 text-[14px] leading-snug`}
                        />
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
                          {(others[t.index]?.length ?? 0) > 0 && (
                            <label className="flex cursor-pointer items-center gap-1.5">
                              <input type="checkbox" checked={t.everywhere} onChange={(e) => setText(t, t.value, e.target.checked)} className="accent-terracotta" />
                              Change it on every page ({others[t.index].length + 1})
                            </label>
                          )}
                          {tidy(t.value) !== tidy(t.from) && (
                            <button type="button" onClick={() => setText(t, t.from, false)} className="inline-flex cursor-pointer items-center gap-1 text-accent-text hover:underline">
                              <RotateCcw size={11} /> Original
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </section>
                )}

                {sel.image && (
                  <section className="flex flex-col gap-3">
                    <h2 className="m-0 flex items-center gap-2 text-[14px] font-semibold">
                      <ImagePlus size={15} /> Picture
                    </h2>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={sel.image.src.startsWith('http') || sel.image.src.startsWith('/') ? sel.image.src : `/copy/${projectId}/${sel.image.src}`} alt="" className="max-h-40 w-full rounded-lg border border-border bg-stage object-contain" />
                    <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => e.target.files?.[0] && void upload(sel.image!, e.target.files[0])} />
                    <button type="button" disabled={uploading} onClick={() => file.current?.click()} className={`${btn.secondary} h-10 text-[14px]`}>
                      {uploading ? <MiniSpin /> : <ImagePlus size={15} />} {uploading ? 'Uploading…' : 'Replace picture'}
                    </button>
                    <label className="flex flex-col gap-1.5 text-[13px] font-medium">
                      Description (for screen readers and Google)
                      <input value={sel.image.alt} onChange={(e) => setImage(sel.image!, { alt: e.target.value })} className={`${inputClass} h-10 text-[14px] font-normal`} />
                    </label>
                  </section>
                )}

                {sel.link && (
                  <section className="flex flex-col gap-2">
                    <h2 className="m-0 flex items-center gap-2 text-[14px] font-semibold">
                      <Link2 size={15} /> Link
                    </h2>
                    <input
                      value={sel.link.href}
                      onChange={(e) => setLink(sel.link!, e.target.value)}
                      list="copy-pages"
                      aria-label="Link address"
                      placeholder="https://… or a page"
                      className={`${inputClass} h-10 font-mono text-[13px]`}
                    />
                    <datalist id="copy-pages">
                      {pages.map((p) => (
                        <option key={p.path} value={p.path}>
                          {p.title}
                        </option>
                      ))}
                    </datalist>
                    <p className="m-0 text-[12px] text-muted">A page of the site (like about.html), a web address, mailto: or tel:. For WhatsApp: https://wa.me/234…</p>
                  </section>
                )}
                <button type="button" onClick={() => (doc()?.querySelectorAll('[data-sono-selected]').forEach((el) => el.removeAttribute('data-sono-selected')), setSel(null))} className={`${btn.ghost} h-9 self-start px-3 text-[13px]`}>
                  Done
                </button>
              </>
            )}

            {staleEdits.length > 0 && (
              <section className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-3 text-[13px]">
                <p className="m-0 font-semibold">
                  {staleEdits.length} change{staleEdits.length === 1 ? '' : 's'} no longer fit{staleEdits.length === 1 ? 's' : ''}
                </p>
                <p className="m-0 text-muted">The site was copied again and {staleEdits.length === 1 ? 'that spot' : 'those spots'} changed, so {staleEdits.length === 1 ? 'it’s' : 'they’re'} left out. Make {staleEdits.length === 1 ? 'it' : 'them'} again if needed.</p>
                <button type="button" onClick={() => void revert(staleEdits)} className={`${btn.secondary} h-9 self-start px-3 text-[13px]`}>
                  Clear {staleEdits.length === 1 ? 'it' : 'them'}
                </button>
              </section>
            )}

            {edits.length > 0 && (
              <section className="flex flex-col gap-2">
                <h2 className="m-0 text-[13px] font-semibold text-muted">Your changes ({edits.length})</h2>
                <ul className="m-0 flex list-none flex-col gap-1 p-0">
                  {[...edits].reverse().slice(0, 50).map((e) => (
                    <li key={keyOf(e) + (e.kind === 'text' ? e.from : '')} className="flex items-start gap-2 rounded-lg px-2 py-1.5 text-[13px] hover:bg-hover">
                      <div className="min-w-0 flex-1">
                        <div className="truncate">{describe(e)}</div>
                        <button type="button" onClick={() => e.page !== '*' && e.page !== page && void goTo(e.page)} className="cursor-pointer text-[12px] text-muted hover:underline">
                          {pageTitle(e.page)}
                        </button>
                      </div>
                      <button type="button" onClick={() => void revert([e])} title="Undo this change" aria-label="Undo this change" className="cursor-pointer rounded p-1 text-muted hover:bg-hover hover:text-text">
                        <RotateCcw size={13} />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
