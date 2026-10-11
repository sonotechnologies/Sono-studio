'use client';

import { AlertTriangle, Check, CircleCheck, ExternalLink, Rocket, X } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChecklistItem } from '@/export/checklist';
import type { Deployment } from '@/lib/data/repo';
import { MiniSpin } from './orbit';
import { btn } from './ui';

type Phase = 'confirm' | 'uploading' | 'building' | 'live' | 'error';

const POLL_MS = 4000;

/** Fetches the latest deploy (the server checks on Vercel while it builds). */
export async function fetchDeployment(projectId: string): Promise<Deployment | null> {
  const res = await fetch(`/api/projects/${projectId}/deploy`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Couldn’t check the deploy');
  return ((await res.json()) as { deployment: Deployment | null }).deployment;
}

export function ChecklistList({ items }: { items: ChecklistItem[] }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
      {items.map((c) => (
        <li key={c.key} className="flex gap-2.5 text-[13px] leading-normal">
          <span className={`mt-0.5 flex-none ${c.done ? 'text-success' : c.important ? 'text-warn' : 'text-muted'}`}>
            {c.done ? <CircleCheck size={15} /> : c.important ? <AlertTriangle size={15} /> : <span className="block size-[15px] rounded-full border-[1.5px] border-current" />}
          </span>
          <span>
            <span className="font-medium">{c.title}.</span> <span className="text-muted">{c.detail}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function DeployDialog({
  projectId,
  projectName,
  version,
  checklist,
  hasVercel,
  hasGithub,
  initial,
  beforeDeploy,
  onDone,
  onClose,
}: {
  projectId: string;
  projectName: string;
  version: number;
  checklist: ChecklistItem[];
  hasVercel: boolean;
  hasGithub: boolean;
  initial: Deployment | null;
  /** Saves pending edits first, so the deploy has them. */
  beforeDeploy?: () => Promise<void>;
  onDone?: (d: Deployment) => void;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<Phase>(initial?.status === 'building' && initial.vercelDeploymentId ? 'building' : 'confirm');
  const [d, setD] = useState<Deployment | null>(initial);
  const [error, setError] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const started = useRef(Date.now());

  const poll = useCallback(async () => {
    try {
      const next = await fetchDeployment(projectId);
      setD(next);
      if (next?.status === 'ready') {
        setPhase('live');
        onDone?.(next);
        return;
      }
      if (next?.status === 'error') {
        setError(next.error ?? 'The deploy failed.');
        setPhase('error');
        return;
      }
    } catch {}
    if (Date.now() - started.current > 15 * 60_000) {
      setError('Still building after 15 minutes. Check the project in your Vercel dashboard.');
      setPhase('error');
      return;
    }
    timer.current = setTimeout(poll, POLL_MS);
  }, [projectId, onDone]);

  useEffect(() => {
    if (phase === 'building') timer.current = setTimeout(poll, POLL_MS);
    return () => clearTimeout(timer.current);
  }, [phase, poll]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && phase !== 'uploading' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, phase]);

  const deploy = async () => {
    setError('');
    setPhase('uploading');
    started.current = Date.now();
    try {
      await beforeDeploy?.();
      const res = await fetch(`/api/projects/${projectId}/deploy`, { method: 'POST' });
      const body = (await res.json()) as { deployment?: Deployment; error?: string };
      if (!res.ok || !body.deployment) throw new Error(body.error ?? 'The deploy couldn’t start.');
      setD(body.deployment);
      if (body.deployment.status === 'error') throw new Error(body.deployment.error ?? 'The deploy failed.');
      setPhase('building');
    } catch (err) {
      setError((err as Error).message);
      setPhase('error');
    }
  };

  const target = d?.url ?? (d?.vercelProject ? `https://${d.vercelProject}.vercel.app` : null);
  const redeploy = !!initial && initial.status === 'ready';
  const warnings = checklist.filter((c) => !c.done && c.important);

  return (
    <div onClick={() => phase !== 'uploading' && onClose()} className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(22,20,15,.45)] sm:items-center sm:p-5">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="deploy-title"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90dvh] w-full animate-fade-up flex-col gap-4 overflow-auto rounded-t-[18px] border border-border bg-raised p-6 shadow-raised sm:w-[480px] sm:rounded-dialog"
      >
        <div className="flex items-start gap-3">
          <h2 id="deploy-title" className="m-0 flex-1 text-[20px] font-semibold tracking-[-0.01em]">
            {phase === 'live' ? `${projectName} is live` : phase === 'error' ? 'The deploy didn’t finish' : redeploy ? `Redeploy ${projectName}?` : `Deploy ${projectName}?`}
          </h2>
          {phase !== 'uploading' && (
            <button type="button" onClick={onClose} aria-label="Close" className="-mt-1 -mr-2 flex size-9 cursor-pointer items-center justify-center rounded-full text-muted hover:bg-hover hover:text-text">
              <X size={18} />
            </button>
          )}
        </div>

        {phase === 'confirm' && !hasVercel && (
          <>
            <p className="m-0 text-[14px] leading-[1.55] text-muted">
              Deploying needs a Vercel token, and a GitHub token if you want the code kept in a repository. Add them once in Settings; it takes about two minutes.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <a href={`/api/projects/${projectId}/export`} className={`${btn.secondary} h-10 px-4 text-[14px]`}>
                Export zip instead
              </a>
              <Link href="/settings?tab=connections" className={`${btn.primary} h-10 px-4 text-[14px]`}>
                Open Settings
              </Link>
            </div>
          </>
        )}

        {phase === 'confirm' && hasVercel && (
          <>
            <p className="m-0 text-[14px] leading-[1.55] text-muted">
              This publishes version {version} to{' '}
              {target ? <span className="font-mono text-[13px] text-text">{target.replace(/^https:\/\//, '')}</span> : 'a new Vercel project'}. The pitch link will point to the live site.
              {hasGithub ? ' The code is also saved to a private GitHub repository.' : ' Add a GitHub token in Settings to also keep the code in a repository.'}
            </p>
            {warnings.length > 0 && (
              <div className="flex flex-col gap-2.5 rounded-xl bg-warn-bg p-3.5">
                <span className="text-[13px] font-semibold text-warn">Before a client sees it</span>
                <ChecklistList items={warnings} />
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={onClose} className={`${btn.secondary} h-10 px-4 text-[14px]`}>
                Cancel
              </button>
              <button type="button" onClick={deploy} className={`${btn.primary} h-10 px-[18px] text-[14px]`}>
                <Rocket size={16} />
                {redeploy ? 'Redeploy' : 'Deploy'}
              </button>
            </div>
          </>
        )}

        {(phase === 'uploading' || phase === 'building') && (
          <ol className="m-0 flex list-none flex-col gap-3 p-0 text-[14px]" aria-live="polite">
            <Step state={phase === 'uploading' ? 'active' : 'done'} label={hasGithub ? 'Exporting, saving to GitHub and uploading' : 'Exporting and uploading'} />
            <Step state={phase === 'building' ? 'active' : 'waiting'} label="Building on Vercel (usually about a minute)" />
            <Step state="waiting" label="Live" />
            <li className="pt-1 text-[13px] text-muted">{phase === 'building' ? 'You can close this; the build carries on and the project page shows when it’s live.' : 'Keep this open for a moment.'}</li>
          </ol>
        )}

        {phase === 'live' && d && (
          <>
            <p className="m-0 text-[14px] leading-[1.55] text-muted">Version {d.version} is published. Anyone with the pitch link now goes to the live site.</p>
            <div className="flex flex-col gap-1.5 text-[14px]">
              <a href={d.url!} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 font-mono text-[13px] font-medium text-accent-text hover:underline">
                {d.url!.replace(/^https:\/\//, '')}
                <ExternalLink size={13} />
              </a>
              {d.repoUrl && (
                <a href={d.repoUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-[13px] text-muted hover:text-text hover:underline">
                  Code: {d.repoFullName}
                  <ExternalLink size={12} />
                </a>
              )}
            </div>
            <div className="flex flex-col gap-2.5 border-t border-border pt-4">
              <span className="text-[13px] font-semibold">Handover checklist</span>
              <ChecklistList items={checklist} />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <a href={d.url!} target="_blank" rel="noreferrer" className={`${btn.primary} h-10 px-4 text-[14px]`}>
                View site
                <ExternalLink size={15} />
              </a>
            </div>
          </>
        )}

        {phase === 'error' && (
          <>
            <p role="alert" className="m-0 rounded-xl bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] p-3.5 text-[14px] leading-[1.55] text-danger">
              {error}
            </p>
            {d?.vercelProject && (
              <a href={`https://vercel.com/dashboard`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-[13px] font-medium text-accent-text hover:underline">
                Open the Vercel dashboard
                <ExternalLink size={12} />
              </a>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={onClose} className={`${btn.secondary} h-10 px-4 text-[14px]`}>
                Close
              </button>
              <button type="button" onClick={deploy} className={`${btn.primary} h-10 px-4 text-[14px]`}>
                Try again
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Step({ state, label }: { state: 'done' | 'active' | 'waiting'; label: string }) {
  return (
    <li className={`flex items-center gap-3 ${state === 'waiting' ? 'text-muted' : ''}`}>
      <span className="flex size-5 flex-none items-center justify-center">
        {state === 'done' ? (
          <span className="flex size-5 items-center justify-center rounded-full bg-terracotta text-white">
            <Check size={12} strokeWidth={3} />
          </span>
        ) : state === 'active' ? (
          <MiniSpin />
        ) : (
          <span className="size-4 rounded-full border-2 border-border" />
        )}
      </span>
      {label}
    </li>
  );
}
