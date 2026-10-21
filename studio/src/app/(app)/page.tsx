import { after } from 'next/server';
import { Page } from '@/components/shell';
import { ensureOrderSecret } from '@/lib/checkout';
import { getRepo, requireUser } from '@/lib/auth';
import { sonoAiEnabled } from '@/sono-ai';
import { assistStore } from '@/sono-ai/assist/store';
import { Dashboard } from './dashboard';

export default async function DashboardPage() {
  await requireUser();
  const repo = await getRepo();
  // Keeps the database able to check test payments on pitch links.
  after(() => ensureOrderSecret(repo));
  const [projects, copies, builds] = await Promise.all([
    repo.listProjects(),
    repo.listSiteCopyThumbs().catch(() => ({})),
    sonoAiEnabled() ? assistStore().then((a) => a.startedProjects()).catch(() => []) : Promise.resolve([] as string[]),
  ]);
  return (
    <Page title="Projects">
      <Dashboard projects={projects} copies={copies} now={Date.now()} sonoStarted={builds} />
    </Page>
  );
}
