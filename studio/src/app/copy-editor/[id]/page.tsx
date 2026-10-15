import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { ToastProvider } from '@/components/ui';
import { getRepo, requireUser } from '@/lib/auth';
import { applyEdits } from '@/mirror/edit';
import { copyPages } from '@/mirror/files';
import { CopyEditor } from '../editor';

export const metadata: Metadata = { title: 'Edit the copy' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Click-to-edit for an exact copy: its words, pictures and links, without touching its layout. */
export default async function CopyEditorPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ page?: string }> }) {
  await requireUser();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const repo = await getRepo();
  const [project, meta] = await Promise.all([repo.getProject(id), repo.getSiteCopyMeta(id)]);
  if (!project) notFound();
  if (!meta) redirect(`/projects/${id}`);
  const edits = meta.edits ?? [];

  // Changes whose spot says something else since the site was copied again.
  let stale: number[] = [];
  if (edits.length) {
    const pages = Object.entries(await copyPages(id, meta.copiedAt, async () => (await repo.getSiteCopy(id))?.zip ?? null));
    const skipped = new Set(pages.flatMap(([p, html]) => applyEdits(p, html, edits).skipped));
    // An "every page" change only counts as stale when it applied nowhere.
    const applied = new Set(pages.flatMap(([p, html]) => edits.filter((e) => e.page === '*' && applyEdits(p, html, [e]).html !== html)));
    stale = edits.flatMap((e, i) => ((e.page === '*' ? !applied.has(e) : skipped.has(e)) ? [i] : []));
  }

  const { page } = await searchParams;
  const pages = meta.pages.map((p) => ({ path: p.path, title: p.title }));
  return (
    <ToastProvider>
      <CopyEditor
        projectId={id}
        name={project.name}
        pages={pages}
        initialEdits={edits}
        stale={stale}
        startPage={pages.some((p) => p.path === page) ? page! : (pages[0]?.path ?? 'index.html')}
      />
    </ToastProvider>
  );
}
