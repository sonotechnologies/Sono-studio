import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildCommit, pushFiles } from './gitpack';

/*
 * Pushes to a real git server: git's own http-backend, run locally. Skipped
 * where git isn't installed.
 */

const hasGit = spawnSync('git', ['--version']).status === 0;
const git = (dir: string, ...args: string[]) => execFileSync('git', ['--git-dir', dir, ...args], { encoding: 'utf8' });

describe.skipIf(!hasGit)('git push in one request', () => {
  let root: string;
  let server: Server;
  let remote: string;
  const bare = () => join(root, 'site.git');

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'sono-git-'));
    execFileSync('git', ['init', '--bare', '-q', '-b', 'main', bare()]);
    // A first commit, like GitHub's auto-initialised README.
    const work = join(root, 'work');
    execFileSync('git', ['clone', '-q', bare(), work]);
    execFileSync('sh', ['-c', 'echo "# site" > README.md && git add README.md && git -c user.name=t -c user.email=t@t commit -qm init && git push -q origin main'], { cwd: work });

    server = createServer((req, res) => {
      const url = new URL(req.url!, 'http://x');
      const cgi = spawn('git', ['http-backend'], {
        env: {
          ...process.env,
          GIT_PROJECT_ROOT: root,
          GIT_HTTP_EXPORT_ALL: '1',
          REMOTE_USER: 'sono',
          REQUEST_METHOD: req.method!,
          PATH_INFO: url.pathname,
          QUERY_STRING: url.search.slice(1),
          CONTENT_TYPE: req.headers['content-type'] ?? '',
        },
      });
      req.pipe(cgi.stdin);
      const chunks: Buffer[] = [];
      cgi.stdout.on('data', (c) => chunks.push(c));
      cgi.on('close', () => {
        const out = Buffer.concat(chunks);
        const split = out.indexOf('\r\n\r\n');
        const head = out.subarray(0, split).toString();
        const status = Number(/^Status: (\d+)/m.exec(head)?.[1] ?? 200);
        const type = /^Content-Type: (.*)$/m.exec(head)?.[1]?.trim();
        res.writeHead(status, type ? { 'content-type': type } : {});
        res.end(out.subarray(split + 4));
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    remote = `http://127.0.0.1:${(server.address() as AddressInfo).port}/site.git`;
  });

  afterAll(() => {
    server?.close();
    if (root) rmSync(root, { recursive: true, force: true });
  });

  const photo = Uint8Array.from({ length: 70_000 }, (_, i) => (i * 7) % 256);
  const files = [
    { path: 'index.html', data: '<h1>Home</h1>' },
    { path: 'rooms/index.html', data: '<h1>Rooms</h1>' },
    { path: 'assets/css/site.css', data: 'body{margin:0}' },
    { path: 'assets/img/hall.jpg', data: photo },
    { path: 'assets/img/hall-copy.jpg', data: photo },
    { path: 'assets-old.txt', data: 'sorts before the assets folder in git' },
  ];

  it('writes the same object ids git does', () => {
    const { objects } = buildCommit({ files: [{ path: 'a.txt', data: 'hello\n' }], message: 'm', parent: null });
    expect(objects[0].sha).toBe('ce013625030ba8dba906f756967f9e9ca394464a');
  });

  it('pushes a whole site as one commit on top of the branch', async () => {
    const before = git(bare(), 'rev-parse', 'main').trim();
    const { commit } = await pushFiles({ remote, token: 't', branch: 'main', files, message: 'Site version 1' });
    expect(git(bare(), 'rev-parse', 'main').trim()).toBe(commit);
    expect(git(bare(), 'rev-parse', 'main^').trim()).toBe(before);
    expect(git(bare(), 'ls-tree', '-r', '--name-only', 'main').trim().split('\n').sort()).toEqual(files.map((f) => f.path).sort());
    expect(git(bare(), 'show', 'main:rooms/index.html')).toBe('<h1>Rooms</h1>');
    expect(execFileSync('git', ['--git-dir', bare(), 'cat-file', 'blob', 'main:assets/img/hall.jpg']).equals(Buffer.from(photo))).toBe(true);
    git(bare(), 'fsck', '--strict');
  });

  it('removes files the site no longer has on the next push', async () => {
    await pushFiles({ remote, token: 't', branch: 'main', files: files.slice(0, 2), message: 'Site version 2' });
    expect(git(bare(), 'ls-tree', '-r', '--name-only', 'main').trim().split('\n')).toEqual(['index.html', 'rooms/index.html']);
    expect(git(bare(), 'log', '--format=%s', 'main').trim().split('\n')).toEqual(['Site version 2', 'Site version 1', 'init']);
  });
});
