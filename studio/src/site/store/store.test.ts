import { describe, expect, it } from 'vitest';
import { exportSite } from '@/export/generate';
import { findPage } from '../render';
import { VOLT_SUPPLY } from '../samples/volt-supply';
import { siteConfigSchema } from '../schema';
import { formatPrice, orderMessage } from './format';

describe('store', () => {
  it('formats prices the way shoppers expect', () => {
    expect(formatPrice(4500, 'NGN')).toBe('₦4,500');
    expect(formatPrice(12.5, 'USD')).toBe('$12.50');
    expect(formatPrice(9, 'EUR')).toBe('€9');
    expect(formatPrice(250, 'GHS')).toMatch(/250/);
  });

  it('writes the WhatsApp order with options, total and the customer’s details', () => {
    const text = orderMessage({
      business: 'Volt Supply',
      currency: 'USD',
      lines: [
        { name: 'X2 Wireless Earbuds', price: 89, qty: 2, options: { Colour: 'White' } },
        { name: 'Fold Stand', price: 24, qty: 1 },
      ],
      customer: 'Ama',
      note: '12 Ring Road',
    });
    expect(text).toBe(
      ['Hello Volt Supply, I’d like to order:', '• 2 × X2 Wireless Earbuds (Colour: White): $178', '• 1 × Fold Stand: $24', 'Total: $202', 'Name: Ama', 'Delivery / note: 12 Ring Road'].join('\n'),
    );
  });

  it('validates the sample store and gives every product a page', () => {
    const config = siteConfigSchema.parse(VOLT_SUPPLY);
    const page = findPage(config, '/product/pulse-watch')!;
    expect(page.title).toBe('Pulse Watch');
    expect(page.sections.map((s) => s.type)).toEqual(['navbar', 'product-detail', 'footer', 'whatsapp-float']);
    expect(findPage(config, '/product/nope')).toBeUndefined();
    const dup = structuredClone(VOLT_SUPPLY);
    dup.store!.products.push({ ...dup.store!.products[0] });
    expect(siteConfigSchema.safeParse(dup).success).toBe(false);
  });

  it('exports the cart, the store sections and a page per product', async () => {
    const { files } = await exportSite({ config: VOLT_SUPPLY, projectName: 'Volt Supply', version: 1, loadImage: async () => null });
    const paths = files.map((f) => f.path);
    expect(paths).toEqual(expect.arrayContaining(['src/site/store/cart.tsx', 'src/site/sections/product-grid.tsx', 'src/site/sections/product-detail.tsx', 'src/app/product/[id]/page.tsx', 'src/app/shop/page.tsx']));
    expect(files.find((f) => f.path === 'src/app/product/[id]/page.tsx')!.data).toContain('generateStaticParams');
    // Set SONO_EXPORT_STORE_OUT to write it to disk and try building it.
    if (process.env.SONO_EXPORT_STORE_OUT) {
      const { mkdir, writeFile } = await import('node:fs/promises');
      const path = await import('node:path');
      for (const f of files) {
        const p = path.join(process.env.SONO_EXPORT_STORE_OUT, f.path);
        await mkdir(path.dirname(p), { recursive: true });
        await writeFile(p, f.data);
      }
    }
  });

  it('adds checkout, the order page and webhooks only when card payments are on', async () => {
    const withCards = { ...VOLT_SUPPLY, store: { ...VOLT_SUPPLY.store!, payments: { whatsapp: true, paystack: true, stripe: true } } };
    const { files, checklist } = await exportSite({ config: withCards, projectName: 'Volt Supply', version: 1, loadImage: async () => null });
    const paths = files.map((f) => f.path);
    expect(paths).toEqual(expect.arrayContaining(['src/app/api/checkout/route.ts', 'src/app/order/[ref]/page.tsx', 'src/app/api/webhooks/paystack/route.ts', 'src/app/api/webhooks/stripe/route.ts', 'src/lib/payments.ts', 'src/site/store/payments.ts', '.env.example']));
    expect(String(files.find((f) => f.path === 'src/site/page.tsx')!.data)).toContain('checkout: checkoutCtx(site)');
    expect(checklist.find((c) => c.key === 'env')).toMatchObject({ title: 'Card payments', important: true });
    const plain = await exportSite({ config: VOLT_SUPPLY, projectName: 'Volt Supply', version: 1, loadImage: async () => null });
    expect(plain.files.some((f) => f.path.startsWith('src/app/api/'))).toBe(false);
    if (process.env.SONO_EXPORT_PAY_OUT) {
      const { mkdir, writeFile } = await import('node:fs/promises');
      const path = await import('node:path');
      for (const f of files) {
        const p = path.join(process.env.SONO_EXPORT_PAY_OUT, f.path);
        await mkdir(path.dirname(p), { recursive: true });
        await writeFile(p, f.data);
      }
    }
  });
});
