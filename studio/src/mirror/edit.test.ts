import { describe, expect, it } from 'vitest';
import { applyEdits, findSpots, type CopyEdit } from './edit';

const page = `<!doctype html><html><head><title>Kora</title><style>p{color:red}</style></head>
<body class="home">
  <nav><a href="index.html">Home</a> <a href="about.html">About &amp; us</a></nav>
  <h1>Welcome to <b>Kora</b> Kitchen</h1>
  <p>Call   us on
     0803 111 2222</p>
  <picture><source srcset="img/hero.webp" type="image/webp"><img src="img/hero.jpg" srcset="img/hero-2x.jpg 2x" alt="Hero"></picture>
  <img data-src="img/lazy.jpg" class="lazy">
  <script>var x = "<p>not text</p>";</script>
</body></html>`;

describe('editing a copied page', () => {
  it('finds the words, pictures and links in the body, in order', () => {
    const s = findSpots(page);
    expect(s.texts.map((t) => t.value.trim())).toEqual(['Home', 'About & us', 'Welcome to', 'Kora', 'Kitchen', 'Call   us on\n     0803 111 2222']);
    expect(s.images.map((i) => i.src)).toEqual(['img/hero.jpg', 'img/lazy.jpg']);
    expect(s.links.map((l) => l.href)).toEqual(['index.html', 'about.html']);
  });

  it('changes only the edited characters and keeps everything else byte for byte', () => {
    const edits: CopyEdit[] = [
      { kind: 'text', page: 'index.html', index: 5, from: 'Call us on 0803 111 2222', to: 'Call us on 0809 <new> & co' },
      { kind: 'link', page: 'index.html', index: 1, from: 'about.html', href: 'https://wa.me/2348090000000' },
    ];
    const { html, skipped } = applyEdits('index.html', page, edits);
    expect(skipped).toEqual([]);
    expect(html).toContain('<p>Call us on 0809 &lt;new&gt; &amp; co</p>');
    expect(html).toContain('<a href="https://wa.me/2348090000000">About &amp; us</a>');
    expect(html.replace('Call us on 0809 &lt;new&gt; &amp; co', 'Call   us on\n     0803 111 2222').replace('https://wa.me/2348090000000', 'about.html')).toBe(page);
  });

  it('replaces a picture everywhere the browser would look for it', () => {
    const { html } = applyEdits('index.html', page, [
      { kind: 'image', page: 'index.html', index: 0, from: 'img/hero.jpg', src: 'https://cdn.example/new.jpg', alt: 'Our dining room' },
      { kind: 'image', page: 'index.html', index: 1, from: 'img/lazy.jpg', src: 'https://cdn.example/b.jpg' },
    ]);
    expect(html).toContain('<picture><img src="https://cdn.example/new.jpg"  alt="Our dining room"></picture>');
    expect(html).toContain('<img src="https://cdn.example/b.jpg" data-src="https://cdn.example/b.jpg" class="lazy">');
  });

  it('applies an everywhere edit to each page, unless a page has its own', () => {
    const everywhere: CopyEdit = { kind: 'text', page: '*', index: 0, from: 'Home', to: 'Start' };
    expect(applyEdits('about.html', page, [everywhere]).html).toContain('<a href="index.html">Start</a>');
    expect(applyEdits('about.html', page, [everywhere, { kind: 'text', page: 'about.html', index: 0, from: 'Home', to: 'Back' }]).html).toContain('>Back</a>');
  });

  it('leaves out an edit whose spot now says something else', () => {
    const r = applyEdits('index.html', page, [{ kind: 'text', page: 'index.html', index: 2, from: 'Hello there', to: 'x' }]);
    expect(r.skipped).toHaveLength(1);
    expect(r.html).toBe(page);
  });

  it('refuses script links', () => {
    const r = applyEdits('index.html', page, [{ kind: 'link', page: 'index.html', index: 0, from: 'index.html', href: 'javascript:alert(1)' }]);
    expect(r.skipped).toHaveLength(1);
  });

  it('marks each spot for the editor without changing the page otherwise', () => {
    const { html } = applyEdits('index.html', page, [], { mark: true });
    expect(html).toContain('<a data-sono-t="0" data-sono-a="0" href="index.html">');
    expect(html).toContain('<h1 data-sono-t="2 4">Welcome to <b data-sono-t="3">Kora</b>');
    expect(html).toContain('<img data-sono-img="1" data-src');
    expect(html.replace(/ data-sono-[a-z]+="[^"]*"/g, '')).toBe(page);
  });
});
