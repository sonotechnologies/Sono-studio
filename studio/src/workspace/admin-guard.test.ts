import { describe, expect, it } from 'vitest';
import { exportSite } from '@/export/generate';
import { VOLT_SUPPLY } from '@/site/samples/volt-supply';
import type { SiteConfig } from '@/site/schema';
import { adminChangeProblem } from './admin-guard';
import { addBookings } from './bookings';
import { setField } from './model';
import { saveProduct } from './store';

const site: SiteConfig = addBookings(VOLT_SUPPLY, { currency: 'USD', timezone: 'Africa/Lagos' }).config;
const hero = site.pages[0].sections.find((s) => s.type === 'hero')!;
const clone = (): SiteConfig => structuredClone(site);

describe('what a client may change in the admin panel', () => {
  it('allows words, photos, products, services, hours and contact numbers', () => {
    expect(adminChangeProblem(site, setField(site, hero.id, 'heading', 'Spring sale'))).toBeNull();
    expect(adminChangeProblem(site, saveProduct(site, { ...site.store!.products[0], price: 1, name: 'Renamed' }))).toBeNull();
    const c = clone();
    c.bookings!.services[0].price = 99;
    c.bookings!.hours = [{ day: 2, open: '10:00', close: '16:00' }];
    c.bookings!.closed = ['2026-12-25'];
    c.store!.whatsapp = '+1 555 000 1111';
    expect(adminChangeProblem(site, c)).toBeNull();
  });

  it('keeps the design, pages, layouts and payments with the owner', () => {
    const theme = clone();
    theme.theme.colors.primary = '#FF0000';
    expect(adminChangeProblem(site, theme)).toBe('the design');
    const page = clone();
    page.pages[0].title = 'Start';
    expect(adminChangeProblem(site, page)).toBe('the pages');
    const variant = clone();
    variant.pages[0].sections.find((s) => s.type === 'hero')!.variant = variant.pages[0].sections.find((s) => s.type === 'hero')!.variant === 'centered' ? 'split-photo' : 'centered';
    expect(adminChangeProblem(site, variant)).toBe('the layout');
    const order = clone();
    order.pages[0].sections.reverse();
    expect(adminChangeProblem(site, order)).toBe('the layout');
    const hidden = clone();
    hidden.pages[0].sections[1].hidden = true;
    expect(adminChangeProblem(site, hidden)).toBe('the layout');
    const pay = clone();
    pay.store!.payments = { whatsapp: true, paystack: true, stripe: true };
    expect(adminChangeProblem(site, pay)).toBe('the payment settings');
    const deposit = clone();
    deposit.bookings!.depositPercent = 50;
    expect(adminChangeProblem(site, deposit)).toBe('the deposit');
    const currency = clone();
    currency.store!.currency = 'EUR';
    expect(adminChangeProblem(site, currency)).not.toBeNull();
  });
});

describe('live sites read published content', () => {
  it('loads the published version from the studio, with the built-in copy as a fallback', async () => {
    const { files } = await exportSite({ config: VOLT_SUPPLY, projectName: 'Volt', version: 1, loadImage: async () => null });
    const page = String(files.find((f) => f.path === 'src/site/page.tsx')!.data);
    expect(page).toContain('process.env.SONO_SITE_API');
    expect(page).toContain('next: { revalidate: 60 }');
    expect(page).toContain('siteConfigSchema.safeParse');
    expect(String(files.find((f) => f.path === 'src/app/page.tsx')!.data)).toContain('export const revalidate = 60');
  });
});
