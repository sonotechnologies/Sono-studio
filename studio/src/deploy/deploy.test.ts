import { describe, expect, it } from 'vitest';
import { DeployError, pushToGitHub } from './github';
import { deployToVercel, deploymentState, projectUrl } from './vercel';

type Call = { method: string; url: string; body: unknown };

/** A tiny fake API: routes are "METHOD path-prefix" → response. */
function fake(routes: Record<string, (body: unknown, url: string) => { status?: number; json?: unknown }>) {
  const calls: Call[] = [];
  const f = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body;
    calls.push({ method, url, body });
    const key = Object.keys(routes)
      .filter((k) => {
        const [m, p] = k.split(' ');
        return m === method && new URL(url).pathname.startsWith(p);
      })
      .sort((a, b) => b.length - a.length)[0];
    if (!key) return new Response('not found', { status: 404 });
    const r = routes[key](body, url);
    return new Response(r.json === undefined ? null : JSON.stringify(r.json), { status: r.status ?? 200 });
  }) as typeof fetch;
  return { f, calls };
}

const files = [
  { path: 'package.json', data: '{}' },
  { path: 'public/images/a.jpg', data: new Uint8Array([1, 2, 3]) },
];

describe('GitHub push', () => {
  it('creates a private repo the first time and commits every file', async () => {
    const { f, calls } = fake({
      'GET /user': () => ({ json: { login: 'sono' } }),
      'GET /repos/sono/kora-site': () => ({ status: 404 }),
      'POST /user/repos': () => ({ json: { full_name: 'sono/kora-site', html_url: 'https://github.com/sono/kora-site', default_branch: 'main' } }),
      'GET /repos/sono/kora-site/git/ref/heads/main': () => ({ json: { object: { sha: 'head1' } } }),
      'POST /repos/sono/kora-site/git/blobs': () => ({ json: { sha: 'blob' } }),
      'POST /repos/sono/kora-site/git/trees': () => ({ json: { sha: 'tree1' } }),
      'POST /repos/sono/kora-site/git/commits': () => ({ json: { sha: 'commit1' } }),
      'PATCH /repos/sono/kora-site/git/refs/heads/main': () => ({ json: {} }),
    });
    const r = await pushToGitHub({ token: 't', existing: null, name: 'kora-site', description: 'Website', files, message: 'Site version 3', fetch: f });
    expect(r).toEqual({ fullName: 'sono/kora-site', url: 'https://github.com/sono/kora-site', commit: 'commit1' });
    expect(calls.find((c) => c.url.endsWith('/user/repos'))!.body).toMatchObject({ private: true, auto_init: true });
    expect(calls.filter((c) => c.url.includes('/git/blobs')).length).toBe(2);
    expect(calls.find((c) => c.url.includes('/git/commits'))!.body).toMatchObject({ parents: ['head1'], tree: 'tree1' });
  });

  it('never writes into an existing repo it did not create', async () => {
    const { f, calls } = fake({
      'GET /user': () => ({ json: { login: 'sono' } }),
      'GET /repos/sono/kora-site': (_b, url) => (url.endsWith('/kora-site') ? { json: { full_name: 'sono/kora-site' } } : { status: 404 }),
      'POST /user/repos': (b) => ({ json: { full_name: `sono/${(b as { name: string }).name}`, html_url: 'x', default_branch: 'main' } }),
      'GET /repos/sono/kora-site-2/git/ref': () => ({ json: { object: { sha: 'h' } } }),
      'POST /repos/sono/kora-site-2/git': () => ({ json: { sha: 's' } }),
      'PATCH /repos/sono/kora-site-2/git': () => ({ json: {} }),
    });
    const r = await pushToGitHub({ token: 't', existing: null, name: 'kora-site', description: '', files, message: 'm', fetch: f });
    expect(r.fullName).toBe('sono/kora-site-2');
    expect(calls.some((c) => c.url.includes('/repos/sono/kora-site/git'))).toBe(false);
  });

  it('explains a bad token', async () => {
    const { f } = fake({ 'GET /user': () => ({ status: 401 }) });
    await expect(pushToGitHub({ token: 't', existing: null, name: 'x', description: '', files, message: 'm', fetch: f })).rejects.toThrow(DeployError);
  });
});

describe('Vercel deploy', () => {
  it('uploads files, then creates a production deployment on a free project name', async () => {
    const { f, calls } = fake({
      'GET /v9/projects/kora-kitchen': (_b, url) => (url.endsWith('/kora-kitchen') ? { json: { id: 'someone-elses' } } : { status: 404 }),
      'POST /v2/files': () => ({ json: {} }),
      'POST /v13/deployments': () => ({ json: { id: 'dpl_1', url: 'kora-kitchen-2-abc.vercel.app' } }),
    });
    const d = await deployToVercel({ token: 't', existing: null, name: 'kora-kitchen', files, fetch: f });
    expect(d).toEqual({ id: 'dpl_1', project: 'kora-kitchen-2', url: 'https://kora-kitchen-2-abc.vercel.app' });
    expect(calls.filter((c) => c.url.endsWith('/v2/files')).length).toBe(2);
    const body = calls.find((c) => c.url.includes('/v13/deployments'))!.body as { name: string; target: string; files: { file: string; sha: string; size: number }[] };
    expect(body).toMatchObject({ name: 'kora-kitchen-2', target: 'production', projectSettings: { framework: 'nextjs' } });
    expect(body.files.map((x) => x.file)).toEqual(['package.json', 'public/images/a.jpg']);
    expect(body.files[1].size).toBe(3);
  });

  it('redeploys to the project it created before', async () => {
    const { f, calls } = fake({ 'POST /v2/files': () => ({ json: {} }), 'POST /v13/deployments': () => ({ json: { id: 'dpl_2', url: 'x.vercel.app' } }) });
    const d = await deployToVercel({ token: 't', existing: 'kora-kitchen', name: 'kora-kitchen', files, fetch: f });
    expect(d.project).toBe('kora-kitchen');
    expect(calls.some((c) => c.url.includes('/v9/projects'))).toBe(false);
  });

  it('reads build state and the public address', async () => {
    const states = ['BUILDING', 'READY', 'ERROR'];
    for (const s of states) {
      const { f } = fake({ 'GET /v13/deployments/dpl_1': () => ({ json: { readyState: s, errorMessage: s === 'ERROR' ? 'Build failed' : undefined } }) });
      const r = await deploymentState({ token: 't', id: 'dpl_1', fetch: f });
      expect(r.state).toBe(s === 'BUILDING' ? 'building' : s === 'READY' ? 'ready' : 'error');
    }
    const { f } = fake({
      'GET /v9/projects/kora/domains': () => ({ json: { domains: [{ name: 'kora.vercel.app', verified: true }, { name: 'korakitchen.com', verified: true }] } }),
    });
    expect(await projectUrl({ token: 't', project: 'kora', fetch: f })).toBe('https://korakitchen.com');
    const none = fake({});
    expect(await projectUrl({ token: 't', project: 'kora', fetch: none.f })).toBe('https://kora.vercel.app');
  });
});
