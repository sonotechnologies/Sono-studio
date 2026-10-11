import { describe, expect, it } from 'vitest';
import { demoClient } from '@/ai/demo';
import { handoverChecklist } from '@/export/checklist';
import { KORA_KITCHEN } from '@/site/samples/kora-kitchen';
import { siteConfigSchema, type SiteConfig } from '@/site/schema';
import { addShop, moveProduct, newProduct, productId, removeProduct, saveProduct, siteWhatsapp } from '@/workspace/store';
import type { Brief, GenerationJob } from './brief';
import { advance } from './pipeline';
import { normalisePlan } from './plan';
import { detectCurrency, parsePrice, productsFromItems, storeFor } from './products';

const shopBrief: Brief = {
  businessName: 'Volt Supply',
  businessType: 'Gadget store',
  preset: 'tech-dark',
  pages: ['home', 'shop', 'contact'],
  paste: 'Gadgets with next-day delivery\nX2 Earbuds ₦45,000\nArc Speaker ₦120,500\nPulse Watch ₦89,999.50',
  client: { ownerName: '', whatsapp: '+234 803 000 0000', instagram: '', address: 'Lekki, Lagos' },
  brandColors: [],
  useBrand: false,
};

describe('product prices and currency', () => {
  it('reads prices however they are written', () => {
    expect(parsePrice('₦4,500')).toBe(4500);
    expect(parsePrice('GHS 25.50')).toBe(25.5);
    expect(parsePrice('1.234,50 €')).toBe(1234.5);
    expect(parsePrice('from $20')).toBe(20);
    expect(parsePrice('KSh 1 200')).toBe(1200);
    expect(parsePrice('12,5')).toBe(12.5);
    expect(parsePrice('Ask us')).toBeNull();
  });

  it('finds the currency from the price list', () => {
    expect(detectCurrency(['₦4,500', '₦3,000', '$5'])).toBe('NGN');
    expect(detectCurrency(['GH₵ 40'])).toBe('GHS');
    expect(detectCurrency(['KSh 900'])).toBe('KES');
    expect(detectCurrency(['40'])).toBeNull();
  });

  it('makes products only from the items given, with unique ids', () => {
    const p = productsFromItems([
      { name: 'Tee', description: '', price: '$20', category: 'Tops' },
      { name: 'Tee', description: 'Long sleeve', price: 'Ask', category: 'Tops' },
    ]);
    expect(p.map((x) => [x.id, x.price])).toEqual([
      ['tee', 20],
      ['tee-2', 0],
    ]);
  });

  it('uses samples when nothing was given, and no store for a showcase site', () => {
    expect(storeFor(shopBrief, { tagline: '', hours: [], items: [], facts: [] })!.products.every((p) => p.sample)).toBe(true);
    expect(storeFor({ ...shopBrief, pages: ['home'] }, null)).toBeUndefined();
  });
});

describe('planning a shop', () => {
  it('puts the product grid on the Shop page and home, and keeps store sections off showcase sites', () => {
    const raw = { pages: [{ path: '/', title: 'Home', sections: [{ type: 'hero' }, { type: 'about' }, { type: 'product-feature' }] }] };
    const store = normalisePlan(raw, shopBrief, null);
    expect(store.pages.find((p) => p.id === 'shop')!.sections[0].type).toBe('product-grid');
    expect(store.pages[0].sections.map((s) => s.type)).toContain('product-feature');
    const showcase = normalisePlan(raw, { ...shopBrief, pages: ['home', 'contact'] }, null);
    expect(showcase.pages[0].sections.map((s) => s.type)).not.toContain('product-feature');
    const bare = normalisePlan({ pages: [{ path: '/', title: 'Home', sections: [{ type: 'hero' }, { type: 'about' }] }] }, shopBrief, null);
    expect(bare.pages[0].sections.map((s) => s.type)).toEqual(['hero', 'product-grid', 'about']);
  });

  it('generates a working store from a price list with the demo provider', async () => {
    let saved: SiteConfig | null = null;
    let job: GenerationJob = {
      id: 'j', projectId: 'p', status: 'running', brief: shopBrief, extracted: null, plan: null, filled: {}, imagesDone: false, steps: [], error: null, createdAt: '', updatedAt: '',
    };
    const deps = { providers: [demoClient()], stock: null, assets: [], saveVersion: async (c: SiteConfig) => ((saved = c), 1), recordStock: async () => {} };
    job = (await advance(job, deps)).job;
    job = { ...(await advance(job, deps)).job, status: 'running' };
    for (let i = 0; i < 10 && job.status === 'running'; i++) job = (await advance(job, deps)).job;
    expect(job.status).toBe('done');
    const site = siteConfigSchema.parse(saved);
    expect(site.store?.currency).toBe('NGN');
    expect(site.store?.whatsapp).toBe('+234 803 000 0000');
    expect(site.store?.products.map((p) => p.price)).toEqual([45000, 120500, 89999.5]);
    const home = site.pages.find((p) => p.path === '/')!;
    const homeGrid = home.sections.find((s) => s.type === 'product-grid');
    expect(homeGrid?.type === 'product-grid' && homeGrid.content.limit).toBe(4);
    expect(home.sections.find((s) => s.type === 'navbar')?.content).toMatchObject({ cta: { label: 'Shop now', href: '/shop' } });
    expect(site.pages.map((p) => p.path)).toContain('/shop');
  }, 20_000);
});

describe('store edits', () => {
  const shop = () => addShop(KORA_KITCHEN, 'GHS');

  it('adds a shop page, a menu link and sample products to a showcase site', () => {
    const { config, pageId } = shop();
    expect(config.store?.currency).toBe('GHS');
    expect(config.store?.whatsapp).toBe(siteWhatsapp(KORA_KITCHEN));
    const page = config.pages.find((p) => p.id === pageId)!;
    expect(page.sections.map((s) => s.type)).toContain('product-grid');
    for (const p of config.pages) {
      const nav = p.sections.find((s) => s.type === 'navbar');
      if (nav?.type === 'navbar') expect(nav.content.links[0]).toEqual({ label: 'Shop', href: page.path });
    }
    expect(siteConfigSchema.safeParse(config).success).toBe(true);
    // Adding again changes nothing.
    expect(addShop(config, 'USD').config).toBe(config);
  });

  it('adds, moves and removes products, keeping ids unique', () => {
    let { config } = shop();
    const a = newProduct(config, 'Kente scarf');
    config = saveProduct(config, { ...a, price: 120 });
    expect(productId(config, 'Kente scarf')).toBe('kente-scarf-2');
    config = moveProduct(config, a.id, 0);
    expect(config.store!.products[0]).toMatchObject({ id: 'kente-scarf', price: 120 });
    config = removeProduct(config, a.id);
    expect(config.store!.products.some((p) => p.id === a.id)).toBe(false);
    expect(() => saveProduct(KORA_KITCHEN, a)).toThrow(/no shop/);
  });

  it('lists what to fix in the shop before launch', () => {
    const { config } = shop();
    const items = handoverChecklist(config);
    expect(items[0]).toMatchObject({ key: 'products', done: false, important: true });
    expect(items[0].detail).toMatch(/3 sample products/);
    const noNumber = handoverChecklist({ ...config, store: { ...config.store!, whatsapp: '' } });
    expect(noNumber.find((i) => i.key === 'orders')).toMatchObject({ done: false, important: true });
  });
});
