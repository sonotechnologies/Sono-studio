import { Page } from '@/components/shell';
import { getRepo, requireUser } from '@/lib/auth';
import { sonoAiEnabled } from '@/sono-ai';
import { assistStore } from '@/sono-ai/assist/store';
import { Dashboard } from './dashboard';

export default async function DashboardPage() {
  await requireUser();
  const repo = await getRepo();
  const [projects, copies, builds] = await Promise.all([
    repo.listProjects(),
    repo.listSiteCopyThumbs().catch(() => ({})),
    sonoAiEnabled() ? assistStore().then((a) => a.builds()).catch(() => []) : Promise.resolve([]),
  ]);
  return (
    <Page title="Projects">
      <Dashboard projects={projects} copies={copies} now={Date.now()} sonoStarted={builds.flatMap((b) => (b.projectId ? [b.projectId] : []))} />
    </Page>
  );
}
