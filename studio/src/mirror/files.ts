import 'server-only';
import { unstable_cache } from 'next/cache';
import { fileFor, filesOf } from './zip-files';

/*
 * One file of a site copy, without downloading the whole zip each time. The
 * zip lives in Supabase Storage, and every server that started cold used to
 * download all of it (up to 45 MB) to show one page or one thumbnail. Files
 * are kept in the hosting's shared cache instead, in pieces under its 2 MB
 * limit, keyed by the copy's date: copying again starts a new set.
 */

const PART = 1_400_000;
const KEEP = 30 * 86_400;

type LoadZip = () => Promise<Uint8Array | null>;

/** The copy's file names, so a request path can be matched without the zip. */
function names(projectId: string, copiedAt: string, loadZip: LoadZip): Promise<string[] | null> {
  return unstable_cache(
    async () => {
      const files = await filesOf(`${projectId}:${copiedAt}`, loadZip);
      return files ? Object.keys(files) : null;
    },
    ['copy-names', projectId, copiedAt],
    { revalidate: KEEP },
  )();
}

function part(projectId: string, copiedAt: string, path: string, index: number, loadZip: LoadZip): Promise<{ data: string; parts: number } | null> {
  return unstable_cache(
    async () => {
      const files = await filesOf(`${projectId}:${copiedAt}`, loadZip);
      const f = files?.[path];
      if (!f) return null;
      return { data: Buffer.from(f.subarray(index * PART, (index + 1) * PART)).toString('base64'), parts: Math.max(1, Math.ceil(f.byteLength / PART)) };
    },
    ['copy-part', projectId, copiedAt, path, String(index)],
    { revalidate: KEEP },
  )();
}

/** The file a request path means ("" → index.html, "about" → about.html), and its bytes. */
export async function copyFile(projectId: string, copiedAt: string, requestPath: string, loadZip: LoadZip): Promise<{ path: string; data: Uint8Array } | 'missing' | null> {
  const list = await names(projectId, copiedAt, loadZip);
  if (!list) return null;
  const path = fileFor(Object.fromEntries(list.map((n) => [n, new Uint8Array(1)])), requestPath);
  if (!path) return 'missing';
  const first = await part(projectId, copiedAt, path, 0, loadZip);
  if (!first) return 'missing';
  const rest = await Promise.all(Array.from({ length: first.parts - 1 }, (_, i) => part(projectId, copiedAt, path, i + 1, loadZip)));
  const chunks = [first, ...rest].map((p) => Buffer.from(p?.data ?? '', 'base64'));
  return { path, data: new Uint8Array(Buffer.concat(chunks)) };
}

/** Every page of the copy, as HTML text (for the editor's AI and "every page"). */
export async function copyPages(projectId: string, copiedAt: string, loadZip: LoadZip): Promise<Record<string, string>> {
  const list = (await names(projectId, copiedAt, loadZip)) ?? [];
  const pages = await Promise.all(
    list
      .filter((n) => n.endsWith('.html'))
      .map(async (n) => {
        const f = await copyFile(projectId, copiedAt, n, loadZip);
        return [n, f && f !== 'missing' ? new TextDecoder().decode(f.data) : ''] as const;
      }),
  );
  return Object.fromEntries(pages);
}
