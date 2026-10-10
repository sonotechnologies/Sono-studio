import type { StockProviderId } from '@/ai/types';

/** One stock photo with the attribution its licence asks for. */
export interface StockPhoto {
  source: StockProviderId;
  url: string;
  alt: string;
  credit: string;
  width: number;
  height: number;
}

export interface StockSearch {
  search(query: string, orientation: 'landscape' | 'portrait' | 'squarish'): Promise<StockPhoto | null>;
}

type Fetch = typeof fetch;

export function unsplash(accessKey: string, f: Fetch = fetch): StockSearch {
  return {
    async search(query, orientation) {
      const url = `https://api.unsplash.com/search/photos?per_page=1&content_filter=high&orientation=${orientation}&query=${encodeURIComponent(query)}`;
      const res = await f(url, { headers: { authorization: `Client-ID ${accessKey}`, 'accept-version': 'v1' }, signal: AbortSignal.timeout(15_000) });
      if (!res.ok) throw new Error(`Unsplash ${res.status}`);
      const data = (await res.json()) as {
        results?: { urls: { regular: string }; alt_description?: string | null; width: number; height: number; user: { name: string; links: { html: string } }; links: { download_location: string } }[];
      };
      const hit = data.results?.[0];
      if (!hit) return null;
      // Unsplash's API guidelines ask for a download event when a photo is used.
      f(hit.links.download_location, { headers: { authorization: `Client-ID ${accessKey}` } }).catch(() => {});
      return {
        source: 'unsplash',
        url: hit.urls.regular,
        alt: hit.alt_description || query,
        credit: `Photo by ${hit.user.name} on Unsplash`,
        width: hit.width,
        height: hit.height,
      };
    },
  };
}

export function pexels(apiKey: string, f: Fetch = fetch): StockSearch {
  return {
    async search(query, orientation) {
      const o = orientation === 'squarish' ? 'square' : orientation;
      const res = await f(`https://api.pexels.com/v1/search?per_page=1&orientation=${o}&query=${encodeURIComponent(query)}`, {
        headers: { authorization: apiKey },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`Pexels ${res.status}`);
      const data = (await res.json()) as { photos?: { src: { large: string }; alt?: string; width: number; height: number; photographer: string }[] };
      const hit = data.photos?.[0];
      if (!hit) return null;
      return { source: 'pexels', url: hit.src.large, alt: hit.alt || query, credit: `Photo by ${hit.photographer} on Pexels`, width: hit.width, height: hit.height };
    },
  };
}

/** Tries each source in turn; a failing source is skipped for the rest of the run. */
export function chain(sources: StockSearch[]): StockSearch {
  const dead = new Set<number>();
  return {
    async search(query, orientation) {
      for (let i = 0; i < sources.length; i++) {
        if (dead.has(i)) continue;
        try {
          const hit = await sources[i].search(query, orientation);
          if (hit) return hit;
        } catch {
          dead.add(i);
        }
      }
      return null;
    },
  };
}
