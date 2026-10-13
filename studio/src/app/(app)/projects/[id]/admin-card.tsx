'use client';

import { Check, Copy, KeyRound, UserPlus } from 'lucide-react';
import { useState, useTransition } from 'react';
import { btn, inputClass, useToast } from '@/components/ui';
import type { SiteAdmin } from '@/lib/data/repo';
import { compactWhen } from '@/lib/format';
import { removeSiteAdminAction, setSiteAdminAction } from '../actions';

/**
 * Client logins for the admin panel: the client edits their words, photos,
 * products, services and hours and looks after orders and bookings; the
 * design stays yours.
 */
export function AdminCard({ projectId, admins, adminUrl, now, businessName }: { projectId: string; admins: SiteAdmin[]; adminUrl: string; now: number; businessName: string }) {
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [shown, setShown] = useState<{ email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  const create = (input: { name: string; email: string }) =>
    start(async () => {
      setError('');
      const r = await setSiteAdminAction(projectId, input);
      if (r.error) return setError(r.error);
      setShown({ email: input.email.trim().toLowerCase(), password: r.password! });
      setAdding(false);
      setName('');
      setEmail('');
      setCopied(false);
    });

  const message = shown
    ? `Here's how to update the ${businessName} website yourself:\n\n1. Open ${adminUrl}\n2. Email: ${shown.email}\n3. Password: ${shown.password}\n\nYou can change words, photos, prices and more. Press "Publish changes" when you're done.`
    : '';

  return (
    <section className="flex flex-col gap-3 rounded-card border border-border bg-surface p-[18px]">
      <div className="flex items-baseline gap-2">
        <h2 className="m-0 flex-1 text-[16px] font-semibold">Client login</h2>
        <a href={adminUrl} target="_blank" rel="noreferrer" className="text-[12px] font-medium text-accent-text hover:underline">
          Admin panel
        </a>
      </div>
      <p className="m-0 text-[13px] leading-normal text-muted">
        Lets the client change their own words, photos, prices, products, services and hours, and see their orders and bookings. Layout, design and payment settings stay with you. Their changes go live within a minute.
      </p>

      {admins.length > 0 && (
        <ul className="m-0 flex list-none flex-col p-0">
          {admins.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border py-2.5">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[14px] font-medium">{a.name || a.email}</span>
                <span className="truncate text-[12px] text-muted">
                  {a.email} · {a.lastSignInAt ? `last signed in ${compactWhen(a.lastSignInAt, now)} ago` : 'hasn’t signed in yet'}
                </span>
              </span>
              <button type="button" disabled={pending} onClick={() => create({ name: a.name, email: a.email })} className="flex cursor-pointer items-center gap-1 text-[13px] font-medium text-accent-text hover:underline">
                <KeyRound size={13} />
                New password
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => start(async () => (await removeSiteAdminAction(projectId, a.id), toast(`${a.email} can no longer sign in`)))}
                className="cursor-pointer text-[13px] font-medium text-danger hover:underline"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {shown && (
        <div role="status" className="flex flex-col gap-2 rounded-xl bg-success-bg p-3.5 text-[13px]">
          <span className="font-semibold text-success">Login ready. This password is shown only once.</span>
          <span>
            {shown.email} · <span className="font-mono text-[14px]">{shown.password}</span>
          </span>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() =>
                navigator.clipboard.writeText(message).then(
                  () => setCopied(true),
                  () => toast('Copy it by hand'),
                )
              }
              className="flex cursor-pointer items-center gap-1 font-medium text-accent-text hover:underline"
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
              {copied ? 'Copied' : 'Copy a message for the client'}
            </button>
            <button type="button" onClick={() => setShown(null)} className="cursor-pointer font-medium text-muted hover:underline">
              Done
            </button>
          </div>
        </div>
      )}

      {adding ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            create({ name, email });
          }}
          className="flex flex-col gap-2"
        >
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Their name" aria-label="Client’s name" maxLength={80} className={`${inputClass} h-10 text-[14px]`} />
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required placeholder="Their email" aria-label="Client’s email" className={`${inputClass} h-10 text-[14px]`} />
          {error && <p className="m-0 text-[13px] text-danger">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={pending || !email.trim()} className={`${btn.primary} h-9 px-4 text-[13px]`}>
              Create login
            </button>
            <button type="button" onClick={() => setAdding(false)} className={`${btn.secondary} h-9 px-4 text-[13px]`}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="flex cursor-pointer items-center gap-1.5 self-start text-[13px] font-medium text-accent-text hover:underline">
          <UserPlus size={14} />
          {admins.length ? 'Add another login' : 'Create a login for the client'}
        </button>
      )}
    </section>
  );
}
