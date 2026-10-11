import type { SiteConfig } from '@/site/schema';

/*
 * What to sort out before a client's site goes live. Built from the config,
 * so it reflects the actual site: placeholder photos, sample reviews,
 * missing contact details, plus the hosting and domain steps.
 */

/** Unsplash and Pexels ask for their images to be linked, not copied. */
export function isStockUrl(src: string): boolean {
  return /^https:\/\/(images\.unsplash\.com|images\.pexels\.com)\//.test(src);
}

export interface ChecklistItem {
  key: string;
  title: string;
  detail: string;
  done: boolean;
  /** Blocking-ish items are shown first and in warning colour. */
  important?: boolean;
}

function walkImages(config: SiteConfig): { src: string }[] {
  const out: { src: string }[] = [];
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      if (typeof o.src === 'string' && typeof o.alt === 'string') out.push(o as { src: string });
      else Object.values(o).forEach(walk);
    }
  };
  for (const p of config.pages) for (const s of p.sections) if (!s.hidden) walk(s.content);
  return out;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function handoverChecklist(config: SiteConfig, opts: { missingImages?: number } = {}): ChecklistItem[] {
  const visible = config.pages.flatMap((p) => p.sections.filter((s) => !s.hidden));
  const imgs = walkImages(config);
  const placeholders = imgs.filter((i) => !i.src).length + (opts.missingImages ?? 0);
  const stock = imgs.filter((i) => isStockUrl(i.src)).length;
  const samples = visible
    .filter((s) => s.type === 'testimonials')
    .flatMap((s) => (s.type === 'testimonials' ? s.content.items : []))
    .filter((t) => /sample review/i.test(t.detail ?? '') || /customer name/i.test(t.name)).length;
  const contact = visible.find((s) => s.type === 'contact');
  const reachable = visible.some(
    (s) => (s.type === 'contact' && (s.content.phone || s.content.whatsapp || s.content.email)) || (s.type === 'whatsapp-float' && s.content.number),
  );

  const items: ChecklistItem[] = [
    {
      key: 'photos',
      title: 'Photos',
      done: placeholders === 0,
      important: placeholders > 0,
      detail: placeholders ? `${plural(placeholders, 'photo')} still show a placeholder. Add the client’s photos or stock photos before going live.` : 'Every photo slot has a photo.',
    },
    {
      key: 'reviews',
      title: 'Reviews',
      done: samples === 0,
      important: samples > 0,
      detail: samples ? `${plural(samples, 'sample review')} written as placeholders. Replace them with real reviews from the client, or remove the section.` : 'No sample reviews on the site.',
    },
    {
      key: 'contact',
      title: 'Contact details',
      done: reachable && (!contact || !!contact.content.address || !contact.content.mapQuery),
      important: !reachable,
      detail: reachable ? 'Check the phone, WhatsApp number, address and opening hours with the client.' : 'There is no phone, WhatsApp or email on the site. Add at least one way to reach the business.',
    },
    {
      key: 'domain',
      title: 'Domain',
      done: false,
      detail: 'Connect the client’s domain in Vercel → the project → Settings → Domains, then update their DNS records.',
    },
    {
      key: 'hosting',
      title: 'Hosting account',
      done: false,
      detail: 'Vercel’s free Hobby plan is for non-commercial use. For a paying client, transfer the project to their own Vercel account or use a paid plan.',
    },
    {
      key: 'env',
      title: 'Environment variables',
      done: true,
      detail: 'None needed: this site has no database, payments or forms.',
    },
  ];
  if (stock) {
    items.splice(1, 0, {
      key: 'stock',
      title: 'Stock photo credits',
      done: false,
      detail: `${plural(stock, 'photo')} from Unsplash or Pexels. They are free to use; crediting the photographers on the site is appreciated.`,
    });
  }
  return items;
}
