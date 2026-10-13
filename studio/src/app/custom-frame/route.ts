import { createRuntime } from '@/site/custom/runtime';
import { GOOGLE_FONTS, googleFontsHref } from '@/site/fonts';
import template from '@/export/template.generated.json';

/*
 * The sandboxed frame AI-written sections are previewed in. It's served with
 * a CSP sandbox (scripts only, no same-origin), so the section's code can't
 * reach the studio, its cookies or the page around it, can't load anything
 * but fonts and images, and can't send data anywhere. The page around it
 * posts the compiled component, its content and the theme; the frame posts
 * back its height.
 */

const css = template.css;

const frameScript = `
(() => {
  const rt = (${createRuntime.toString()})();
  const root = document.getElementById('root');
  const inner = root.firstElementChild;
  let id = '';
  const report = () => parent.postMessage({ type: 'sono-custom-height', id, height: Math.ceil(document.documentElement.scrollHeight) }, '*');
  new ResizeObserver(report).observe(document.body);
  addEventListener('message', (e) => {
    if (e.source !== parent || !e.data || e.data.type !== 'sono-custom') return;
    const m = e.data;
    id = m.id;
    root.setAttribute('style', String(m.style || ''));
    try {
      const component = new Function('h', 'Fragment', String(m.js))(rt.h, rt.Fragment);
      inner.innerHTML = rt.render(component, m.data);
      // Site links lead to the site around the frame (the pitch link or preview), in the same tab.
      for (const a of inner.querySelectorAll('a[href]')) {
        const href = a.getAttribute('href') || '';
        if (href.startsWith('/') && !href.startsWith('//')) a.setAttribute('href', String(m.base || '') + (href === '/' && m.base ? '' : href));
        a.setAttribute('target', href.startsWith('#') ? '_self' : '_top');
      }
    } catch (err) {
      inner.textContent = '';
      const p = document.createElement('p');
      p.style.cssText = 'margin:0;padding:24px;font:14px system-ui;color:#B42318';
      p.textContent = 'This section has an error: ' + (err && err.message ? err.message : String(err));
      inner.appendChild(p);
    }
    setTimeout(report, 50);
    setTimeout(report, 400);
  });
  parent.postMessage({ type: 'sono-custom-ready' }, '*');
})();
`;

export function GET(req: Request) {
  const url = new URL(req.url);
  const origin = url.origin;
  const fonts = (url.searchParams.get('f') ?? '').split('|').filter((f) => GOOGLE_FONTS[f]).slice(0, 2);
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${fonts.length ? `<link rel="stylesheet" href="${googleFontsHref(fonts)}">` : ''}
<script src="${origin}/vendor/tailwind-browser.js"></script>
<style type="text/tailwindcss">
@theme inline {
  --color-white: #ffffff;
  --color-black: #000000;
  ${css.tokens}
}
:root {
  ${css.fonts}
}
html, body { margin: 0; background: transparent; overflow: hidden; }
${css.site}
</style>
</head>
<body>
<div id="root" class="sono-site"><div class="s-root"></div></div>
<script>${frameScript}</script>
</body>
</html>`;
  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=300',
      'content-security-policy': [
        'sandbox allow-scripts allow-top-navigation-by-user-activation',
        "default-src 'none'",
        `script-src ${origin} 'unsafe-inline' 'unsafe-eval'`,
        "style-src 'unsafe-inline' https://fonts.googleapis.com",
        'font-src https://fonts.gstatic.com',
        'img-src https: http: data: blob:',
        "connect-src 'none'",
        "form-action 'none'",
        "base-uri 'none'",
        `frame-ancestors ${origin}`,
      ].join('; '),
      'x-content-type-options': 'nosniff',
    },
  });
}
