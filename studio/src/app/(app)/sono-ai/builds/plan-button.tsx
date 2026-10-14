'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { MiniSpin } from '@/components/orbit';
import { btn } from '@/components/ui';
import { discardBuildAction, startBuildAction } from './actions';

export function PlanButtons({ id, started }: { id: string; started: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={pending}
        className={`${btn.primary} h-11 px-5 text-[15px]`}
        onClick={() =>
          start(async () => {
            const r = await startBuildAction(id).catch(() => ({ error: 'Couldn’t start it. Try again.', jobId: undefined }));
            if (r.jobId) router.push(`/new/${r.jobId}`);
            else setError(r.error ?? 'Couldn’t start it.');
          })
        }
      >
        {pending ? <MiniSpin /> : null}
        {started ? 'Open the plan' : pending ? 'Creating the project…' : 'Plan it'}
      </button>
      {!started && (
        <button type="button" disabled={pending} className={`${btn.ghost} h-11 px-4 text-[15px]`} onClick={() => start(async () => { await discardBuildAction(id); router.push('/sono-ai/builds'); })}>
          Discard
        </button>
      )}
      {error && <span role="status" className="text-[14px] text-danger">{error}</span>}
    </div>
  );
}
