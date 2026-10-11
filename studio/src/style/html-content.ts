import type { PageKey } from '@/generate/brief';

/*
 * Reads the content of a business's existing web page: its text in reading
 * order, contact details, menu links and photos. Plain parsing, no AI; the
 * generation pipeline then turns the text into facts, items and copy.
 */

export interface PageContent {
  title: string;
  siteName: string;
  description: string;
  /** Headings and paragraphs in order, headings marked with "# ". */
  lines: string[];
  images: { src: string; alt: string; logo: boolean; size: number }[];
  /** Same-site links from the menu or header: candidates for more pages. */
  links: { href: string; text: string }[];
  contact: { phones: string[]; emails: string[]; whatsapp: string; instagram: string; address: string };
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', ndash: '–', mdash: '—', hellip: '…', euro: '€', pound: '£', copy: '©' };

export function decode(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}

const text = (html: string) => decode(html.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const attr = (tag: string, name: string) => decode(new RegExp(`\\s${name}\\s*=\\s*["']([^"']*)["']`, 'i').exec(tag)?.[1] ?? '');

function absolute(href: string, base: URL): URL | null {
  try {
    const u = new URL(href.trim(), base);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u : null;
  } catch {
    return null;
  }
}

export function readContent(raw: string, base: URL): PageContent {
  const head = /<head[\s\S]*?<\/head>/i.exec(raw)?.[0] ?? '';
  const meta = (name: string) => decode(new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*content=["']([^"']*)["']`, 'i').exec(head)?.[1] ?? new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:name|property)=["']${name}["']`, 'i').exec(head)?.[1] ?? '');
  const title = text(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1] ?? '');
  const siteName = meta('og:site_name') || title.split(/\s[|·–—-]\s/)[0].trim();

  // Drop what isn't content.
  const body = (/<body[\s\S]*<\/body>/i.exec(raw)?.[0] ?? raw)
    .replace(/<(script|style|noscript|svg|template|iframe|form|select)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');

  const lines: string[] = [];
  const seen = new Set<string>();
  for (const m of body.matchAll(/<(h[1-4]|p|li|blockquote|td|dt|dd|figcaption|address)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const t = text(m[2]);
    if (t.length < 2 || t.length > 1200 || seen.has(t)) continue;
    // Menus, cookie banners and copyright lines repeat on every page and say nothing.
    if (/cookie|privacy policy|all rights reserved|javascript|^©/i.test(t) && t.length < 200) continue;
    seen.add(t);
    lines.push(/^h/i.test(m[1]) ? `# ${t}` : t);
  }

  const images: PageContent['images'] = [];
  const og = meta('og:image');
  if (og) {
    const u = absolute(og, base);
    if (u) images.push({ src: u.toString(), alt: meta('og:image:alt') || siteName, logo: false, size: 1200 * 630 });
  }
  for (const m of body.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    const srcset = attr(tag, 'srcset') || attr(tag, 'data-srcset');
    const largest = srcset
      .split(',')
      .map((p) => p.trim().split(/\s+/))
      .filter((p) => p[0])
      .sort((a, b) => parseInt(b[1] ?? '0') - parseInt(a[1] ?? '0'))[0]?.[0];
    const src = largest || attr(tag, 'data-src') || attr(tag, 'data-lazy-src') || attr(tag, 'src');
    if (!src || src.startsWith('data:')) continue;
    const u = absolute(src, base);
    if (!u) continue;
    const alt = attr(tag, 'alt');
    const w = parseInt(attr(tag, 'width')) || 0;
    const h = parseInt(attr(tag, 'height')) || 0;
    const logo = /logo|brand/i.test(`${src} ${alt} ${attr(tag, 'class')} ${attr(tag, 'id')}`);
    if (!logo && ((w && w < 120) || (h && h < 90) || /icon|sprite|pixel|tracking|avatar|badge|spinner|loader|emoji/i.test(src))) continue;
    if (!logo && /\.svg(\?|$)/i.test(u.pathname)) continue;
    if (images.some((i) => i.src === u.toString())) continue;
    images.push({ src: u.toString(), alt, logo, size: w && h ? w * h : 400 * 300 });
  }

  // Links in the menu or header point at the site's other pages.
  const navHtml = [...body.matchAll(/<(nav|header)\b[\s\S]*?<\/\1>/gi)].map((m) => m[0]).join(' ') || body.slice(0, 20000);
  const links: PageContent['links'] = [];
  for (const m of navHtml.matchAll(/<a\b[^>]*href=["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const u = absolute(m[1], base);
    const t = text(m[2]);
    if (!u || u.host !== base.host || !t || t.length > 40 || /\.(pdf|jpe?g|png|zip)$/i.test(u.pathname)) continue;
    u.hash = '';
    if (u.pathname === base.pathname || links.some((l) => l.href === u.toString())) continue;
    links.push({ href: u.toString(), text: t });
  }

  const hrefs = [...raw.matchAll(/href=["']([^"']+)["']/gi)].map((m) => decode(m[1]));
  const phones = [...new Set(hrefs.filter((h) => /^tel:/i.test(h)).map((h) => h.replace(/^tel:/i, '').replace(/[^\d+]/g, '')))].filter((p) => p.length >= 7).slice(0, 3);
  const emails = [...new Set(hrefs.filter((h) => /^mailto:/i.test(h)).map((h) => h.replace(/^mailto:/i, '').split('?')[0]))].slice(0, 3);
  const wa = hrefs.map((h) => /(?:wa\.me\/|api\.whatsapp\.com\/send\?phone=|whatsapp\.com\/send\/?\?phone=)\+?(\d{7,15})/i.exec(h)?.[1]).find(Boolean);
  const ig = hrefs.map((h) => /instagram\.com\/([a-z0-9._]{2,30})\/?(?:\?|$)/i.exec(h)?.[1]).find((h) => h && !/^(p|reel|explore|stories)$/i.test(h));
  const address = text(/<address\b[^>]*>([\s\S]*?)<\/address>/i.exec(body)?.[1] ?? /itemprop=["']address["'][^>]*>([\s\S]{0,400}?)<\/(?:div|span|p)>/i.exec(body)?.[1] ?? '').slice(0, 160);

  return {
    title,
    siteName,
    description: meta('description') || meta('og:description'),
    lines,
    images,
    links,
    contact: { phones, emails, whatsapp: wa ? `+${wa}` : '', instagram: ig ? `@${ig}` : '', address },
  };
}

/** Which of the wizard's pages a link or page title is. */
export function pageKeyFor(label: string): PageKey | null {
  const l = label.toLowerCase();
  if (/menu|food|drink|eat|dishes|carte|wine/.test(l)) return 'menu';
  if (/room|stay|suite|accommodation|villa|lodg/.test(l)) return 'rooms';
  if (/service|treatment|pric|package|class|offer|what we do/.test(l)) return 'services';
  if (/about|story|team|who we|our history/.test(l)) return 'about';
  if (/gallery|photo|portfolio|lookbook|work/.test(l)) return 'gallery';
  if (/contact|visit|find us|location|book|reserv|directions/.test(l)) return 'contact';
  return null;
}
