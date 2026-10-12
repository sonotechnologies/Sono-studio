'use client';

import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronLeft,
  CloudOff,
  Download,
  Eye,
  EyeOff,
  FileText,
  GripVertical,
  History,
  Monitor,
  PanelLeft,
  Plus,
  Redo2,
  Share2,
  Smartphone,
  Tablet,
  Undo2,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Logo } from '@/components/logo';
import { MiniSpin } from '@/components/orbit';
import { NAV } from '@/components/shell';
import { ThemeToggle } from '@/components/theme';
import { StatusPill, useToast } from '@/components/ui';
import type { ChatScope } from '@/ai/chat';
import type { Asset } from '@/generate/brief';
import { addableTypes } from '@/generate/plan';
import type { ChatMessage, CustomStyle, Deployment } from '@/lib/data/repo';
import { saveStyleAction } from '@/app/(app)/presets/actions';
import { handoverChecklist } from '@/export/checklist';
import { cardProviders, depositProviders } from '@/site/store/payments-info';
import { DeployDialog, fetchDeployment } from '@/components/deploy-dialog';
import { PRESETS } from '@/lib/presets';
import type { Project } from '@/lib/types';
import { SECTIONS } from '@/site/registry';
import type { SectionType, SiteConfig, SiteImage, SiteTheme } from '@/site/schema';
import {
  applyLayouts,
  duplicateSection,
  findSection,
  getIn,
  insertSection,
  moveSection,
  newSection,
  removeSection,
  revertChange,
  sectionLabel,
  setField,
  setIn,
  setVariant,
  syncShared,
  toggleHidden,
} from '@/workspace/model';
import { addShop, saveProduct } from '@/workspace/store';
import type { AiMode } from '../new/setup-flow';
import { chatAction, restoreVersionAction, saveSiteAction } from './actions';
import { ChatPanel, type ChatView } from './chat-panel';
import { HistoryDialog, MediaDialog } from './dialogs';
import type { FieldCtx } from './fields';
import { EditPanel, ThemePanel } from './panels';
import { ProductsPanel } from './products-panel';
import { BookingsPanel } from './bookings-panel';
import { addBookings } from '@/workspace/bookings';
import { Stage, type Device } from './stage';

type Tab = 'chat' | 'edit' | 'theme' | 'products' | 'bookings';
type SaveState = 'saved' | 'unsaved' | 'saving' | 'error';
type ScopeKind = ChatScope['kind'];

const SAVE_DELAY_MS = 1200;
const HISTORY_LIMIT = 100;
const iconBtn = 'flex size-[34px] flex-none cursor-pointer items-center justify-center rounded-full text-text hover:bg-hover disabled:cursor-default disabled:opacity-35 disabled:hover:bg-transparent';

/** First and last positions a section may take on its page: the navbar stays on top and the footer at the bottom. */
function bounds(sections: { type: SectionType }[]) {
  const nav = sections.findIndex((s) => s.type === 'navbar');
  const foot = sections.findIndex((s) => s.type === 'footer');
  return { min: nav + 1, max: (foot >= 0 ? foot : sections.length) - 1 };
}

export function Workspace({
  project,
  initialConfig,
  initialVersion,
  initialAssets,
  initialMessages,
  aiMode,
  stockSearch,
  pitchLink,
  deploy,
  styles: initialStyles,
  testKeys,
}: {
  project: Project;
  initialConfig: SiteConfig;
  initialVersion: number;
  initialAssets: Asset[];
  initialMessages: ChatMessage[];
  aiMode: AiMode;
  stockSearch: boolean;
  pitchLink: string;
  deploy: { hasVercel: boolean; hasGithub: boolean; latest: Deployment | null };
  styles: CustomStyle[];
  /** Which of your test payment keys are set, for the Products tab. */
  testKeys: { paystack: boolean; stripe: boolean };
}) {
  const toast = useToast();
  const projectId = project.id;
  const [deployOpen, setDeployOpen] = useState(false);
  const [deployment, setDeployment] = useState(deploy.latest);
  const [styles, setStyles] = useState(initialStyles);

  /* ----- The config, with undo and redo ----- */
  const [config, setConfig] = useState(initialConfig);
  const configRef = useRef(initialConfig);
  const hist = useRef<{ past: SiteConfig[]; future: SiteConfig[] }>({ past: [], future: [] });
  const lastCoalesce = useRef<{ key: string; at: number } | null>(null);
  const [, rerender] = useReducer((x: number) => x + 1, 0);

  /* ----- Autosave ----- */
  const [version, setVersion] = useState(initialVersion);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [saveError, setSaveError] = useState('');
  const pendingSummaries = useRef<string[]>([]);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const inflight = useRef<Promise<void>>(Promise.resolve());
  const lastSaved = useRef(JSON.stringify(initialConfig));

  const flush = useCallback(async (): Promise<void> => {
    clearTimeout(saveTimer.current);
    await inflight.current;
    if (!pendingSummaries.current.length) return;
    const summary = [...new Set(pendingSummaries.current)].slice(0, 6).join(', ');
    pendingSummaries.current = [];
    const config = configRef.current;
    const json = JSON.stringify(config);
    // An undo followed by a redo, or an edit typed back to what it was, needs no new version.
    if (json === lastSaved.current) return setSaveState('saved');
    setSaveState('saving');
    const run = saveSiteAction(projectId, config, summary)
      .then((r) => {
        if (r.error) {
          setSaveState('error');
          setSaveError(r.error);
          return;
        }
        setVersion(r.version!);
        lastSaved.current = json;
        setSaveError('');
        setSaveState(pendingSummaries.current.length ? 'unsaved' : 'saved');
      })
      .catch(() => {
        pendingSummaries.current.unshift(summary);
        setSaveState('error');
        setSaveError('Couldn’t reach the server. Your changes are kept here; retrying when you edit again.');
      });
    inflight.current = run;
    await run;
  }, [projectId]);

  const queueSave = useCallback(
    (summary: string) => {
      pendingSummaries.current.push(summary);
      setSaveState('unsaved');
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => void flush(), SAVE_DELAY_MS);
    },
    [flush],
  );

  useEffect(() => {
    const onLeave = (e: BeforeUnloadEvent) => {
      if (pendingSummaries.current.length) e.preventDefault();
    };
    const onHide = () => document.visibilityState === 'hidden' && void flush();
    window.addEventListener('beforeunload', onLeave);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('beforeunload', onLeave);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [flush]);

  const apply = (next: SiteConfig) => {
    configRef.current = next;
    setConfig(next);
  };

  /**
   * Every change goes through here. Rapid changes to the same thing (typing a
   * colour, dragging a slider) collapse into one undo step.
   */
  const commit = (next: SiteConfig, summary: string, opts: { coalesce?: string; savedAs?: number } = {}) => {
    const prev = configRef.current;
    if (next === prev) return;
    const now = Date.now();
    const merge = !!opts.coalesce && lastCoalesce.current?.key === opts.coalesce && now - lastCoalesce.current.at < 1500;
    lastCoalesce.current = opts.coalesce ? { key: opts.coalesce, at: now } : null;
    hist.current = { past: merge ? hist.current.past : [...hist.current.past.slice(-HISTORY_LIMIT + 1), prev], future: [] };
    apply(next);
    if (opts.savedAs) {
      setVersion(opts.savedAs);
      lastSaved.current = JSON.stringify(next);
    }
    else queueSave(summary);
    rerender();
  };

  const undo = () => {
    const { past, future } = hist.current;
    if (!past.length) return;
    hist.current = { past: past.slice(0, -1), future: [configRef.current, ...future] };
    lastCoalesce.current = null;
    apply(past.at(-1)!);
    queueSave('Undo');
    rerender();
  };
  const redo = () => {
    const { past, future } = hist.current;
    if (!future.length) return;
    hist.current = { past: [...past, configRef.current], future: future.slice(1) };
    lastCoalesce.current = null;
    apply(future[0]);
    queueSave('Redo');
    rerender();
  };

  /* ----- View state ----- */
  const [pageId, setPageId] = useState(() => (initialConfig.pages.find((p) => p.path === '/') ?? initialConfig.pages[0]).id);
  const page = config.pages.find((p) => p.id === pageId) ?? config.pages[0];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [scrollKey, setScrollKey] = useState(0);
  const [device, setDevice] = useState<Device>('desktop');
  const [tab, setTab] = useState<Tab>('chat');
  const [drawer, setDrawer] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [pageMenu, setPageMenu] = useState(false);
  const [addMenu, setAddMenu] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [media, setMedia] = useState<{ sectionId: string; path: string } | null>(null);
  const [productMedia, setProductMedia] = useState<{ productId: string; path: string } | null>(null);
  const [openProduct, setOpenProduct] = useState<string | null>(null);
  const [assets, setAssets] = useState(initialAssets);
  const [flashIds, setFlashIds] = useState<string[]>([]);
  const [focus, setFocus] = useState<{ path: string; n: number } | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const selected = selectedId ? (findSection(config, selectedId)?.section ?? null) : null;
  const selIndex = selected ? page.sections.findIndex((s) => s.id === selected.id) : -1;
  const { min, max } = bounds(page.sections);

  const flash = (ids: string[]) => {
    clearTimeout(flashTimer.current);
    setFlashIds(ids);
    flashTimer.current = setTimeout(() => setFlashIds([]), 1400);
  };

  const select = (id: string | null, from: 'stage' | 'list' = 'stage') => {
    setSelectedId(id);
    setFocus(null);
    if (!id) return;
    setTab('edit');
    setSheet(true);
    setDrawer(false);
    setScope('section');
    if (from === 'list') setScrollKey((k) => k + 1);
  };

  const goPage = (id: string) => {
    setPageId(id);
    setSelectedId(null);
    setPageMenu(false);
    setScope((s) => (s === 'section' ? 'page' : s));
  };

  /* ----- Section edits ----- */
  const label = (id: string) => {
    const s = findSection(configRef.current, id)?.section;
    return s ? SECTIONS[s.type].label : 'Section';
  };

  const editField = (sectionId: string, path: string, value: unknown) => {
    try {
      const next = syncShared(setField(configRef.current, sectionId, path, value), sectionId);
      commit(next, label(sectionId), { coalesce: `${sectionId}:${path}` });
    } catch (err) {
      toast(`Not changed: ${(err as Error).message}`);
    }
  };

  const fieldCtx: FieldCtx = {
    set: (path, value) => selectedId && editField(selectedId, path, value),
    pickImage: (path) => selectedId && setMedia({ sectionId: selectedId, path }),
    pages: config.pages.map((p) => ({ path: p.path, title: p.title })),
    focusPath: focus?.path ?? null,
    products: config.store?.products.map((p) => ({ id: p.id, name: p.name })),
    categories: config.store ? [...new Set(config.store.products.map((p) => p.category).filter(Boolean))] : undefined,
  };

  /* ----- Products ----- */
  const showProduct = (id: string) => {
    setOpenProduct(id);
    setTab('products');
    setSheet(true);
    setDrawer(false);
  };
  const changeStore = (next: SiteConfig, summary: string, coalesce?: string) => {
    try {
      commit(next, summary, { coalesce });
    } catch (err) {
      toast(`Not changed: ${(err as Error).message}`);
    }
  };
  const pickProductImage = (image: SiteImage) => {
    const target = productMedia && configRef.current.store?.products.find((p) => p.id === productMedia.productId);
    setProductMedia(null);
    if (!target) return;
    const path = productMedia!.path;
    const current = (getIn(target, path) as SiteImage | undefined) ?? null;
    const picked = { ...image, alt: image.alt || current?.alt || target.name };
    const next = path === 'image' ? { ...target, image: picked } : setIn({ ...target, images: [...(target.images ?? [])] }, path, picked);
    changeStore(saveProduct(configRef.current, { ...next, sample: undefined }), target.name);
  };

  const moveTo = (id: string, to: number) => {
    const clamped = Math.max(min, Math.min(max, to));
    commit(moveSection(configRef.current, id, clamped), 'Order');
  };

  const addSection = (type: SectionType) => {
    setAddMenu(false);
    const s = newSection(configRef.current, type, page.id, project.businessType);
    const after = selIndex >= 0 ? Math.max(selIndex + 1, min) : max + 1;
    commit(insertSection(configRef.current, page.id, Math.min(after, max + 1), s), `Added ${SECTIONS[type].label}`);
    select(s.id, 'list');
    flash([s.id]);
  };

  const remove = (id: string) => {
    const before = configRef.current;
    commit(removeSection(before, id), `Removed ${label(id)}`);
    setSelectedId(null);
    toast(`${label(id)} removed`, { label: 'Undo', onClick: () => commit(revertChange(configRef.current, before, removeSection(before, id)), 'Undo remove') });
  };

  /* ----- Chat ----- */
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const snapshots = useRef(new Map<string, { before: SiteConfig; after: SiteConfig }>());
  const [undone, setUndone] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState('');
  const [thinking, setThinking] = useState<string | null>(null);
  const [scope, setScope] = useState<ScopeKind>('page');
  const chatInput = useRef<HTMLTextAreaElement>(null);

  const effectiveScope: ScopeKind = scope === 'section' && !selected ? 'page' : scope;
  const scopeLabel = effectiveScope === 'site' ? 'Whole site' : effectiveScope === 'section' ? `Section · ${SECTIONS[selected!.type].label}` : `Page · ${page.title}`;
  const cycleScope = () => {
    const opts: ScopeKind[] = ['site', 'page', ...(selected ? (['section'] as const) : [])];
    setScope(opts[(opts.indexOf(effectiveScope) + 1) % opts.length]);
  };

  const send = async () => {
    const text = draft.trim();
    if (!text || thinking) return;
    const chatScope: ChatScope =
      effectiveScope === 'section' ? { kind: 'section', sectionId: selected!.id } : effectiveScope === 'page' ? { kind: 'page', pageId: page.id } : { kind: 'site' };
    setDraft('');
    setThinking(effectiveScope === 'section' ? `Rewriting ${SECTIONS[selected!.type].label.toLowerCase()}…` : effectiveScope === 'page' ? `Working on the ${page.title} page…` : 'Working on the site…');
    const tempId = `local-${Date.now()}`;
    setMessages((m) => [...m, { id: tempId, role: 'user', text, scope: effectiveScope, change: '', version: null, createdAt: new Date().toISOString() }]);
    try {
      await flush();
      const before = configRef.current;
      const r = await chatAction(projectId, { message: text, scope: chatScope, config: before, businessType: project.businessType });
      setMessages((m) => [...m.filter((x) => x.id !== tempId), ...(r.messages ?? [])]);
      if (r.config && r.version) {
        // Edits made while the AI was thinking are kept: only what the reply touched is replaced.
        const merged = configRef.current === before ? r.config : mergeOnto(configRef.current, before, r.config);
        const aiMsg = r.messages?.at(-1);
        if (aiMsg) snapshots.current.set(aiMsg.id, { before, after: r.config });
        commit(merged, 'Chat', { savedAs: r.version });
        if (merged !== r.config) {
          // The server holds the reply without the edits made meanwhile; save those on top.
          lastSaved.current = JSON.stringify(r.config);
          queueSave('Chat');
        }
        const visible = (r.touched ?? []).filter((id) => page.sections.some((s) => s.id === id));
        if (!visible.length && r.touched?.length) {
          const other = findSection(merged, r.touched[0]);
          if (other) setPageId(other.page.id);
        }
        flash(r.touched ?? []);
      }
      if (r.error && !r.messages) toast(r.error);
    } catch (err) {
      setMessages((m) => [
        ...m,
        { id: `local-err-${Date.now()}`, role: 'assistant', text: `That didn’t go through: ${(err as Error).message}`, scope: effectiveScope, change: 'No change', version: null, createdAt: new Date().toISOString() },
      ]);
    } finally {
      setThinking(null);
    }
  };

  const undoChat = (id: string) => {
    const snap = snapshots.current.get(id);
    if (!snap) return;
    commit(revertChange(configRef.current, snap.before, snap.after), 'Undid a chat change');
    setUndone((u) => new Set(u).add(id));
    toast('Change undone');
  };

  const chatView: ChatView[] = messages.map((m) => ({ ...m, canUndo: snapshots.current.has(m.id), undone: undone.has(m.id) }));

  const askAboutSelection = () => {
    setTab('chat');
    setScope('section');
    setSheet(true);
    setTimeout(() => chatInput.current?.focus(), 50);
  };

  /* ----- Keyboard ----- */
  const keys = useRef({ undo, redo, select });
  keys.current = { undo, redo, select };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName);
      const mod = e.metaKey || e.ctrlKey;
      if (mod && !typing && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) keys.current.redo();
        else keys.current.undo();
      } else if (mod && !typing && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        keys.current.redo();
      } else if (e.key === 'Escape' && !typing && !document.querySelector('[role=dialog]')) {
        keys.current.select(null);
        setPageMenu(false);
        setAddMenu(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /* ----- Media ----- */
  const mediaTarget = media ? findSection(config, media.sectionId)?.section : null;
  const mediaCurrent = media && mediaTarget ? (getIn(mediaTarget.content, media.path) as SiteImage | undefined) ?? null : null;

  const share = async () => {
    try {
      await navigator.clipboard.writeText(pitchLink);
      toast('Pitch link copied', { label: 'Open it', href: pitchLink });
    } catch {
      toast(pitchLink);
    }
  };

  const restore = async (v: number) => {
    await flush();
    const r = await restoreVersionAction(projectId, v);
    commit(r.config, `Restored version ${v}`, { savedAs: r.version });
    setSelectedId(null);
    if (!r.config.pages.some((p) => p.id === pageId)) setPageId(r.config.pages[0].id);
    setHistoryOpen(false);
    toast(`Version ${v} restored as version ${r.version}`);
  };

  const presetName = PRESETS[config.theme.preset].name;
  const canUndo = hist.current.past.length > 0;
  const canRedo = hist.current.future.length > 0;

  const sectionList = useMemo(() => page.sections.map((s) => ({ s, ...sectionLabel(s) })), [page]);
  const [drag, setDrag] = useState<{ id: string; over: number | null } | null>(null);

  /* ---------- Render ---------- */
  return (
    <div className="relative flex h-dvh overflow-hidden bg-bg text-text">
      {/* App rail */}
      <nav aria-label="Studio" className="hidden w-[60px] flex-none flex-col items-center gap-1.5 border-r border-border bg-bg py-4 md:flex">
        <Link href="/" aria-label="Sono Studio home" className="mb-3.5">
          <Logo kind="mark" alt="Sono" className="h-[18px] w-auto" />
        </Link>
        {NAV.map(({ href, name, Icon }) => (
          <Link key={href} href={href} title={name} aria-label={name} className={`flex size-10 items-center justify-center rounded-[10px] ${href === '/' ? 'bg-sel text-text' : 'text-muted hover:bg-hover hover:text-text'}`}>
            <Icon size={20} strokeWidth={2} />
          </Link>
        ))}
      </nav>

      {/* Sections */}
      {drawer && <div onClick={() => setDrawer(false)} className="absolute inset-0 z-[25] bg-[rgba(22,20,15,.35)] xl:hidden" />}
      <aside
        aria-label="Sections"
        className={`flex w-[248px] flex-none flex-col border-r border-border bg-surface max-xl:absolute max-xl:inset-y-0 max-xl:left-0 max-xl:z-30 max-xl:transition-transform max-xl:duration-200 md:max-xl:left-[60px] ${
          drawer ? 'max-xl:translate-x-0 max-xl:shadow-raised' : 'max-xl:invisible max-xl:-translate-x-[110%]'
        }`}
      >
        <div className="flex flex-col gap-3 px-4 pt-4 pb-3">
          <Link href={`/projects/${projectId}`} className="flex items-center gap-1.5 self-start text-[13px] text-muted hover:text-text">
            <ChevronLeft size={15} />
            Project
          </Link>
          <div className="flex flex-col gap-1.5">
            <div className="truncate text-[17px] font-semibold tracking-[-0.01em]">{project.name}</div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12px] text-muted">
                {project.businessType} · {presetName}
              </span>
              <StatusPill status={project.status} />
            </div>
          </div>
        </div>
        <div className="relative flex items-center gap-2 px-4 py-2">
          <span className="flex-1 truncate text-[11px] font-medium tracking-[0.12em] text-muted uppercase">Sections · {page.title}</span>
          <button type="button" title="Add section" aria-label="Add section" aria-expanded={addMenu} onClick={() => setAddMenu((v) => !v)} className="flex size-7 cursor-pointer items-center justify-center rounded-lg text-muted hover:bg-hover hover:text-text">
            <Plus size={16} />
          </button>
          {addMenu && (
            <div className="absolute top-10 right-3 z-20 flex max-h-[60dvh] w-[220px] flex-col gap-0.5 overflow-auto rounded-xl border border-border bg-raised p-1.5 shadow-raised">
              {addableTypes(config).map((t) => (
                <button key={t} type="button" onClick={() => addSection(t)} className="flex cursor-pointer flex-col rounded-lg px-2.5 py-1.5 text-left hover:bg-hover">
                  <span className="text-[13px] font-medium">{SECTIONS[t].label}</span>
                  <span className="text-[11px] leading-snug text-muted">{SECTIONS[t].purpose}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <ul className="m-0 flex flex-1 list-none flex-col gap-0.5 overflow-auto px-2 pb-4" onDragLeave={(e) => e.currentTarget === e.target && setDrag((d) => d && { ...d, over: null })}>
          {sectionList.map(({ s, name, detail }, i) => {
            const fixed = s.type === 'navbar' || s.type === 'footer';
            const on = s.id === selectedId;
            return (
              <li
                key={s.id}
                draggable={!fixed}
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'move';
                  setDrag({ id: s.id, over: null });
                }}
                onDragOver={(e) => {
                  if (!drag) return;
                  e.preventDefault();
                  if (drag.over !== i) setDrag({ ...drag, over: i });
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (drag && drag.over !== null) moveTo(drag.id, drag.over);
                  setDrag(null);
                }}
                onDragEnd={() => setDrag(null)}
                onMouseEnter={() => setHoverId(s.id)}
                onMouseLeave={() => setHoverId(null)}
                className={`group flex min-h-[42px] items-center gap-2 rounded-[10px] py-1 pr-1 pl-1.5 ${on ? 'bg-sel' : hoverId === s.id ? 'bg-hover' : ''} ${
                  drag?.over === i && drag.id !== s.id ? 'shadow-[inset_0_2px_0_#B4502E]' : ''
                } ${drag?.id === s.id ? 'opacity-50' : ''}`}
              >
                <span className={`flex text-muted ${fixed ? 'opacity-0' : 'cursor-grab opacity-55'}`} aria-hidden>
                  <GripVertical size={14} />
                </span>
                <button type="button" onClick={() => select(s.id, 'list')} aria-current={on ? 'true' : undefined} className="flex min-w-0 flex-1 cursor-pointer flex-col gap-px text-left">
                  <span className={`text-[13px] ${on ? 'font-semibold' : 'font-medium'} ${s.hidden ? 'text-muted line-through' : ''}`}>{name}</span>
                  <span className="truncate text-[11px] text-muted">{detail}</span>
                </button>
                <button
                  type="button"
                  title={s.hidden ? 'Show section' : 'Hide section'}
                  aria-label={s.hidden ? `Show ${name}` : `Hide ${name}`}
                  onClick={() => commit(syncShared(toggleHidden(configRef.current, s.id), s.id), s.hidden ? `Showed ${name}` : `Hid ${name}`)}
                  className={`flex size-7 flex-none cursor-pointer items-center justify-center rounded-full text-muted hover:bg-hover hover:text-text ${s.hidden ? '' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100 max-md:opacity-100'}`}
                >
                  {s.hidden ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
                {on && <span className="mr-1.5 size-[7px] flex-none rounded-full bg-terracotta" />}
              </li>
            );
          })}
        </ul>
      </aside>

      {/* Toolbar and stage */}
      {/* The toolbar sizes itself to its own width, so zoom and panel widths are taken into account. */}
      <div className="@container flex min-w-0 flex-1 flex-col max-md:pb-16">
        <div className="flex h-14 flex-none items-center gap-1 border-b border-border bg-surface px-2 md:px-3 2xl:gap-2">
          <button type="button" title="Sections" aria-label="Sections" onClick={() => setDrawer(true)} className={`${iconBtn} xl:hidden`}>
            <PanelLeft size={16} />
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={() => setPageMenu((v) => !v)}
              aria-expanded={pageMenu}
              className="flex h-[34px] max-w-[140px] cursor-pointer items-center gap-2 rounded-full border border-border bg-surface px-2.5 text-[13px] font-medium hover:bg-hover"
            >
              <FileText size={14} className="flex-none" />
              <span className="truncate">{page.title}</span>
              <ChevronDown size={14} className="flex-none" />
            </button>
            {pageMenu && (
              <div className="absolute top-10 left-0 z-40 flex w-[200px] flex-col gap-0.5 rounded-xl border border-border bg-raised p-1.5 shadow-raised">
                {config.pages.map((p) => (
                  <button key={p.id} type="button" onClick={() => goPage(p.id)} className={`flex h-[34px] cursor-pointer items-center gap-2 rounded-lg px-2.5 text-left text-[13px] hover:bg-hover ${p.id === page.id ? 'text-accent-text' : ''}`}>
                    <span className="flex-1 truncate">{p.title}</span>
                    <span className="text-[11px] text-muted">{p.sections.filter((s) => !s.hidden).length}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <span className="hidden h-5 w-px bg-border @min-[820px]:block" />
          <div role="group" aria-label="Preview width" className="hidden gap-0.5 @min-[820px]:flex">
            {(
              [
                ['desktop', 'Desktop', Monitor],
                ['tablet', 'Tablet', Tablet],
                ['phone', 'Phone', Smartphone],
              ] as const
            ).map(([k, name, Icon]) => (
              <button key={k} type="button" title={name} aria-label={name} aria-pressed={device === k} onClick={() => setDevice(k)} className={`${iconBtn} ${device === k ? 'bg-sel' : 'text-muted'}`}>
                <Icon size={16} />
              </button>
            ))}
          </div>
          <span className="hidden h-5 w-px bg-border md:block" />
          <button type="button" title="Undo (Ctrl+Z)" aria-label="Undo" disabled={!canUndo} onClick={undo} className={iconBtn}>
            <Undo2 size={16} />
          </button>
          <button type="button" title="Redo (Ctrl+Shift+Z)" aria-label="Redo" disabled={!canRedo} onClick={redo} className={`${iconBtn} @max-[560px]:hidden`}>
            <Redo2 size={16} />
          </button>
          <button type="button" title="Version history" aria-label="Version history" onClick={() => setHistoryOpen(true)} className={`${iconBtn} @max-[460px]:hidden`}>
            <History size={16} />
          </button>
          <SaveStatus state={saveState} version={version} error={saveError} onRetry={() => void flush()} />
          <span className="min-w-2 flex-1" />
          <span className="@max-[700px]:hidden">
            <ThemeToggle />
          </span>
          <button type="button" title="Copy pitch link" onClick={share} className="flex h-[34px] flex-none cursor-pointer items-center gap-1.5 rounded-full px-2.5 text-[13px] font-medium hover:bg-hover active:scale-[0.97]">
            <Share2 size={16} />
            <span className="@max-[940px]:hidden">Share</span>
          </button>
          <button
            type="button"
            title="Download the site as a Next.js project (zip)"
            aria-label="Export"
            onClick={async () => {
              await flush();
              window.location.href = `/api/projects/${projectId}/export`;
              toast('Preparing the zip…');
            }}
            className="flex h-[34px] flex-none cursor-pointer items-center gap-1.5 rounded-full border border-border px-2.5 text-[13px] font-medium hover:bg-hover active:scale-[0.97] @max-[520px]:hidden"
          >
            <Download size={16} />
            <span className="@max-[940px]:hidden">Export</span>
          </button>
          <button
            type="button"
            onClick={() => setDeployOpen(true)}
            className="flex h-[34px] flex-none cursor-pointer items-center gap-1.5 rounded-full bg-terracotta px-3.5 text-[13px] font-semibold text-white hover:bg-terracotta-hover active:scale-[0.97]"
          >
            {deployment?.status === 'building' ? <MiniSpin /> : null}
            {deployment?.status === 'ready' ? 'Redeploy' : 'Deploy'}
            <ArrowRight size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-auto bg-stage">
          <Stage
            config={config}
            page={page}
            device={device}
            selectedId={selectedId}
            hoverId={hoverId}
            flashIds={flashIds}
            scrollKey={scrollKey}
            onHover={setHoverId}
            onSelect={(id) => id !== selectedId && select(id)}
            onEditText={(id, path, value) => editField(id, path, value)}
            onFocusField={(id, path) => {
              select(id);
              setFocus((f) => ({ path, n: (f?.n ?? 0) + 1 }));
            }}
            onPickImage={(id, path) => setMedia({ sectionId: id, path })}
            onProduct={showProduct}
          />
        </div>
      </div>

      {/* Chat, Edit, Theme */}
      <aside
        aria-label="Editor"
        className={`flex min-h-0 w-[340px] flex-none flex-col border-l md:max-xl:w-[320px] border-border bg-surface max-md:absolute max-md:inset-x-0 max-md:bottom-0 max-md:z-20 max-md:w-auto max-md:overflow-hidden max-md:rounded-t-[18px] max-md:border-l-0 max-md:shadow-[0_-10px_30px_rgba(22,20,15,.18)] max-md:transition-[height] max-md:duration-200 ${
          sheet ? 'max-md:h-[62%]' : 'max-md:h-16'
        }`}
      >
        <button type="button" aria-label={sheet ? 'Collapse panel' : 'Expand panel'} onClick={() => setSheet((v) => !v)} className="flex flex-none cursor-pointer justify-center pt-2 md:hidden">
          <span className="h-1 w-10 rounded-full bg-border" />
        </button>
        <div role="tablist" className="flex flex-none gap-3.5 overflow-x-auto border-b border-border px-4 [scrollbar-width:none]">
          {(['chat', 'edit', 'theme', 'products', 'bookings'] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => {
                if (tab === t) setSheet((v) => !v);
                else setSheet(true);
                setTab(t);
              }}
              className={`flex h-[50px] flex-none cursor-pointer items-center text-[14px] font-medium capitalize ${tab === t ? 'text-accent-text shadow-[inset_0_-2px_0_#B4502E]' : 'text-muted hover:text-text'}`}
            >
              {t}
            </button>
          ))}
          {selected && (tab === 'chat' || tab === 'theme') && (
            <span className="ml-auto flex items-center text-[12px] text-muted max-md:hidden">
              <span className="max-w-[90px] truncate">{SECTIONS[selected.type].label}</span>
              <button type="button" aria-label="Clear selection" onClick={() => select(null)} className="ml-0.5 flex size-6 cursor-pointer items-center justify-center rounded-full hover:bg-hover">
                <X size={12} />
              </button>
            </span>
          )}
        </div>
        {tab === 'chat' && (
          <ChatPanel
            messages={chatView}
            scopeLabel={scopeLabel}
            onCycleScope={cycleScope}
            thinking={thinking}
            aiMode={aiMode}
            draft={draft}
            setDraft={setDraft}
            onSend={send}
            onUndo={undoChat}
            inputRef={chatInput}
          />
        )}
        {tab === 'edit' && (
          <EditPanel
            key={`${selected?.id}-${focus?.n ?? 0}`}
            section={selected}
            isFirst={selIndex <= min}
            isLast={selIndex >= max}
            ctx={fieldCtx}
            onVariant={(v) => commit(syncShared(setVariant(configRef.current, selected!.id, v), selected!.id), `${label(selected!.id)} layout`)}
            onMove={(dir) => moveTo(selected!.id, selIndex + dir)}
            onDuplicate={() => {
              const r = duplicateSection(configRef.current, selected!.id);
              commit(r.config, `Duplicated ${label(selected!.id)}`);
              select(r.id, 'list');
              flash([r.id]);
            }}
            onToggleHidden={() => commit(syncShared(toggleHidden(configRef.current, selected!.id), selected!.id), selected!.hidden ? 'Showed section' : 'Hid section')}
            onRemove={() => remove(selected!.id)}
            onAsk={askAboutSelection}
          />
        )}
        {tab === 'products' && (
          <ProductsPanel
            config={config}
            openId={openProduct}
            onOpen={setOpenProduct}
            onChange={changeStore}
            onPickImage={(productId, path) => setProductMedia({ productId, path })}
            onAddShop={(currency) => {
              const r = addShop(configRef.current, currency);
              changeStore(r.config, 'Added a shop');
              goPage(r.pageId);
              flash(r.config.pages.find((p) => p.id === r.pageId)?.sections.map((s) => s.id) ?? []);
              toast('Shop page added with three sample products');
            }}
            testKeys={testKeys}
            onPreview={async (id) => {
              const w = window.open('about:blank', '_blank');
              await flush();
              if (w) w.location.href = `/preview/${projectId}/product/${id}`;
            }}
          />
        )}
        {tab === 'bookings' && (
          <BookingsPanel
            config={config}
            onChange={changeStore}
            testKeys={testKeys}
            onAdd={(opts) => {
              const r = addBookings(configRef.current, opts);
              changeStore(r.config, 'Added bookings');
              goPage(r.pageId);
              flash(r.config.pages.find((p) => p.id === r.pageId)?.sections.map((s) => s.id) ?? []);
              toast('Book page added with sample services');
            }}
          />
        )}
        {tab === 'theme' && (
          <ThemePanel
            theme={config.theme}
            onChange={(theme: SiteTheme, summary) => commit({ ...configRef.current, theme }, summary, { coalesce: `theme:${summary}` })}
            styles={styles}
            onApplyLayouts={() => {
              const r = applyLayouts(configRef.current);
              if (!r.changed) return toast('Every section already uses these layouts');
              commit(r.config, 'Layouts');
              toast(`${r.changed} section${r.changed === 1 ? '' : 's'} switched to the style’s layouts`);
            }}
            onSaveAsStyle={async (name) => {
              const r = await saveStyleAction({ name, note: `From ${project.name}`, theme: configRef.current.theme });
              if (r.error) return r.error;
              setStyles((list) => [r.style!, ...list]);
              toast(`Saved as ${r.style!.name}`, { label: 'View styles', href: '/presets' });
            }}
          />
        )}
      </aside>

      {media && (
        <MediaDialog
          projectId={projectId}
          assets={assets}
          onAssetAdded={(a) => setAssets((list) => [a, ...list.filter((x) => x.id !== a.id && !(a.kind === 'logo' && x.kind === 'logo'))])}
          stockSearch={stockSearch}
          current={mediaCurrent}
          kind={media.path === 'logo' ? 'logo' : 'photo'}
          onPick={(image) => {
            editField(media.sectionId, media.path, { ...image, alt: image.alt || mediaCurrent?.alt || '' });
            setMedia(null);
          }}
          onClose={() => setMedia(null)}
        />
      )}
      {productMedia && (
        <MediaDialog
          projectId={projectId}
          assets={assets}
          onAssetAdded={(a) => setAssets((list) => [a, ...list.filter((x) => x.id !== a.id)])}
          stockSearch={stockSearch}
          current={(() => {
            const p = config.store?.products.find((x) => x.id === productMedia.productId);
            return p ? ((getIn(p, productMedia.path) as SiteImage | undefined) ?? null) : null;
          })()}
          kind="photo"
          onPick={pickProductImage}
          onClose={() => setProductMedia(null)}
        />
      )}
      {historyOpen && <HistoryDialog projectId={projectId} current={version} onRestore={restore} onClose={() => setHistoryOpen(false)} />}
      {deployOpen && (
        <DeployDialog
          projectId={projectId}
          projectName={project.name}
          version={version}
          checklist={handoverChecklist(config)}
          payments={[...new Set([...cardProviders(config.store), ...depositProviders(config.bookings)])]}
          hasVercel={deploy.hasVercel}
          hasGithub={deploy.hasGithub}
          initial={deployment}
          beforeDeploy={flush}
          onDone={setDeployment}
          onClose={() => {
            setDeployOpen(false);
            void fetchDeployment(projectId).then(setDeployment, () => {});
          }}
        />
      )}
    </div>
  );
}

/** Re-applies the sections a chat reply changed onto a config that was edited meanwhile. */
function mergeOnto(current: SiteConfig, before: SiteConfig, after: SiteConfig): SiteConfig {
  return revertChange(current, after, before);
}

function SaveStatus({ state, version, error, onRetry }: { state: SaveState; version: number; error: string; onRetry: () => void }) {
  if (state === 'error') {
    return (
      <button type="button" onClick={onRetry} title={error} className="flex h-[34px] cursor-pointer items-center gap-1.5 rounded-full px-2 text-[12px] font-medium text-danger hover:bg-hover">
        <CloudOff size={14} />
        <span className="whitespace-nowrap @max-[520px]:hidden">Not saved · retry</span>
      </button>
    );
  }
  return (
    <span className="flex items-center gap-1.5 px-1 text-[12px] whitespace-nowrap text-muted @max-[520px]:hidden" aria-live="polite">
      {state === 'saving' ? <MiniSpin /> : state === 'saved' ? <Check size={13} /> : null}
      {state === 'saving' ? 'Saving…' : state === 'unsaved' ? 'Edited' : `Saved · v${version}`}
    </span>
  );
}
