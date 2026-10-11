import { createHash } from 'node:crypto';
import type { ExportFile } from '@/export/generate';
import { DeployError, reach } from './github';

/*
 * Deploys an exported site to Vercel by uploading its files and creating a
 * production deployment; Vercel builds it. This works whether or not Vercel's
 * GitHub app can see the repository, and keeps the deploy step independent of
 * where the code is stored.
 */

type Fetch = typeof fetch;
const API = 'https://api.vercel.com';

function client(token: string, f: Fetch) {
  return async function vc<T>(method: string, path: string, body?: unknown, extra: { headers?: Record<string, string>; raw?: Uint8Array; okStatuses?: number[] } = {}): Promise<T | null> {
    const res = await reach('Vercel', () =>
      f(`${API}${path}`, {
        method,
        headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}), ...extra.headers },
        body: extra.raw ? (extra.raw as unknown as BodyInit) : body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(30_000),
      }),
    );
    if (extra.okStatuses?.includes(res.status)) return null;
    if (res.status === 401 || res.status === 403) {
      const text = await res.text().catch(() => '');
      if (res.status === 403 && /scope|team/i.test(text)) throw new DeployError('The Vercel token doesn’t have access to that account. Create a token with your personal account as its scope.');
      throw new DeployError('Vercel rejected the token. Add a new one in Settings → Connections.');
    }
    if (res.status === 429) throw new DeployError('Vercel’s rate limit was reached. Try again in a few minutes.');
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      let msg = text.slice(0, 200);
      try {
        msg = (JSON.parse(text) as { error?: { message?: string } }).error?.message ?? msg;
      } catch {}
      throw new DeployError(`Vercel: ${msg} (${res.status})`);
    }
    return (await res.json()) as T;
  };
}

export async function vercelAccount(token: string, f: Fetch = fetch): Promise<string> {
  const me = await client(token, f)<{ user: { username: string } }>('GET', '/v2/user');
  return me!.user.username;
}

const bytesOf = (d: string | Uint8Array) => (typeof d === 'string' ? new TextEncoder().encode(d) : d);

export interface VercelDeployment {
  id: string;
  project: string;
  /** The unique deployment address (may be protected); the production address comes from projectUrl(). */
  url: string;
}

/** A project name for this site: `existing` if this studio created one, otherwise a free name. */
async function chooseProject(vc: ReturnType<typeof client>, existing: string | null, name: string): Promise<string> {
  if (existing) return existing;
  for (let n = 1; n <= 20; n++) {
    const candidate = n === 1 ? name : `${name}-${n}`;
    const found = await vc('GET', `/v9/projects/${candidate}`, undefined, { okStatuses: [404] });
    if (!found) return candidate;
  }
  throw new DeployError('Couldn’t find a free Vercel project name.');
}

export async function deployToVercel(opts: { token: string; existing: string | null; name: string; files: ExportFile[]; fetch?: Fetch }): Promise<VercelDeployment> {
  const vc = client(opts.token, opts.fetch ?? fetch);
  const project = await chooseProject(vc, opts.existing, opts.name);

  const files = opts.files.map((f) => {
    const bytes = bytesOf(f.data);
    return { file: f.path, bytes, sha: createHash('sha1').update(bytes).digest('hex'), size: bytes.byteLength };
  });
  for (let i = 0; i < files.length; i += 6) {
    await Promise.all(
      files.slice(i, i + 6).map((f) =>
        vc('POST', '/v2/files', undefined, {
          raw: f.bytes,
          // fetch sets Content-Length from the body.
          headers: { 'content-type': 'application/octet-stream', 'x-vercel-digest': f.sha },
        }),
      ),
    );
  }
  const d = await vc<{ id: string; url: string }>('POST', '/v13/deployments?skipAutoDetectionConfirmation=1', {
    name: project,
    project,
    target: 'production',
    files: files.map((f) => ({ file: f.file, sha: f.sha, size: f.size })),
    projectSettings: { framework: 'nextjs' },
  });
  return { id: d!.id, project, url: `https://${d!.url}` };
}

export type BuildState = 'building' | 'ready' | 'error';

export async function deploymentState(opts: { token: string; id: string; fetch?: Fetch }): Promise<{ state: BuildState; error?: string }> {
  const vc = client(opts.token, opts.fetch ?? fetch);
  const d = await vc<{ readyState: string; errorMessage?: string }>('GET', `/v13/deployments/${opts.id}`);
  const s = d!.readyState;
  if (s === 'READY') return { state: 'ready' };
  if (s === 'ERROR' || s === 'CANCELED') return { state: 'error', error: d!.errorMessage || (s === 'CANCELED' ? 'The build was cancelled.' : 'The build failed. Open the deployment in Vercel to see the log.') };
  return { state: 'building' };
}

/** The public production address: a custom domain if one is added, otherwise project.vercel.app. */
export async function projectUrl(opts: { token: string; project: string; fetch?: Fetch }): Promise<string> {
  const vc = client(opts.token, opts.fetch ?? fetch);
  const r = await vc<{ domains: { name: string; verified?: boolean; redirect?: string | null }[] }>('GET', `/v9/projects/${opts.project}/domains`, undefined, { okStatuses: [404] });
  const domains = (r?.domains ?? []).filter((d) => d.verified !== false && !d.redirect);
  const custom = domains.find((d) => !d.name.endsWith('.vercel.app'));
  const pick = custom ?? domains[0];
  return `https://${pick ? pick.name : `${opts.project}.vercel.app`}`;
}
