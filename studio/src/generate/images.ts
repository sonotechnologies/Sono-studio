import type { SiteImage, Section } from '@/site/schema';
import type { Asset } from './brief';
import type { StockPhoto, StockSearch } from './stock';

interface Slot {
  get(): SiteImage | undefined;
  set(img: SiteImage): void;
  orientation: 'landscape' | 'portrait' | 'squarish';
  /** Lower goes first: client photos land on the most visible slots. */
  rank: number;
}

function slotsOf(section: Section, pageRank: number): Slot[] {
  const out: Slot[] = [];
  const add = (holder: Record<string, unknown>, key: string, orientation: Slot['orientation'], rank: number) => {
    const img = holder[key] as SiteImage | undefined;
    if (img) out.push({ get: () => holder[key] as SiteImage, set: (v) => (holder[key] = v), orientation, rank: pageRank + rank });
  };
  const c = section.content as Record<string, unknown>;
  switch (section.type) {
    case 'hero':
      add(c, 'image', section.variant === 'split-photo' ? 'portrait' : 'landscape', 0);
      break;
    case 'about':
      add(c, 'image', 'portrait', 1);
      break;
    case 'cta':
      add(c, 'image', 'landscape', 5);
      break;
    case 'features':
      (c.items as Record<string, unknown>[]).forEach((it) => add(it, 'image', 'landscape', 2));
      break;
    case 'gallery':
      (c.images as SiteImage[]).forEach((_, i) => add(c.images as unknown as Record<string, unknown>, String(i), i % 2 ? 'portrait' : 'squarish', 3));
      break;
  }
  return out;
}

export interface ImageResult {
  pages: Record<string, Section[]>;
  stock: StockPhoto[];
}

/**
 * Client photos go first, onto the most visible slots. Remaining slots are
 * filled from stock search using the alt text the model wrote, up to a cap
 * that stays well inside free API limits. Anything left keeps its placeholder.
 */
export async function placeImages(
  pages: Record<string, Section[]>,
  pageOrder: string[],
  photos: Asset[],
  stock: StockSearch | null,
  context: string,
  maxStock = 12,
): Promise<ImageResult> {
  const out = structuredClone(pages);
  const slots = pageOrder
    .flatMap((pid, pi) => (out[pid] ?? []).flatMap((s) => slotsOf(s, pi * 10)))
    .sort((a, b) => a.rank - b.rank);
  const own = photos.filter((a) => a.kind === 'photo');
  const used: StockPhoto[] = [];
  const cache = new Map<string, StockPhoto | null>();
  let i = 0;
  for (const slot of slots) {
    const current = slot.get();
    if (!current || current.src) continue;
    if (i < own.length) {
      const a = own[i++];
      slot.set({ src: a.url, alt: a.alt || current.alt });
      continue;
    }
    if (!stock || used.length >= maxStock) continue;
    const query = `${current.alt} ${context}`.trim().slice(0, 100);
    if (!cache.has(query)) cache.set(query, await stock.search(query, slot.orientation).catch(() => null));
    const hit = cache.get(query);
    if (hit && !used.some((u) => u.url === hit.url)) {
      used.push(hit);
      slot.set({ src: hit.url, alt: current.alt, credit: hit.credit });
    }
  }
  return { pages: out, stock: used };
}
