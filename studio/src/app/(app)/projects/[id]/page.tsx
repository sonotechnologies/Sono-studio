import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Page } from '@/components/shell';
import { getRepo, requireUser } from '@/lib/auth';
import { pitchUrl, siteUrl } from '@/lib/format';
import { handoverChecklist } from '@/export/checklist';
import { cardProviders, depositProviders } from '@/site/store/payments-info';
import { sonoAiEnabled } from '@/sono-ai';
import { assistStore } from '@/sono-ai/assist/store';
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
  const startedBy = sonoAiEnabled() ? ((await assistStore().then((a) => a.builds()).catch(() => [])).find((b) => b.projectId === project.id) ?? null) : null;
  const [job, events, version, keys, latest] = await Promise.all([
    repo.getLatestJob(project.id),
    repo.listPitchEvents(project.id, 50),
    repo.getSiteVersion(project.id),
    repo.listProviderKeys(),
    repo.getLatestDeployment(project.id),
  ]);
  const shop = !!(version && (version.config as { store?: unknown }).store);
  const parsed = version ? siteConfigSchema.safeParse(version.config) : null;
  const bookingsConfig = parsed?.success ? parsed.data.bookings : undefined;
  // These depend only on what the site has, so they load together.
  const [admins, orders, copy, bookingList] = await Promise.all([
    version ? repo.listSiteAdmins(project.id) : null,
    shop ? repo.listOrders(project.id, 100) : null,
    version ? null : repo.getSiteCopyMeta(project.id),
    // From a week ago, so recent ones can be marked done or no-show.
    bookingsConfig ? repo.listBookings(project.id, new Date(Date.now() - 7 * 86_400_000).toISOString(), 200) : null,
  ]);
  const bookings = bookingsConfig && bookingList ? { list: bookingList, timezone: bookingsConfig.timezone } : null;
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
      {startedBy && (
        <p className="m-0 -mb-3 text-[14px] text-muted">
          <span className="font-medium text-accent-text">Started by Sono AI</span> from “{startedBy.request.slice(0, 160)}”. Sending the pitch is still up to you.
        </p>
      )}
      <ProjectDetails project={project} link={pitchUrl(project.pitchSlug)} now={Date.now()} setup={setup} events={events} website={website} copy={copy} orders={orders} bookings={bookings} admins={admins} adminUrl={`${siteUrl()}/admin`} />
    </Page>
  );
}
