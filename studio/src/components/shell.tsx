'use client';

import { Folder, LayoutGrid, Palette, PanelLeft, Plus, Search, SlidersHorizontal } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { SIDEBAR_COOKIE } from '@/lib/constants';
import { Logo } from './logo';
import { ThemeToggle } from './theme';
import { btn } from './ui';


const NAV = [
  { href: '/', name: 'Projects', Icon: Folder },
  { href: '/library', name: 'Library', Icon: LayoutGrid },
  { href: '/presets', name: 'Presets', Icon: Palette },
  { href: '/settings', name: 'Settings', Icon: SlidersHorizontal },
] as const;

function useActive() {
  const path = usePathname();
  return (href: string) => (href === '/' ? path === '/' || path.startsWith('/projects') : path.startsWith(href));
}

export function Sidebar({ initialOpen }: { initialOpen: boolean }) {
  const [open, setOpen] = useState(initialOpen);
  const isActive = useActive();
  const toggle = () => {
    const next = !open;
    setOpen(next);
    document.cookie = `${SIDEBAR_COOKIE}=${next ? 'open' : 'closed'}; path=/; max-age=31536000; samesite=lax`;
  };
  return (
    <nav
      aria-label="Main"
      className={`hidden flex-none flex-col gap-1 overflow-hidden border-r border-border bg-bg px-3 py-[18px] transition-[width] duration-[180ms] ease-out md:flex ${
        open ? 'w-[220px]' : 'w-[68px]'
      }`}
    >
      <Link href="/" className="mb-[18px] flex h-8 items-center gap-2.5 px-1.5" aria-label="Sono Studio home">
        {open ? (
          <>
            <Logo kind="lockup-horizontal" className="h-[22px] w-auto" />
            <span className="text-[11px] font-medium tracking-[0.18em] text-muted">STUDIO</span>
          </>
        ) : (
          <Logo kind="mark" alt="Sono" className="h-[18px] w-auto" />
        )}
      </Link>
      {NAV.map(({ href, name, Icon }) => {
        const on = isActive(href);
        return (
          <Link
            key={href}
            href={href}
            title={name}
            aria-current={on ? 'page' : undefined}
            className={`flex h-10 items-center gap-3 rounded-[10px] px-2.5 text-[14px] font-medium whitespace-nowrap hover:bg-hover hover:text-text ${
              on ? 'bg-sel text-text' : 'text-muted'
            }`}
          >
            <Icon size={20} strokeWidth={2} className="flex-none" />
            {open && <span>{name}</span>}
          </Link>
        );
      })}
      <div className="flex-1" />
      <button
        type="button"
        onClick={toggle}
        title={open ? 'Collapse sidebar' : 'Expand sidebar'}
        aria-expanded={open}
        className="flex h-10 cursor-pointer items-center gap-3 rounded-[10px] px-2.5 text-[13px] whitespace-nowrap text-muted hover:bg-hover hover:text-text"
      >
        <PanelLeft size={16} strokeWidth={2} className="flex-none" />
        {open && <span>Collapse</span>}
      </button>
    </nav>
  );
}

export function BottomTabs() {
  const isActive = useActive();
  return (
    <nav aria-label="Main" className="flex flex-none border-t border-border bg-bg px-2 pt-1 pb-2.5 md:hidden">
      {NAV.map(({ href, name, Icon }) => {
        const on = isActive(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={on ? 'page' : undefined}
            className={`flex min-h-[52px] flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium ${
              on ? 'text-accent-text' : 'text-muted'
            }`}
          >
            <Icon size={20} strokeWidth={2} />
            <span>{name}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/*
 * Dashboard search and filters live in the URL (?q=, ?status=, ...) so the top
 * bar and the dashboard share them and they survive a reload. A small store is
 * the source of truth while typing; the URL is written once typing pauses,
 * because rapid history.replaceState calls can be applied out of order by the
 * router.
 */
let params: URLSearchParams | null = null;
const paramSubs = new Set<() => void>();
let writeTimer: ReturnType<typeof setTimeout> | undefined;

function currentParams(): URLSearchParams {
  params ??= new URLSearchParams(window.location.search);
  return params;
}

function writeUrl() {
  clearTimeout(writeTimer);
  writeTimer = undefined;
  document.removeEventListener('click', flushOnLinkClick, true);
  const qs = currentParams().toString();
  window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
}

/** A pending write must land before a link starts navigating, or it would cancel the navigation. */
function flushOnLinkClick(e: MouseEvent) {
  if ((e.target as Element | null)?.closest?.('a[href]')) writeUrl();
}

function scheduleUrlWrite() {
  clearTimeout(writeTimer);
  writeTimer = setTimeout(writeUrl, 150);
  document.addEventListener('click', flushOnLinkClick, true);
}

function subscribeParams(cb: () => void) {
  paramSubs.add(cb);
  return () => paramSubs.delete(cb);
}

export function useQueryParam(key: string): [string, (v: string) => void] {
  const pathname = usePathname();
  const serverValue = useSearchParams().get(key) ?? '';
  useEffect(() => {
    // A navigation starts from whatever the new URL says.
    params = new URLSearchParams(window.location.search);
    paramSubs.forEach((f) => f());
  }, [pathname]);
  const value = useSyncExternalStore(
    subscribeParams,
    () => currentParams().get(key) ?? '',
    () => serverValue,
  );
  const set = (v: string) => {
    const next = new URLSearchParams(currentParams());
    if (v) next.set(key, v);
    else next.delete(key);
    params = next;
    paramSubs.forEach((f) => f());
    scheduleUrlWrite();
  };
  return [value, set];
}

function TopSearch() {
  const path = usePathname();
  const [q, setQ] = useQueryParam('q');
  const [draft, setDraft] = useState(q);
  const onDashboard = path === '/';
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        if (!onDashboard) window.location.assign(`/?q=${encodeURIComponent(draft)}`);
      }}
      className="hidden h-[38px] w-[260px] items-center gap-2 rounded-full border border-border bg-surface px-3 text-muted focus-within:border-terracotta focus-within:shadow-focus md:flex"
    >
      <Search size={16} strokeWidth={2} className="flex-none" />
      <input
        value={onDashboard ? q : draft}
        onChange={(e) => (onDashboard ? setQ(e.target.value) : setDraft(e.target.value))}
        placeholder="Search sites and clients"
        aria-label="Search sites and clients"
        className="min-w-0 flex-1 border-none bg-transparent text-[14px] text-text outline-none placeholder:text-muted"
      />
    </form>
  );
}

export function TopBar({ title, newSite = true }: { title: string; newSite?: boolean }) {
  return (
    <header className="flex h-16 flex-none items-center gap-3 border-b border-border px-4 md:px-7">
      <Link href="/" className="md:hidden" aria-label="Sono Studio home">
        <Logo kind="mark" alt="Sono" className="h-[18px] w-auto" />
      </Link>
      <h1 className="m-0 min-w-0 flex-1 truncate text-[20px] font-semibold tracking-[-0.01em]">{title}</h1>
      <TopSearch />
      <ThemeToggle />
      {newSite && (
        <Link href="/projects/new" className={`${btn.primary} h-10 px-3 text-[14px] md:pr-[18px] md:pl-3.5`}>
          <Plus size={16} strokeWidth={2} />
          <span className="hidden md:inline">New site</span>
          <span className="sr-only md:hidden">New site</span>
        </Link>
      )}
    </header>
  );
}

/** Top bar plus the scrolling content area for one page. */
export function Page({
  title,
  width = 1320,
  newSite = true,
  children,
}: {
  title: string;
  width?: number;
  /** Hidden on screens whose own primary action would compete with it. */
  newSite?: boolean;
  children: React.ReactNode;
}) {
  return (
    <>
      <TopBar title={title} newSite={newSite} />
      <main className="flex-1 overflow-auto">
        <div
          style={{ maxWidth: width }}
          className="mx-auto flex animate-fade-up flex-col gap-7 px-4 pt-5 pb-8 md:px-7 md:pt-8 md:pb-16"
        >
          {children}
        </div>
      </main>
    </>
  );
}
