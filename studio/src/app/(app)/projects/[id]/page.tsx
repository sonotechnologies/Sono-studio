import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Page } from '@/components/shell';
import { getRepo, requireUser } from '@/lib/auth';
import { pitchUrl, siteUrl } from '@/lib/format';
import { handoverChecklist } from '@/export/checklist';
import { cardProviders, depositProviders } from '@/site/store/payments-info';
import { siteConfigSchema } from '@/site/schema';
import { copyChecklist } from '@/mirror/checklist';
import { ProjectDetails } from './project-details';

type Props = { params: Promise<{ id: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function load(id: string) {
  if (!UUID.test(id)) return null;
  return (await getRepo()).getProject(id);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const project = await load((await params).id);
  return { title: project?.name ?? 'Project' };
}

export default async function ProjectPage({ params }: Props) {
  await requireUser();
  const project = await load((await params).id);
  if (!project) notFound();
  const repo = await getRepo();
  const [job, events, version, keys, latest] = await Promise.all([
    repo.getLatestJob(project.id),
    repo.listPitchEvents(project.id, 50),
    repo.getSiteVersion(project.id),
    repo.listProviderKeys(),
    repo.getLatestDeployment(project.id),
  ]);
  const shop = !!(version && (version.config as { store?: unknown }).store);
  const admins = version ? await repo.listSiteAdmins(project.id) : null;
  const orders = shop ? await repo.listOrders(project.id, 100) : null;
  const copy = version ? null : await repo.getSiteCopyMeta(project.id);
  const parsed = version ? siteConfigSchema.safeParse(version.config) : null;
  const bookingsConfig = parsed?.success ? parsed.data.bookings : undefined;
  // From a week ago, so recent ones can be marked done or no-show.
  const bookings = bookingsConfig ? { list: await repo.listBookings(project.id, new Date(Date.now() - 7 * 86_400_000).toISOString(), 200), timezone: bookingsConfig.timezone } : null;
  const website = parsed?.success
    ? {
        version: version!.version,
        checklist: handoverChecklist(parsed.data),
        hasVercel: keys.some((k) => k.provider === 'vercel'),
        hasGithub: keys.some((k) => k.provider === 'github'),
        latest,
        payments: [...new Set([...cardProviders(parsed.data.store), ...depositProviders(parsed.data.bookings)])],
      }
    : copy
      ? {
          version: 1,
          checklist: copyChecklist(copy),
          hasVercel: keys.some((k) => k.provider === 'vercel'),
          hasGithub: keys.some((k) => k.provider === 'github'),
          latest,
        }
      : null;
  const setup = job && job.status !== 'done' ? { jobId: job.id, status: job.status } : null;
  return (
    <Page title={project.name} width={1200}>
      <ProjectDetails project={project} link={pitchUrl(project.pitchSlug)} now={Date.now()} setup={setup} events={events} website={website} copy={copy} orders={orders} bookings={bookings} admins={admins} adminUrl={`${siteUrl()}/admin`} />
    </Page>
  );
}
