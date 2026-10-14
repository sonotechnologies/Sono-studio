import { Page } from '@/components/shell';
import { getRepo, requireUser } from '@/lib/auth';
import { sonoAiEnabled } from '@/sono-ai';
import { assistStore } from '@/sono-ai/assist/store';
import { Dashboard } from './dashboard';

export default async function DashboardPage() {
  await requireUser();
  const [projects, builds] = await Promise.all([
    (await getRepo()).listProjects(),
    sonoAiEnabled() ? assistStore().then((a) => a.builds()).catch(() => []) : Promise.resolve([]),
  ]);
  return (
    <Page title="Projects">
      <Dashboard projects={projects} now={Date.now()} sonoStarted={builds.flatMap((b) => (b.projectId ? [b.projectId] : []))} />
    </Page>
  );
}
