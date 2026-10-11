import type { Product, Section, SiteConfig } from '../schema';
import { themeFromPreset } from '../theme';

/* A small sample store: products with categories, options, a sale and a sold-out item. */

const photo = (alt: string) => ({ src: '', alt });

const nav = (id: string): Section => ({
  id,
  type: 'navbar',
  variant: 'inline',
  content: { brand: 'Volt Supply', links: [{ label: 'Shop', href: '/shop' }, { label: 'Contact', href: '/#home-cta' }], cta: { label: 'Shop now', href: '/shop' } },
});
const footer = (id: string): Section => ({
  id,
  type: 'footer',
  variant: 'simple',
  content: { brand: 'Volt Supply', tagline: 'Gadgets, tested before they’re sold.', links: [{ label: 'Shop', href: '/shop' }], instagram: '@voltsupply', whatsapp: '+1 555 458 3301', note: '© 2026 Volt Supply · Level 2, Metro Mall' },
});
const whatsapp = (id: string): Section => ({ id, type: 'whatsapp-float', variant: 'bubble', content: { number: '+1 555 458 3301', message: 'Hi Volt Supply, I have a question.', label: 'Chat with us' } });

const products: Product[] = [
  { id: 'x2-earbuds', name: 'X2 Wireless Earbuds', price: 89, compareAt: 109, category: 'Audio', description: 'Noise cancelling, 30 hours with the case.', image: photo('black wireless earbuds in an open case'), options: [{ name: 'Colour', values: ['Black', 'White'] }] },
  { id: 'arc-speaker', name: 'Arc Speaker', price: 129, category: 'Audio', description: 'Room-filling sound in a fabric shell.', image: photo('round fabric speaker on a desk') },
  { id: 'pulse-watch', name: 'Pulse Watch', price: 199, category: 'Wearables', description: 'Heart rate, sleep and a week of battery.', image: photo('smartwatch with a dark strap'), options: [{ name: 'Strap', values: ['S', 'M', 'L'] }] },
  { id: 'fold-stand', name: 'Fold Stand', price: 24, category: 'Accessories', description: 'Aluminium phone stand that folds flat.', image: photo('folding aluminium phone stand') },
  { id: 'braid-cable', name: 'Braided USB-C Cable', price: 15, category: 'Accessories', description: 'Two metres, 100 W.', image: photo('coiled braided cable'), soldOut: true },
  { id: 'mag-charger', name: 'Mag Charger', price: 39, category: 'Accessories', description: 'Snaps on and charges at 15 W.', image: photo('magnetic wireless charging puck') },
];

export const VOLT_SUPPLY: SiteConfig = {
  schemaVersion: 1,
  meta: { businessName: 'Volt Supply', description: 'Gadgets and accessories in Metro Mall, ordered online or on WhatsApp.', language: 'en' },
  theme: themeFromPreset('tech-dark'),
  modules: {},
  store: { currency: 'USD', whatsapp: '+1 555 458 3301', products },
  pages: [
    {
      id: 'home',
      path: '/',
      title: 'Home',
      sections: [
        nav('home-nav'),
        { id: 'home-hero', type: 'hero', variant: 'centered', content: { eyebrow: 'New in', heading: 'The new X2 is here', subheading: 'Earbuds that block the noise and last all week.', primaryCta: { label: 'Shop the X2', href: '/product/x2-earbuds' }, image: photo('earbuds on a dark surface') } },
        { id: 'home-feature', type: 'product-feature', variant: 'split', content: { eyebrow: 'Bestseller', productId: 'pulse-watch', heading: '' } },
        { id: 'home-products', type: 'product-grid', variant: 'cards', content: { eyebrow: 'Shop', heading: 'Popular right now', intro: '', category: '', filter: false, limit: 4 } },
        { id: 'home-cta', type: 'cta', variant: 'banner', content: { heading: 'Questions before you buy?', text: 'Message us on WhatsApp and we’ll help you choose.', button: { label: 'Browse everything', href: '/shop' } } },
        footer('home-footer'),
        whatsapp('home-whatsapp'),
      ],
    },
    {
      id: 'shop',
      path: '/shop',
      title: 'Shop',
      sections: [
        nav('shop-nav'),
        { id: 'shop-products', type: 'product-grid', variant: 'minimal', content: { eyebrow: '', heading: 'All products', intro: 'Everything we stock, tested in the shop.', category: '', filter: true } },
        footer('shop-footer'),
        whatsapp('shop-whatsapp'),
      ],
    },
  ],
};
