import { zipSync } from 'fflate';
import { exportProject } from '@/deploy/run';
import { getRepo, getUser } from '@/lib/auth';

export const maxDuration = 60;

/** Downloads the current version as a standalone Next.js project. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getUser())) return new Response('Not signed in', { status: 401 });
  const { id } = await params;
  try {
    const site = await exportProject(await getRepo(), id, new URL(req.url).origin);
    const folder = `${site.name}-v${site.version}`;
    const zip = zipSync(Object.fromEntries(site.files.map((f) => [`${folder}/${f.path}`, typeof f.data === 'string' ? new TextEncoder().encode(f.data) : f.data])), { level: 6 });
    return new Response(zip as unknown as BodyInit, {
      headers: {
        'content-type': 'application/zip',
        'content-disposition': `attachment; filename="${folder}.zip"`,
        'cache-control': 'no-store',
      },
    });
  } catch (err) {
    return new Response((err as Error).message, { status: 400 });
  }
}
