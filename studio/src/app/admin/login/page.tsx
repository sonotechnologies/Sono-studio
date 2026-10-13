import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Logo } from '@/components/logo';
import { adminToken } from '@/lib/admin';
import { getRepo } from '@/lib/auth';
import { AdminLoginForm } from './form';

export const metadata: Metadata = { title: 'Sign in to edit your website', robots: { index: false } };

export default async function AdminLoginPage() {
  const token = await adminToken();
  if (token && (await (await getRepo()).adminMe(token))) redirect('/admin');
  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg p-6">
      <div className="flex w-full max-w-[360px] animate-fade-up-slow flex-col gap-8">
        <div className="flex flex-col gap-2">
          <h1 className="m-0 text-[26px] font-semibold tracking-[-0.02em]">Edit your website</h1>
          <p className="m-0 text-[15px] leading-normal text-muted">Sign in with the email and password your web designer gave you.</p>
        </div>
        <AdminLoginForm />
        <span className="flex items-center gap-2 self-center text-[12px] text-muted">
          Made with <Logo kind="mark" alt="Sono" className="h-3.5 w-auto" /> Sono Studio
        </span>
      </div>
    </main>
  );
}
