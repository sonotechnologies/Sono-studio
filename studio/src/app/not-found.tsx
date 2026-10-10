import Link from 'next/link';
import { Logo } from '@/components/logo';

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-bg p-6 text-center">
      <Logo kind="mark" alt="Sono" className="h-12 w-auto" />
      <p className="m-0 text-[20px] font-medium">That page doesn’t exist.</p>
      <Link href="/" className="text-[14px] font-medium text-accent-text hover:underline">
        Back to projects
      </Link>
    </main>
  );
}
