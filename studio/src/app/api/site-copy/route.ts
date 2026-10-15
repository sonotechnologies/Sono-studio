import { zipSync } from 'fflate';
import { NextResponse } from 'next/server';
import { getRepo, getUser } from '@/lib/auth';
import { pitchSlug } from '@/lib/format';
import { copySite } from '@/mirror/copy';
import { LinkError } from '@/style/link';

// Copying a whole site can take a few minutes.
export const maxDuration = 300;

/**
 * Copies a client's own site as it is into a project: a new one, or an
 * existing copy refreshed. The person confirms the site is their client's.
 */
export async function POST(req: Request) {
  if (!(await getUser())) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { name?: string; url?: string; confirmed?: boolean; projectId?: string };
  if (body.confirmed !== true) return NextResponse.json({ error: 'Tick the box to confirm the site belongs to your client.' }, { status: 400 });
  const url = String(body.url ?? '').trim().slice(0, 500);
  if (!url) return NextResponse.json({ error: 'Enter the site’s address.' }, { status: 400 });

  let copy;
  try {
    copy = await copySite(url);
  } catch (err) {
    if (!(err instanceof LinkError)) console.error('site copy failed', err);
    return NextResponse.json({ error: err instanceof LinkError ? err.message : 'That site couldn’t be copied. Check the address.' }, { status: 400 });
  }

  const repo = await getRepo();
  let projectId = body.projectId ?? '';
  if (projectId) {
    if (!(await repo.getProject(projectId))) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    // Edits made in the editor carry over; any whose spot changed on the site are left out when applied.
    const before = await repo.getSiteCopyMeta(projectId);
    if (before?.edits?.length) Object.assign(copy.meta, { edits: before.edits, editedAt: before.editedAt });
  } else {
    const name = (String(body.name ?? '').trim() || new URL(copy.meta.sourceUrl).hostname.replace(/^www\./, '')).slice(0, 80);
    const settings = await repo.getSettings();
    const project = await repo.createProject(
      {
        name,
        businessType: 'Existing site',
        siteType: 'showcase',
        preset: 'clean-corporate',
        headline: '',
        client: { ownerName: '', whatsapp: '', instagram: '', address: '', notes: `Exact copy of ${copy.meta.sourceUrl}` },
      },
      { pitchSlug: pitchSlug(name), pitchBanner: settings.bannerDefault },
    );
    projectId = project.id;
  }
  const zip = zipSync(Object.fromEntries(copy.files.map((f) => [f.path, f.data])), { level: 6 });
  try {
    await repo.saveSiteCopy(projectId, copy.meta, zip);
  } catch (err) {
    return NextResponse.json({ error: `The copy couldn’t be saved: ${(err as Error).message}` }, { status: 500 });
  }
  return NextResponse.json({ projectId, meta: copy.meta });
}
