import type { Metadata } from 'next';
import { Page } from '@/components/shell';
import { requireUser } from '@/lib/auth';
import { CopyForm } from './copy-form';

export const metadata: Metadata = { title: 'Copy a site as it is' };

export default async function CopySitePage() {
  await requireUser();
  return (
    <Page title="Copy a site as it is" width={760} newSite={false}>
      <CopyForm />
    </Page>
  );
}
