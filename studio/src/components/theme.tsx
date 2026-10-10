'use client';

import { Moon, Sun } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { THEME_STORAGE_KEY } from '@/lib/constants';

export type Theme = 'light' | 'dark';

const listeners = new Set<() => void>();

function readTheme(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const mq = matchMedia('(prefers-color-scheme: dark)');
  const onSystem = () => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(THEME_STORAGE_KEY);
    } catch {}
    if (saved !== 'light' && saved !== 'dark') {
      document.documentElement.dataset.theme = mq.matches ? 'dark' : 'light';
      listeners.forEach((l) => l());
    }
  };
  mq.addEventListener('change', onSystem);
  return () => {
    listeners.delete(cb);
    mq.removeEventListener('change', onSystem);
  };
}

export function useTheme(): [Theme, () => void] {
  const theme = useSyncExternalStore(subscribe, readTheme, () => 'light' as Theme);
  const toggle = () => {
    const next: Theme = readTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {}
    listeners.forEach((l) => l());
  };
  return [theme, toggle];
}

export function ThemeToggle() {
  const [theme, toggle] = useTheme();
  const label = theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
  return (
    <button
      type="button"
      onClick={toggle}
      title={label}
      aria-label={label}
      className="flex size-11 flex-none cursor-pointer items-center justify-center rounded-full hover:bg-hover"
    >
      {theme === 'dark' ? <Sun size={20} strokeWidth={2} /> : <Moon size={20} strokeWidth={2} />}
    </button>
  );
}
