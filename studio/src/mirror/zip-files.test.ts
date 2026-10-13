import { zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { fileFor, filesOf } from './zip-files';

describe('serving a site copy', () => {
  it('downloads the zip once for a whole page of requests', async () => {
    const zip = zipSync({ 'index.html': new TextEncoder().encode('<p>hi</p>'), 'img/a.png': new Uint8Array([1, 2, 3]) });
    let downloads = 0;
    const load = async () => (downloads++, await new Promise((r) => setTimeout(r, 10)), zip);
    const pages = await Promise.all(Array.from({ length: 40 }, () => filesOf('p1:2026-10-12', load)));
    expect(downloads).toBe(1);
    expect(fileFor(pages[0]!, '')).toBe('index.html');
    await filesOf('p1:2026-10-12', load);
    expect(downloads).toBe(1);
    // A newer copy (new date) is fetched afresh.
    await filesOf('p1:2026-10-13', load);
    expect(downloads).toBe(2);
  });

  it('doesn’t keep a failed download', async () => {
    let calls = 0;
    await expect(filesOf('p2:x', async () => (calls++, Promise.reject(new Error('storage down'))))).rejects.toThrow();
    expect(await filesOf('p2:x', async () => (calls++, null))).toBeNull();
    expect(await filesOf('p2:x', async () => (calls++, zipSync({ 'index.html': new Uint8Array([60]) })))).toHaveProperty(['index.html']);
    expect(calls).toBe(3);
  });
});
