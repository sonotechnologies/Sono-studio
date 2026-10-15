import { describe, expect, it } from 'vitest';
import { convertPage, copyToNext, routeOf, styleObject } from './to-next';

const enc = (s: string) => new TextEncoder().encode(s);
const dec = (d: string | Uint8Array) => (typeof d === 'string' ? d : new TextDecoder().decode(d));
const versions = { next: '16.4.0', react: '19.3.0', 'react-dom': '19.3.0', tailwindcss: '4.3.3', '@tailwindcss/postcss': '4.3.3', typescript: '7.0.2', '@types/node': '26.6.5', '@types/react': '19.3.0', '@types/react-dom': '19.3.0' };

describe('turning a copied site into Next.js', () => {
  it('names routes after the copy’s files', () => {
    expect(routeOf('index.html')).toBe('');
    expect(routeOf('about.html')).toBe('about');
    expect(routeOf('blog/post-1.html')).toBe('blog/post-1');
  });

  it('writes inline styles as objects React accepts', () => {
    expect(styleObject('color: red; background: url("a;b.png") ; --gap: 4px; -webkit-line-clamp: 2; font-size: 12px !important')).toBe(
      '{ "color": "red", "background": "url(\\"a;b.png\\")", "--gap": "4px", "WebkitLineClamp": "2", "fontSize": "12px" }',
    );
  });

  it('keeps the markup, moves scripts to the runner, and points links at the new routes', () => {
    const page = convertPage(
      'about.html',
      `<html lang="en"><head><title>About</title><link rel="stylesheet" href="css/a.css"><script src="js/x.js"></script></head>
<body class="about" onload="go()"><p class="lead" onclick="hi()">Hi <b>there</b> {you}</p><a href="index.html#top">Home</a><input value="x" disabled><br>
<script>init()</script></body></html>`,
      (_page, v) => (v === 'index.html#top' ? '/#top' : `/${v}`),
    );
    expect(page.route).toBe('about');
    expect(page.shell).toEqual({ html: [['lang', 'en']], body: [['class', 'about'], ['onload', 'go()']] });
    expect(page.code).toContain('export const metadata: Metadata = { title: "About" };');
    expect(page.code).toContain('<link rel="stylesheet" href="/css/a.css" precedence="default" />');
    expect(page.code).toContain('<p className="lead" data-legacy-onclick="hi()">');
    expect(page.code).toContain('{" {you}"}');
    expect(page.code).toContain('<a href="/#top">Home</a>');
    expect(page.code).toContain('<input {...attrs({ "defaultValue": "x", "disabled": true })} />');
    expect(page.code).toContain('<LegacyScripts page="about" scripts={[{"src":"/js/x.js"},{"code":"init()"}]} />');
    // No viewport tag on the original: phones keep showing it zoomed out.
    expect(page.code).toContain('export const viewport: Viewport = { width: 980 };');
  });

  it('builds a whole project: pages, public files, Tailwind without its reset, redirects from the old addresses', async () => {
    const files = await copyToNext(
      {
        files: {
          'index.html': enc('<html><head><title>Home</title></head><body><a href="about.html">About</a><img src="img/a.png"></body></html>'),
          'about.html': enc('<html><head><title>About</title></head><body><h1>About</h1></body></html>'),
          '_drafts/x.html': enc('<html><body>x</body></html>'),
          'img/a.png': new Uint8Array([1, 2, 3]),
        },
        pages: [{ path: 'about.html', title: 'About', url: 'https://kora.example/about-us/' }],
        edits: [{ kind: 'image', page: 'index.html', index: 0, from: 'img/a.png', src: 'https://cdn.example/new.jpg' }],
        name: 'kora-site',
        version: 2,
        sourceUrl: 'https://kora.example/',
        loadImage: async () => ({ bytes: new Uint8Array([9]), contentType: 'image/jpeg' }),
      },
      versions,
    );
    const by = Object.fromEntries(files.map((f) => [f.path, f.data]));
    expect(Object.keys(by)).toEqual(expect.arrayContaining(['src/app/layout.tsx', 'src/app/page.tsx', 'src/app/about/page.tsx', 'src/app/%5Fdrafts/x/page.tsx', 'public/img/a.png', 'src/components/legacy-scripts.tsx']));
    const edited = Object.keys(by).find((p) => p.startsWith('public/edits/'))!;
    expect(edited).toMatch(/\.jpg$/);
    expect(dec(by['src/app/page.tsx'])).toContain(`<img src="/${edited.slice(7)}" />`);
    expect(dec(by['src/app/page.tsx'])).toContain('<a href="/about">About</a>');
    expect(dec(by['src/app/globals.css'])).not.toMatch(/@import 'tailwindcss';/);
    expect(dec(by['src/app/globals.css'])).toContain('prefix(tw)');
    expect(dec(by['next.config.ts'])).toContain('{ source: "/about-us", destination: "/about", permanent: true }');
    expect(JSON.parse(dec(by['package.json'])).dependencies.next).toBe('16.4.0');
  });
});
