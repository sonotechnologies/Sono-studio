import { describe, expect, it } from 'vitest';
import { assetPath, cssRefs, htmlRefs, pagePath, relative, rewriteCss, rewriteHtml, shouldCopy } from './rewrite';

const origin = new URL('https://www.casaolivia.it/');

describe('copying a site: paths', () => {
  it('saves pages and files where links can find them', () => {
    expect(pagePath(new URL('https://casaolivia.it/'))).toBe('index.html');
    expect(pagePath(new URL('https://casaolivia.it/about/'))).toBe('about.html');
    expect(pagePath(new URL('https://casaolivia.it/menu/dinner'))).toBe('menu/dinner.html');
    expect(pagePath(new URL('https://casaolivia.it/old.php'))).toBe('old.html');
    expect(assetPath(new URL('https://casaolivia.it/css/site.css?ver=6.4'), origin)).toMatch(/^css\/site-[0-9a-f]{6}\.css$/);
    expect(assetPath(new URL('https://static.wixstatic.com/media/a b.jpg'), origin)).toBe('_ext/static.wixstatic.com/media/a-b.jpg');
    expect(relative('menu/dinner.html', 'css/site.css')).toBe('../css/site.css');
    expect(relative('index.html', 'css/site.css')).toBe('css/site.css');
    expect(relative('menu/dinner.html', 'menu/lunch.html')).toBe('lunch.html');
  });

  it('copies the site’s own files and builder CDNs, links shared CDNs and trackers', () => {
    expect(shouldCopy(new URL('https://casaolivia.it/app.js'), origin, 'script')).toBe(true);
    expect(shouldCopy(new URL('https://static.wixstatic.com/x.jpg'), origin, 'image')).toBe(true);
    expect(shouldCopy(new URL('https://cdn.example.net/widget.js'), origin, 'script')).toBe(false);
    expect(shouldCopy(new URL('https://fonts.gstatic.com/s/x.woff2'), origin, 'font')).toBe(false);
    expect(shouldCopy(new URL('https://www.googletagmanager.com/gtag/js'), origin, 'script')).toBe(false);
  });
});

describe('copying a site: references', () => {
  const html = `<html><head><base href="https://www.casaolivia.it/">
<link rel="stylesheet" href="/css/site.css" integrity="sha384-x" crossorigin>
<link rel="icon" href="favicon.ico"><script src="https://www.googletagmanager.com/gtag/js?id=G-1"></script>
<script src="/js/app.js"></script>
<style>.hero{background:url('/img/hero.jpg')}</style></head>
<body><a href="/menu/">Menu</a><a href="#top">Top</a><a href="mailto:a@b.c">Mail</a><a href="https://other.com/">Out</a>
<img src="/img/a.jpg" srcset="/img/a-400.jpg 400w, /img/a-800.jpg 800w" alt="">
<div style="background-image:url(/img/bg.png)"></div><video poster="/img/p.jpg"><source src="/v/intro.mp4" type="video/mp4"></video>
<a href="/files/menu.pdf">PDF</a></body></html>`;

  it('finds every file and page a page uses', () => {
    const refs = htmlRefs(html, new URL('https://www.casaolivia.it/'));
    const by = (k: string) => refs.filter((r) => r.kind === k).map((r) => new URL(r.url).pathname);
    expect(by('style')).toEqual(['/css/site.css']);
    expect(by('script')).toEqual(['/gtag/js', '/js/app.js']);
    expect(by('page')).toEqual(['/menu/', '/']);
    expect(by('image')).toEqual(expect.arrayContaining(['/favicon.ico', '/img/a.jpg', '/img/a-400.jpg', '/img/a-800.jpg', '/img/p.jpg', '/img/hero.jpg', '/img/bg.png']));
    expect(by('media')).toEqual(['/v/intro.mp4']);
    expect(refs.some((r) => r.url.endsWith('/files/menu.pdf') && r.kind !== 'page')).toBe(true);
  });

  it('rewrites the page to point at the copy', () => {
    const local: Record<string, string> = {
      'https://www.casaolivia.it/css/site.css': 'css/site.css',
      'https://www.casaolivia.it/menu/': 'menu.html',
      'https://www.casaolivia.it/img/a.jpg': 'img/a.jpg',
      'https://www.casaolivia.it/img/a-400.jpg': 'img/a-400.jpg',
      'https://www.casaolivia.it/img/hero.jpg': 'img/hero.jpg',
      'https://www.casaolivia.it/img/bg.png': 'img/bg.png',
    };
    const out = rewriteHtml(html, new URL('https://www.casaolivia.it/'), (u) => local[u.toString()] ?? u.toString());
    expect(out).not.toContain('<base');
    expect(out).toContain('href="css/site.css"');
    expect(out).not.toContain('integrity');
    expect(out).toContain('href="menu.html"');
    expect(out).toContain('href="#top"');
    expect(out).toContain('href="mailto:a@b.c"');
    expect(out).toContain('srcset="img/a-400.jpg 400w, https://www.casaolivia.it/img/a-800.jpg 800w"');
    expect(out).toContain("url('img/hero.jpg')");
    expect(out).toContain('url(img/bg.png)');
    expect(out).toContain('src="https://www.googletagmanager.com/gtag/js?id=G-1"');
  });

  it('rewrites stylesheets', () => {
    const css = `@import url("fonts.css"); .a{background:url(../img/x.png)} .b{background:url(data:image/png;base64,AA)} @font-face{src:url('/f/a.woff2') format('woff2')}`;
    const base = new URL('https://casaolivia.it/css/site.css');
    expect(cssRefs(css, base).map((r) => `${r.kind}:${new URL(r.url).pathname}`)).toEqual(['style:/css/fonts.css', 'style:/css/fonts.css', 'image:/img/x.png', 'font:/f/a.woff2']);
    const out = rewriteCss(css, base, (u) => (u.pathname === '/img/x.png' ? '../img/x.png' : u.toString()));
    expect(out).toContain('url(../img/x.png)');
    expect(out).toContain('url(data:image/png;base64,AA)');
    expect(out).toContain("url('https://casaolivia.it/f/a.woff2')");
  });
});
