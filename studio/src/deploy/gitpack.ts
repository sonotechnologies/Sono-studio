import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import type { ExportFile } from '@/export/generate';
import { DeployError, reach } from './errors';

/*
 * Pushes a whole site to GitHub as one git push (smart HTTP), the way the git
 * command does: every file, folder and the commit are packed into a single
 * request. The REST API needs a request per file, and GitHub's limits on
 * creating content stop a big site (an exact copy has hundreds of files)
 * partway through; a push has no such limit.
 */

type Fetch = typeof fetch;
type Kind = 'commit' | 'tree' | 'blob';
export interface GitObject {
  kind: Kind;
  sha: string;
  data: Uint8Array;
}

const enc = new TextEncoder();
const bytes = (d: string | Uint8Array) => (typeof d === 'string' ? enc.encode(d) : d);

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.byteLength;
  }
  return out;
}

function object(kind: Kind, data: Uint8Array): GitObject {
  const sha = createHash('sha1').update(`${kind} ${data.byteLength}\0`).update(data).digest('hex');
  return { kind, sha, data };
}

type Dir = Map<string, Dir | GitObject>;

/** Git orders tree entries by name, comparing a folder as if its name ended in "/". */
const sortKey = (name: string, v: Dir | GitObject) => (v instanceof Map ? `${name}/` : name);

function writeTree(dir: Dir, out: GitObject[]): GitObject {
  const entries = [...dir.entries()].sort(([a, va], [b, vb]) => {
    const ka = sortKey(a, va);
    const kb = sortKey(b, vb);
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
  const parts: Uint8Array[] = [];
  for (const [name, v] of entries) {
    const child = v instanceof Map ? writeTree(v, out) : v;
    parts.push(enc.encode(`${v instanceof Map ? '40000' : '100644'} ${name}\0`), Buffer.from(child.sha, 'hex'));
  }
  const tree = object('tree', concat(parts));
  out.push(tree);
  return tree;
}

/** The blobs, folders and commit for a set of files, as git would write them. */
export function buildCommit(opts: { files: ExportFile[]; message: string; parent: string | null; when?: Date }): { commit: string; objects: GitObject[] } {
  const objects: GitObject[] = [];
  const seen = new Set<string>();
  const root: Dir = new Map();
  for (const f of opts.files) {
    const segs = f.path.split('/');
    if (segs.some((s) => !s || s === '.' || s === '..' || s === '.git')) throw new DeployError(`Can’t save the file “${f.path}” to GitHub.`);
    let dir = root;
    for (const s of segs.slice(0, -1)) {
      let next = dir.get(s);
      if (!(next instanceof Map)) {
        next = new Map();
        dir.set(s, next);
      }
      dir = next;
    }
    const blob = object('blob', bytes(f.data));
    dir.set(segs.at(-1)!, blob);
    if (!seen.has(blob.sha)) {
      seen.add(blob.sha);
      objects.push(blob);
    }
  }
  const tree = writeTree(root, objects);
  const time = `${Math.floor((opts.when ?? new Date()).getTime() / 1000)} +0000`;
  const who = `Sono Studio <studio@sono.studio> ${time}`;
  const commit = object(
    'commit',
    enc.encode(`tree ${tree.sha}\n${opts.parent ? `parent ${opts.parent}\n` : ''}author ${who}\ncommitter ${who}\n\n${opts.message}\n`),
  );
  objects.push(commit);
  return { commit: commit.sha, objects };
}

const TYPE: Record<Kind, number> = { commit: 1, tree: 2, blob: 3 };

/** A version 2 packfile holding the objects, each compressed. */
export function packfile(objects: GitObject[]): Uint8Array {
  const head = new Uint8Array(12);
  head.set(enc.encode('PACK'));
  new DataView(head.buffer).setUint32(4, 2);
  new DataView(head.buffer).setUint32(8, objects.length);
  const parts: Uint8Array[] = [head];
  for (const o of objects) {
    let size = o.data.byteLength;
    const h: number[] = [(TYPE[o.kind] << 4) | (size & 0x0f)];
    size >>>= 4;
    while (size > 0) {
      h[h.length - 1] |= 0x80;
      h.push(size & 0x7f);
      size >>>= 7;
    }
    parts.push(Uint8Array.from(h), deflateSync(o.data));
  }
  const body = concat(parts);
  return concat([body, createHash('sha1').update(body).digest()]);
}

const pkt = (line: string) => {
  const b = enc.encode(line);
  return concat([enc.encode((b.byteLength + 4).toString(16).padStart(4, '0')), b]);
};

/** Splits a pkt-line stream into its lines (a flush is an empty string). */
export function readPkts(buf: Uint8Array): string[] {
  const out: string[] = [];
  const dec = new TextDecoder();
  for (let at = 0; at + 4 <= buf.byteLength; ) {
    const len = parseInt(dec.decode(buf.subarray(at, at + 4)), 16);
    if (Number.isNaN(len)) break;
    if (len === 0) {
      out.push('');
      at += 4;
      continue;
    }
    out.push(dec.decode(buf.subarray(at + 4, at + len)));
    at += len;
  }
  return out;
}

const ZERO = '0'.repeat(40);

/**
 * Commits the files on top of the branch and pushes them in one request.
 * `remote` is the repository's https address, e.g. https://github.com/me/site.git.
 */
export async function pushFiles(opts: { remote: string; token: string; branch: string; files: ExportFile[]; message: string; fetch?: Fetch }): Promise<{ commit: string }> {
  const f = opts.fetch ?? fetch;
  const auth = `Basic ${Buffer.from(`x-access-token:${opts.token}`).toString('base64')}`;
  const ref = `refs/heads/${opts.branch}`;

  // Where the branch is now.
  const info = await reach('GitHub', () =>
    f(`${opts.remote}/info/refs?service=git-receive-pack`, { headers: { authorization: auth }, signal: AbortSignal.timeout(20_000) }),
  );
  if (info.status === 401 || info.status === 403) throw new DeployError('GitHub refused the push. The token needs the “repo” scope (classic) or Contents write access (fine-grained).');
  if (!info.ok) throw new DeployError(`GitHub couldn’t be reached for the push (${info.status}).`);
  const lines = readPkts(new Uint8Array(await info.arrayBuffer()));
  const current = lines.map((l) => /^([0-9a-f]{40}) ([^\0\n]+)/.exec(l)).find((m) => m?.[2] === ref)?.[1] ?? null;

  const { commit, objects } = buildCommit({ files: opts.files, message: opts.message, parent: current });
  const body = concat([pkt(`${current ?? ZERO} ${commit} ${ref}\0report-status agent=sono-studio\n`), enc.encode('0000'), packfile(objects)]);
  const res = await reach('GitHub', () =>
    f(`${opts.remote}/git-receive-pack`, {
      method: 'POST',
      headers: { authorization: auth, 'content-type': 'application/x-git-receive-pack-request', accept: 'application/x-git-receive-pack-result' },
      body: body as unknown as BodyInit,
      signal: AbortSignal.timeout(120_000),
    }),
  );
  if (res.status === 401 || res.status === 403) throw new DeployError('GitHub refused the push. The token needs the “repo” scope (classic) or Contents write access (fine-grained).');
  if (!res.ok) throw new DeployError(`GitHub didn’t accept the push (${res.status}).`);
  const report = readPkts(new Uint8Array(await res.arrayBuffer())).map((l) => l.trim());
  const unpack = report.find((l) => l.startsWith('unpack '));
  const refLine = report.find((l) => l.endsWith(ref) || l.includes(` ${ref} `) || l.startsWith(`ok ${ref}`) || l.startsWith(`ng ${ref}`));
  if (unpack !== 'unpack ok' || !refLine?.startsWith('ok ')) {
    throw new DeployError(`GitHub didn’t accept the push: ${(refLine ?? unpack ?? 'no answer').replace(/^ng \S+ /, '').slice(0, 200)}`);
  }
  return { commit };
}
