import { sectionSchema, siteConfigSchema, type Product, type Section, type SiteConfig } from '@/site/schema';
import { preferredLayouts } from '@/site/starter';
import { syncShared, uniqueSectionId } from './model';

/*
 * Store edits, as pure functions like the rest of the workspace model:
 * products added, changed, moved and removed, and a shop added to a site
 * that didn't have one.
 */

export const CURRENCIES = ['NGN', 'GHS', 'KES', 'ZAR', 'UGX', 'TZS', 'RWF', 'XOF', 'EGP', 'MAD', 'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'AED', 'INR'] as const;

export function productId(config: SiteConfig, name: string): string {
  const taken = new Set(config.store?.products.map((p) => p.id) ?? []);
  const base = name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'product';
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}

function withProducts(config: SiteConfig, fn: (list: Product[]) => Product[]): SiteConfig {
  if (!config.store) throw new Error('This site has no shop yet');
  return siteConfigSchema.parse({ ...config, store: { ...config.store, products: fn(config.store.products) } });
}

/** Replaces the product with the same id, or adds it at the end. */
export function saveProduct(config: SiteConfig, product: Product): SiteConfig {
  return withProducts(config, (list) => (list.some((p) => p.id === product.id) ? list.map((p) => (p.id === product.id ? product : p)) : [...list, product]));
}

export function removeProduct(config: SiteConfig, id: string): SiteConfig {
  return withProducts(config, (list) => list.filter((p) => p.id !== id));
}

export function moveProduct(config: SiteConfig, id: string, to: number): SiteConfig {
  return withProducts(config, (list) => {
    const from = list.findIndex((p) => p.id === id);
    if (from < 0) return list;
    const arr = [...list];
    const [it] = arr.splice(from, 1);
    arr.splice(Math.max(0, Math.min(arr.length, to)), 0, it);
    return arr;
  });
}

export function newProduct(config: SiteConfig, name = 'New product'): Product {
  return { id: productId(config, name), name, price: 0, category: '', description: '', image: { src: '', alt: name } };
}

/** Placeholders for a shop with no products yet; the checklist asks for real ones. */
export function sampleProducts(): Product[] {
  return [1, 2, 3].map((n) => ({
    id: `sample-product-${n}`,
    name: `Sample product ${n}`,
    price: 0,
    category: '',
    description: 'Replace with a real product: its name, price, photo and a line about it.',
    image: { src: '', alt: 'product photo' },
    sample: true,
  }));
}

/** The business's WhatsApp number, from wherever the site already shows it. */
export function siteWhatsapp(config: SiteConfig): string {
  for (const p of config.pages)
    for (const s of p.sections) {
      if (s.type === 'whatsapp-float' && s.content.number) return s.content.number;
      if ((s.type === 'contact' || s.type === 'footer') && s.content.whatsapp) return s.content.whatsapp;
    }
  return '';
}

/**
 * Turns a showcase site into a shop: a store with sample products, a Shop page
 * with the product grid, and a Shop link in the menu.
 */
export function addShop(config: SiteConfig, currency: string): { config: SiteConfig; pageId: string } {
  if (config.store) {
    const shop = config.pages.find((p) => p.sections.some((s) => s.type === 'product-grid'));
    return { config, pageId: shop?.id ?? config.pages[0].id };
  }
  const home = config.pages.find((p) => p.path === '/') ?? config.pages[0];
  const path = config.pages.some((p) => p.path === '/shop') ? '/store' : '/shop';
  const pageId = path.slice(1);
  const layouts = preferredLayouts(config.theme);
  const draft = { ...config, store: { currency, whatsapp: siteWhatsapp(config), products: sampleProducts() } };
  const copy = (s: Section): Section => ({ ...structuredClone(s), id: uniqueSectionId(draft, `${pageId}-${s.type}`) });
  const shared = home.sections.filter((s) => s.type === 'navbar' || s.type === 'footer' || s.type === 'whatsapp-float');
  const grid = sectionSchema.parse({
    id: `${pageId}-products`,
    type: 'product-grid',
    variant: layouts['product-grid'] && ['cards', 'minimal', 'list'].includes(layouts['product-grid']) ? layouts['product-grid'] : 'cards',
    content: { eyebrow: '', heading: 'Shop', intro: '', category: '', filter: true },
  });
  const sections = [...shared.filter((s) => s.type === 'navbar').map(copy), grid, ...shared.filter((s) => s.type !== 'navbar').map(copy)];
  let next: SiteConfig = { ...draft, pages: [...config.pages, { id: pageId, path, title: 'Shop', sections }] };
  // A Shop link in the menu (the navbar is shared, so every page gets it).
  const nav = home.sections.find((s) => s.type === 'navbar');
  if (nav && nav.type === 'navbar' && !nav.content.links.some((l) => l.href === path) && nav.content.links.length < 6) {
    next = {
      ...next,
      pages: next.pages.map((p) =>
        p.id === home.id ? { ...p, sections: p.sections.map((s) => (s.id === nav.id && s.type === 'navbar' ? { ...s, content: { ...s.content, links: [{ label: 'Shop', href: path }, ...s.content.links] } } : s)) } : p,
      ),
    };
    next = syncShared(next, nav.id);
  }
  return { config: siteConfigSchema.parse(next), pageId };
}
