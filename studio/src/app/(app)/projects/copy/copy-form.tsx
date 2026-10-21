'use client';

import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Orbit } from '@/components/orbit';
import { btn, inputClass } from '@/components/ui';

/** Copies a client's own website unchanged into a new project. */
export function CopyForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [busy]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSeconds(0);
    setBusy(true);
    try {
      const res = await fetch('/api/site-copy', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, url, confirmed }) });
      const body = (await res.json().catch(() => ({}))) as { projectId?: string; error?: string };
      if (!res.ok || !body.projectId) throw new Error(body.error ?? 'The site couldn’t be copied.');
      router.push(`/projects/${body.projectId}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  const field = `${inputClass} h-11 text-[15px]`;
  return (
    <div className="flex flex-col gap-6">
      <Link href="/" className="flex min-h-8 items-center gap-1.5 self-start text-[14px] text-muted hover:text-text">
        <ChevronLeft size={16} />
        Projects
      </Link>
      <p className="m-0 text-[16px] leading-normal text-muted">
        For moving a client’s existing site unchanged, for example off hosting they’re leaving. Pages, styles, scripts, fonts, images and animations are copied as
        visitors see them, ready to export or deploy. To give them a new, editable site built from their content instead, start a{' '}
        <Link href="/new" className="font-medium text-accent-text hover:underline">
          new site
        </Link>{' '}
        and import their address.
      </p>
      {busy ? (
        <div className="flex flex-col items-center gap-4 rounded-card border border-border bg-surface px-6 py-12 text-center" aria-live="polite">
          <Orbit size={56} />
          <span className="text-[16px] font-medium">Copying {url.replace(/^https?:\/\//, '')}…</span>
          <span className="text-[14px] text-muted">
            Reading pages and downloading files. Large sites take up to three minutes. {seconds > 0 && `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`}
          </span>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-5 rounded-card border border-border bg-surface p-6">
          <label className="flex flex-col gap-1.5 text-[14px] font-medium">
            Client or business name
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="e.g. Casa Olivia" className={field} />
          </label>
          <label className="flex flex-col gap-1.5 text-[14px] font-medium">
            Their website
            <input value={url} onChange={(e) => setUrl(e.target.value)} required inputMode="url" placeholder="e.g. casaolivia.it" className={field} />
          </label>
          <label className="flex cursor-pointer items-start gap-2.5 text-[14px] leading-snug">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5 size-4 flex-none accent-[#B4502E]" />
            <span>This is my client’s own website, and they’ve asked me to move or rehost it. I won’t use this to copy anyone else’s site.</span>
          </label>
          <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-[13px] text-muted">
            <li>Up to 40 pages and 45 MB. Links to pages beyond that still go to the old site.</li>
            <li>Forms, bookings, shops and logins run on the old host’s server and don’t come across.</li>
            <li>The copy can be exported or deployed, but not edited in the workspace.</li>
          </ul>
          {error && (
            <p role="alert" className="m-0 text-[14px] text-danger">
              {error}
            </p>
          )}
          <div className="flex justify-end">
            <button type="submit" disabled={!confirmed || !url.trim()} className={`${btn.primary} h-11 px-5 text-[15px]`}>
              Copy the site
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
