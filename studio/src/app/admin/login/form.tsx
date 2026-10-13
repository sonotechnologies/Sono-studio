'use client';

import { startTransition, useActionState } from 'react';
import { btn, inputClass } from '@/components/ui';
import { adminSignInAction } from '../actions';

export function AdminLoginForm() {
  const [error, action, pending] = useActionState(adminSignInAction, null);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => action(data));
      }}
      className="flex w-full flex-col gap-4"
    >
      <label className="flex flex-col gap-1.5 text-[14px] font-medium">
        Email
        <input name="email" type="email" autoComplete="username" required className={`${inputClass} h-[46px] text-[16px]`} />
      </label>
      <label className="flex flex-col gap-1.5 text-[14px] font-medium">
        Password
        <input name="password" type="password" autoComplete="current-password" required className={`${inputClass} h-[46px] text-[16px]`} />
      </label>
      {error && (
        <p role="alert" className="m-0 text-[14px] text-danger">
          {error}
        </p>
      )}
      <button type="submit" disabled={pending} className={`${btn.primary} mt-2 h-12 w-full text-[16px] active:scale-[0.98]`}>
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
