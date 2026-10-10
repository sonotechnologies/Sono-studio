import type { Metadata } from 'next';
import { Page } from '@/components/shell';
import { requireUser } from '@/lib/auth';

export const metadata: Metadata = { title: 'Section library' };

export default async function LibraryPage() {
  await requireUser();
  return (
    <Page title="Section library">
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center">
        <p className="m-0 text-[20px] font-medium">The section library is built in phase 2.</p>
        <p className="m-0 max-w-[480px] text-[15px] leading-normal text-muted">
          Hero, gallery, menu, reviews, contact and the rest, each with two to four variants, will be catalogued here.
        </p>
      </div>
    </Page>
  );
}
