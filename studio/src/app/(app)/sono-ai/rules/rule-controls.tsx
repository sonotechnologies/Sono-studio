'use client';

import { Trash2 } from 'lucide-react';
import { useState, useTransition } from 'react';
import { Switch, btn, inputClass } from '@/components/ui';
import type { Rule } from '@/sono-ai/assist/types';
import { addRuleAction, deleteRuleAction, setRuleEnabledAction } from '../assist-actions';

export function RuleRow({ rule }: { rule: Rule }) {
  const [pending, start] = useTransition();
  return (
    <li className={`flex items-center gap-4 px-4 py-3 ${pending ? 'opacity-60' : ''}`}>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={`text-[15px] ${rule.enabled ? '' : 'text-muted line-through'}`}>{rule.text}</span>
        <span className="text-[12px] text-muted">
          Added {new Date(rule.createdAt).toLocaleDateString('en-GB', { dateStyle: 'medium' })} {rule.source === 'telegram' ? 'on Telegram' : 'in the studio'}
        </span>
      </div>
      <Switch on={rule.enabled} onChange={(v) => start(() => setRuleEnabledAction(rule.id, v))} label={rule.enabled ? 'On' : 'Off'} />
      <button type="button" aria-label="Delete rule" title="Delete rule" onClick={() => start(() => deleteRuleAction(rule.id))} className="cursor-pointer rounded-lg p-2 text-muted hover:bg-hover hover:text-danger">
        <Trash2 size={16} />
      </button>
    </li>
  );
}

export function AddRule() {
  const [text, setText] = useState('');
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-wrap gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await addRuleAction(text);
          if (r.ok) setText('');
        });
      }}
    >
      <input value={text} onChange={(e) => setText(e.target.value)} maxLength={500} placeholder="Add a rule, e.g. Keep follow-ups under three sentences" className={`${inputClass} h-11 min-w-[240px] flex-1`} />
      <button type="submit" disabled={pending || text.trim().length < 3} className={`${btn.primary} h-11 px-5 text-[15px]`}>
        Add rule
      </button>
    </form>
  );
}
