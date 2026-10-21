import { createServer } from 'node:http';
import { expect, it } from 'vitest';
import { checkUrl, fetchBytes } from './link';

it('fetches through the checked connection, following redirects and keeping to the size limit', async () => {
  const server = createServer((req, res) => {
    if (req.url === '/go') return void res.writeHead(302, { location: '/page' }).end();
    res.writeHead(200, { 'content-type': 'text/html' }).end('<html><body><h1>Hi</h1></body></html>');
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;
  const got = await fetchBytes(`http://127.0.0.1:${port}/go`, 100_000);
  expect(got?.url.pathname).toBe('/page');
  expect(new TextDecoder().decode(got!.bytes)).toContain('<h1>Hi</h1>');
  expect(await fetchBytes(`http://127.0.0.1:${port}/page`, 10)).toBeNull();
  server.close();
});

it('refuses private and NAT64 addresses', async () => {
  for (const host of ['10.0.0.1', '192.168.1.5', '[::1]', '[64:ff9b::a00:1]', '[fec0::1]', '169.254.169.254']) await expect(checkUrl(`http://${host}/`), host).rejects.toThrow();
});
