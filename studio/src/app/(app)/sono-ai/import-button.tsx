'use client';

import { useState, useTransition } from 'react';
import { MiniSpin } from '@/components/orbit';
import { btn } from '@/components/ui';
import { importHistoryAction } from './actions';

export function ImportButton() {
  const [pending, start] = useTransition();
  const [note, setNote] = useState('');
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled={pending}
        className={`${btn.secondary} h-10 px-4 text-[14px]`}
        onClick={() =>
          start(async () => {
            const r = await importHistoryAction();
            setNote(
              r.error ??
                `Checked ${r.result!.projects} projects: ${r.result!.interactions} past requests (new ones added, ones already there skipped) and ${r.result!.outcomes} outcomes.`,
            );
          })
        }
      >
        {pending ? <MiniSpin /> : null}
        {pending ? 'Importing…' : 'Import past history'}
      </button>
      {note && <span className="text-[14px] text-muted" role="status">{note}</span>}
    </div>
  );
}
