import { Page } from '@/components/shell';
import { getRepo, requireUser } from '@/lib/auth';
import { Dashboard } from './dashboard';

export default async function DashboardPage() {
  await requireUser();
  const projects = await (await getRepo()).listProjects();
  return (
    <Page title="Projects">
      <Dashboard projects={projects} now={Date.now()} />
    </Page>
  );
}
