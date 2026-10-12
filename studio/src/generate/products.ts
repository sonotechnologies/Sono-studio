import type { Bookings, Product, Service, Store } from '@/site/schema';
import { defaultBookings } from '@/workspace/bookings';
import { sampleProducts } from '@/workspace/store';
import type { Brief, Extracted } from './brief';

/*
 * A store's products come only from what the owner gave: the items read from
 * their text or current site. None are invented; with nothing given, the shop
 * starts with samples that the checklist asks to replace.
 */

export const isStore = (brief: Pick<Brief, 'pages'>) => brief.pages.includes('shop');
export const isBooking = (brief: Pick<Brief, 'pages'>) => brief.pages.includes('book');

/** "₦4,500" → 4500, "GHS 25.50" → 25.5, "1.234,50 €" → 1234.5, "from $20" → 20; null when there's no number. */
export function parsePrice(text: string): number | null {
  const m = /\d[\d.,\s]*/.exec(text);
  if (!m) return null;
  let s = m[0].replace(/\s/g, '').replace(/[.,]+$/, '');
  const grouped = /^(\d{1,3})([.,])\d{3}(\2\d{3})*([.,]\d{1,2})?$/.exec(s);
  if (grouped) {
    s = s.split(grouped[2]).join('');
    s = s.replace(',', '.');
  } else s = s.replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 && n <= 100_000_000 ? Math.round(n * 100) / 100 : null;
}

const SYMBOLS: [RegExp, string][] = [
  [/₦|\bNGN\b|\bnaira\b/i, 'NGN'],
  [/GH₵|GH¢|₵|\bGHS\b|\bcedis?\b/i, 'GHS'],
  [/\bKSh|\bKES\b/i, 'KES'],
  [/\bZAR\b|(^|\s)R\s?\d/, 'ZAR'],
  [/\bUGX\b|\bUSh/i, 'UGX'],
  [/\bTZS\b|\bTSh/i, 'TZS'],
  [/\bRWF\b|\bFRw/i, 'RWF'],
  [/\bXOF\b|\bCFA\b|\bFCFA\b/i, 'XOF'],
  [/\bEGP\b|E£/i, 'EGP'],
  [/\bMAD\b|\bDH\b/i, 'MAD'],
  [/\bAED\b/i, 'AED'],
  [/₹|\bINR\b/i, 'INR'],
  [/€|\bEUR\b/i, 'EUR'],
  [/£|\bGBP\b/i, 'GBP'],
  [/\bCAD\b|C\$/i, 'CAD'],
  [/\bAUD\b|A\$/i, 'AUD'],
  [/\$|\bUSD\b/i, 'USD'],
];

/** The currency the prices are written in, if they say. */
export function detectCurrency(prices: string[]): string | null {
  const counts = new Map<string, number>();
  for (const p of prices) {
    const hit = SYMBOLS.find(([re]) => re.test(p));
    if (hit) counts.set(hit[1], (counts.get(hit[1]) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) || 'product';

export function productsFromItems(items: Extracted['items']): Product[] {
  const taken = new Set<string>();
  return items
    .filter((i) => i.name.trim())
    .slice(0, 60)
    .map((i) => {
      let id = slug(i.name);
      for (let n = 2; taken.has(id); n++) id = `${slug(i.name).slice(0, 46)}-${n}`;
      taken.add(id);
      const name = i.name.trim().slice(0, 80);
      return {
        id,
        name,
        price: parsePrice(i.price) ?? 0,
        category: i.category.trim().slice(0, 40),
        description: i.description.trim().slice(0, 600),
        image: { src: '', alt: name },
      };
    });
}

/** The store for a brief: its products from the owner's items, or samples. */
export function storeFor(brief: Brief, extracted: Extracted | null): Store | undefined {
  if (!isStore(brief)) return undefined;
  const items = extracted?.items ?? [];
  const products = productsFromItems(items);
  return {
    currency: brief.currency ?? detectCurrency(items.map((i) => i.price)) ?? 'USD',
    whatsapp: brief.client.whatsapp,
    products: products.length ? products : sampleProducts(),
  };
}

/** "45 min", "1 hr", "1h30", "2 hours" in an item's name or description; null if none. */
export function parseDuration(text: string): number | null {
  const t = text.toLowerCase();
  const hm = /(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b\s*(?:(\d{1,2})\s*(?:m|min|mins|minutes)?\b)?/.exec(t) ?? /(\d+)h(\d{2})/.exec(t);
  if (hm) return Math.round(parseFloat(hm[1]) * 60 + (hm[2] ? parseInt(hm[2], 10) : 0));
  const m = /(\d{1,3})\s*(?:m|min|mins|minutes)\b/.exec(t);
  return m ? parseInt(m[1], 10) : null;
}

/** Services from the owner's price list; the length is read from the text, or an hour. */
export function servicesFromItems(items: Extracted['items']): Service[] {
  return productsFromItems(items).map((p, i) => {
    const item = items.filter((x) => x.name.trim())[i];
    const minutes = parseDuration(`${item?.name ?? ''} ${item?.description ?? ''} ${item?.price ?? ''} ${item?.category ?? ''}`);
    const duration = Math.min(720, Math.max(5, Math.round((minutes ?? 60) / 5) * 5));
    // "(90 min)" can be read as a category; a length isn't one.
    const category = parseDuration(p.category) !== null && /^[\s\d.,]*(h|hr|hrs|hours?|m|mins?|minutes)\b/i.test(p.category.trim()) ? '' : p.category;
    return { id: p.id, name: p.name, duration, price: p.price, description: p.description.slice(0, 400), category };
  });
}

/** The bookings for a brief: services from the owner's items (or samples), Monday to Saturday hours. */
export function bookingsFor(brief: Brief, extracted: Extracted | null): Bookings | undefined {
  if (!isBooking(brief)) return undefined;
  const items = extracted?.items ?? [];
  return defaultBookings({
    currency: brief.currency ?? detectCurrency(items.map((i) => i.price)) ?? 'USD',
    timezone: brief.timezone ?? 'Africa/Lagos',
    whatsapp: brief.client.whatsapp,
    services: servicesFromItems(items),
  });
}
