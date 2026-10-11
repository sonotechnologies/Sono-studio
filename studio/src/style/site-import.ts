import 'server-only';
import type { PageKey } from '@/generate/brief';
import { pageKeyFor, readContent, type PageContent } from './html-content';
import { fetchPage, lookOfPage } from './link';
import { styleFromReference, type ReferenceStyle } from './reference';

/*
 * Imports a client's current website so it can be rebuilt: the text of its
 * main pages (as "## Page" blocks the pipeline reads first), contact details,
 * the pages it has, its photos and logo, and its current look as a style.
 */

const MAX_PAGES = 6;
const MAX_TEXT = 11_500;
const BUDGET_MS = 25_000;

export interface SiteImport {
  businessName: string;
  url: string;
  paste: string;
  pages: PageKey[];
  client: { whatsapp: string; instagram: string; address: string };
  photos: { src: string; alt: string }[];
  logo: { src: string; alt: string } | null;
  look: ReferenceStyle | null;
  summary: { pages: string[]; words: number };
}

export async function importSite(address: string): Promise<SiteImport> {
  const started = Date.now();
  const home = await fetchPage(address);
  const first = readContent(home.html, home.url);
  const read: { name: string; key: PageKey | null; content: PageContent }[] = [{ name: 'Home', key: 'home', content: first }];

  // The menu's pages, the ones the wizard knows about first.
  const candidates = first.links
    .map((l) => ({ ...l, key: pageKeyFor(`${l.text} ${new URL(l.href).pathname}`) }))
    .sort((a, b) => Number(!!b.key) - Number(!!a.key));
  for (const link of candidates) {
    if (read.length >= MAX_PAGES || Date.now() - started > BUDGET_MS) break;
    if (link.key && read.some((r) => r.key === link.key)) continue;
    try {
      const page = await fetchPage(link.href);
      read.push({ name: link.text, key: link.key, content: readContent(page.html, page.url) });
    } catch {
      // A page that can't be read is skipped.
    }
  }

  // Text: one block per page, sharing the space so no page crowds out the rest.
  const share = Math.floor(MAX_TEXT / read.length);
  const blocks = read.map((r) => {
    const body = [r.content.description && r.name === 'Home' ? r.content.description : '', ...r.content.lines].filter(Boolean).join('\n');
    return `## ${r.name}\n${body}`.slice(0, share).trim();
  });
  const paste = blocks.join('\n\n').slice(0, MAX_TEXT);

  const all = read.map((r) => r.content);
  const pick = <T,>(f: (c: PageContent) => T | '' | undefined): T | '' => all.map(f).find(Boolean) ?? '';
  const images = all.flatMap((c) => c.images);
  const logoImg = images.find((i) => i.logo) ?? null;
  const photos = images
    .filter((i) => !i.logo)
    .filter((i, n, arr) => arr.findIndex((x) => x.src === i.src) === n)
    .sort((a, b) => b.size - a.size)
    .slice(0, 10)
    .map(({ src, alt }) => ({ src, alt }));

  let look: ReferenceStyle | null = null;
  try {
    look = styleFromReference(await lookOfPage(home));
  } catch {
    // No readable styles: the site is rebuilt in the chosen preset.
  }

  const pages = [...new Set(read.map((r) => r.key).filter((k): k is PageKey => !!k))];
  return {
    businessName: first.siteName.slice(0, 80),
    url: home.url.toString(),
    paste,
    pages: pages.includes('home') ? pages : ['home', ...pages],
    client: {
      whatsapp: (pick((c) => c.contact.whatsapp) || pick((c) => c.contact.phones[0]) || '').slice(0, 32),
      instagram: (pick((c) => c.contact.instagram) || '').slice(0, 60),
      address: (pick((c) => c.contact.address) || '').slice(0, 160),
    },
    photos,
    logo: logoImg ? { src: logoImg.src, alt: logoImg.alt } : null,
    look,
    summary: { pages: read.map((r) => r.name), words: paste.split(/\s+/).length },
  };
}
