import { describe, expect, it } from 'vitest';
import { pasteFor } from '@/generate/fill';
import { pageKeyFor, readContent } from './html-content';

const html = `<!doctype html><html><head><title>Casa Olivia | Trattoria in Old Town</title>
<meta name="description" content="Family trattoria since 1998.">
<meta property="og:image" content="/img/og.jpg"></head>
<body><header><a href="/"><img src="/img/logo.png" alt="Casa Olivia logo" width="160" height="60"></a>
<nav><a href="/menu">Our menu</a><a href="/about-us">Story</a><a href="/contact">Find us</a><a href="https://facebook.com/x">FB</a><a href="#top">Top</a></nav></header>
<script>var x = "<p>not content</p>";</script>
<h1>Pasta made by hand &amp; slowly</h1>
<p>We&#39;ve cooked in Old Town since 1998.</p>
<ul><li>Tagliatelle ragù — €14</li><li>Tiramisù — €7</li></ul>
<img src="/img/dining.jpg" alt="The dining room" width="1200" height="800">
<img src="/img/icon-star.png" width="16" height="16">
<img data-src="/img/lazy.jpg" alt="Terrace">
<p>Tue–Sun, 12:00–22:00</p>
<address>Via Roma 12, Old Town</address>
<a href="tel:+39 055 123 4567">Call</a> <a href="https://wa.me/390551234567">WhatsApp</a>
<a href="https://instagram.com/casaolivia/">IG</a> <a href="mailto:ciao@casaolivia.it">Email</a>
<p>© 2026 Casa Olivia. All rights reserved.</p></body></html>`;

describe('reading a client’s current site', () => {
  it('pulls text, contact details, menu links and photos', () => {
    const c = readContent(html, new URL('https://casaolivia.it/'));
    expect(c.siteName).toBe('Casa Olivia');
    expect(c.description).toBe('Family trattoria since 1998.');
    expect(c.lines).toEqual(['# Pasta made by hand & slowly', 'We’ve cooked in Old Town since 1998.'.replace('’', "'"), 'Tagliatelle ragù — €14', 'Tiramisù — €7', 'Tue–Sun, 12:00–22:00', 'Via Roma 12, Old Town']);
    expect(c.contact).toEqual({ phones: ['+390551234567'], emails: ['ciao@casaolivia.it'], whatsapp: '+390551234567', instagram: '@casaolivia', address: 'Via Roma 12, Old Town' });
    expect(c.links.map((l) => l.text)).toEqual(['Our menu', 'Story', 'Find us']);
    expect(c.images.map((i) => i.src.replace('https://casaolivia.it', ''))).toEqual(['/img/og.jpg', '/img/logo.png', '/img/dining.jpg', '/img/lazy.jpg']);
    expect(c.images.find((i) => i.logo)?.alt).toBe('Casa Olivia logo');
  });

  it('maps menu labels to pages', () => {
    expect(pageKeyFor('Our menu')).toBe('menu');
    expect(pageKeyFor('Story')).toBe('about');
    expect(pageKeyFor('Find us')).toBe('contact');
    expect(pageKeyFor('Rooms & Suites')).toBe('rooms');
    expect(pageKeyFor('Blog')).toBeNull();
  });

  it('gives each page its own imported text first', () => {
    const paste = '## Home\nWelcome\n\n## Menu\nTagliatelle €14\n\n## Contact\nVia Roma 12';
    expect(pasteFor(paste, { title: 'Menu', path: '/menu' }).split('\n')[0]).toBe('## Menu');
    expect(pasteFor(paste, { title: 'Menu', path: '/menu' })).toContain('## Home');
    expect(pasteFor('plain notes', { title: 'Home', path: '/' })).toBe('plain notes');
  });
});
