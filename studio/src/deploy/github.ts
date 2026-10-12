import type { ExportFile } from '@/export/generate';
import { DeployError, reach } from './errors';
import { pushFiles } from './gitpack';

export { DeployError, reach };

/*
 * Saves an exported site to a private GitHub repository: the REST API finds or
 * creates the repository, then one git push carries the whole site as a single
 * commit, so the repo always matches what is live. No git binary is needed.
 */

type Fetch = typeof fetch;

const API = 'https://api.github.com';

function client(token: string, f: Fetch) {
  return async function gh<T>(method: string, path: string, body?: unknown, okStatuses: number[] = []): Promise<T | null> {
    const res = await reach('GitHub', () =>
      f(`${API}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${token}`,
          accept: 'application/vnd.github+json',
          'x-github-api-version': '2022-11-28',
          ...(body ? { 'content-type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(20_000),
      }),
    );
    if (okStatuses.includes(res.status)) return null;
    if (res.status === 401) throw new DeployError('GitHub rejected the token. Add a new one in Settings → Connections.');
    if (res.status === 403 || res.status === 404) {
      const text = await res.text().catch(() => '');
      if (/rate limit/i.test(text)) throw new DeployError('GitHub’s rate limit was reached. Try again in a few minutes.');
      if (res.status === 403) throw new DeployError('The GitHub token can’t do that. It needs the “repo” scope (classic token) or Administration and Contents write access (fine-grained).');
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new DeployError(`GitHub ${method} ${path.split('?')[0]} failed (${res.status}): ${text.slice(0, 200)}`);
    }
    return (res.status === 204 ? null : await res.json()) as T;
  };
}

export async function githubAccount(token: string, f: Fetch = fetch): Promise<string> {
  const me = await client(token, f)<{ login: string }>('GET', '/user');
  return me!.login;
}

export interface PushResult {
  fullName: string;
  url: string;
  commit: string;
}

/**
 * Commits the files to `existing` (a repo this studio created before) or to a
 * new private repo named after the site. Never writes to a repo it didn't create:
 * if the name is taken, a free variation is used.
 */
export async function pushToGitHub(opts: {
  token: string;
  existing: string | null;
  name: string;
  description: string;
  files: ExportFile[];
  message: string;
  /** Called as soon as the repository is known, so a push that fails still reuses it next time. */
  onRepo?: (repo: { fullName: string; url: string }) => Promise<void> | void;
  fetch?: Fetch;
}): Promise<PushResult> {
  const gh = client(opts.token, opts.fetch ?? fetch);
  type Repo = { full_name: string; html_url: string; default_branch: string };
  let repo: Repo | null = null;

  if (opts.existing) repo = await gh<Repo>('GET', `/repos/${opts.existing}`, undefined, [404]);
  if (!repo) {
    const login = (await gh<{ login: string }>('GET', '/user'))!.login;
    for (let n = 1; !repo && n <= 20; n++) {
      const name = n === 1 ? opts.name : `${opts.name}-${n}`;
      if (await gh<Repo>('GET', `/repos/${login}/${name}`, undefined, [404])) continue;
      repo = await gh<Repo>('POST', '/user/repos', { name, private: true, auto_init: true, description: opts.description.slice(0, 300) });
    }
    if (!repo) throw new DeployError('Couldn’t find a free repository name.');
  }

  await opts.onRepo?.({ fullName: repo.full_name, url: repo.html_url });

  // A new repository gets its first commit a moment after it is created.
  const branch = repo.default_branch || 'main';
  let head: string | null = null;
  for (let i = 0; i < 8 && !head; i++) {
    const ref = await gh<{ object: { sha: string } }>('GET', `/repos/${repo.full_name}/git/ref/heads/${branch}`, undefined, [404, 409]);
    head = ref?.object.sha ?? null;
    if (!head) await new Promise((r) => setTimeout(r, 750));
  }

  // Every file in one push: no base, so files the site no longer has are removed from the repo.
  const { commit } = await pushFiles({ remote: `https://github.com/${repo.full_name}.git`, token: opts.token, branch, files: opts.files, message: opts.message, fetch: opts.fetch });
  return { fullName: repo.full_name, url: repo.html_url, commit };
}
