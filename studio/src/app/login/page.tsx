import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Logo } from '@/components/logo';
import { getUser } from '@/lib/auth';
import { isDevStore } from '@/lib/env';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage() {
  if (await getUser()) redirect('/');
  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg p-6">
      <div className="flex w-full max-w-[360px] animate-fade-up-slow flex-col items-center gap-10">
        <Logo kind="lockup-stacked" className="h-auto w-[200px]" />
        <LoginForm devHint={isDevStore() ? 'Dev store: sign in with SONO_DEV_EMAIL / SONO_DEV_PASSWORD (default dev@sono.studio / studio).' : null} />
      </div>
    </main>
  );
}
