import type { Metadata } from 'next';
import { Page } from '@/components/shell';
import { requireUser } from '@/lib/auth';
import { NewProjectForm } from './new-project-form';

export const metadata: Metadata = { title: 'New site' };

export default async function NewProjectPage() {
  await requireUser();
  return (
    <Page title="New site" width={880} newSite={false}>
      <NewProjectForm />
    </Page>
  );
}
