import { describe, expect, it } from 'vitest';
import { demoClient } from '@/ai/demo';
import { handoverChecklist } from '@/export/checklist';
import { exportSite } from '@/export/generate';
import { KORA_KITCHEN } from '@/site/samples/kora-kitchen';
import { siteConfigSchema, type SiteConfig } from '@/site/schema';
import { priceBooking } from '@/site/store/payments';
import { addBookings, removeService, saveService, setBookings } from '@/workspace/bookings';
import type { Brief, GenerationJob } from './brief';
import { normalisePlan } from './plan';
import { advance } from './pipeline';
import { parseDuration, servicesFromItems } from './products';

const salon: Brief = {
  businessName: 'Studio Nala',
  businessType: 'Salon',
  preset: 'luxe-minimal',
  pages: ['home', 'services', 'book', 'contact'],
  paste: 'Hair, colour and quiet\nSilk press (90 min) ₦25,000\nCut and style 1 hr ₦15,000\nBraids 4 hours ₦60,000',
  client: { ownerName: 'Nala', whatsapp: '+234 803 000 0000', instagram: '', address: 'Lekki' },
  brandColors: [],
  useBrand: false,
  timezone: 'Africa/Lagos',
};

describe('services from a price list', () => {
  it('reads lengths written in many ways', () => {
    expect(parseDuration('Silk press (90 min)')).toBe(90);
    expect(parseDuration('Cut 1 hr')).toBe(60);
    expect(parseDuration('Braids 4 hours')).toBe(240);
    expect(parseDuration('Massage 1h30')).toBe(90);
    expect(parseDuration('1.5 hours')).toBe(90);
    expect(parseDuration('Manicure')).toBeNull();
    expect(servicesFromItems([{ name: 'Manicure', description: '', price: '₦8,000', category: 'Nails' }])[0]).toMatchObject({ duration: 60, price: 8000, category: 'Nails' });
  });
});

describe('a booking site from the wizard', () => {
  it('puts the booking section on the Book page and keeps it off other sites', () => {
    const plan = normalisePlan({ pages: [{ path: '/book', title: 'Book', sections: [{ type: 'faq' }] }] }, salon, null);
    expect(plan.pages.find((p) => p.id === 'book')!.sections[0].type).toBe('booking');
    const showcase = normalisePlan({ pages: [{ path: '/', title: 'Home', sections: [{ type: 'hero' }, { type: 'booking' }] }] }, { ...salon, pages: ['home'] }, null);
    expect(showcase.pages[0].sections.map((s) => s.type)).not.toContain('booking');
  });

  it('generates bookings with the owner’s services, hours and time zone', async () => {
    let saved: SiteConfig | null = null;
    let job: GenerationJob = { id: 'j', projectId: 'p', status: 'running', brief: salon, extracted: null, plan: null, filled: {}, imagesDone: false, steps: [], error: null, createdAt: '', updatedAt: '' };
    const deps = { providers: [demoClient()], stock: null, assets: [], saveVersion: async (c: SiteConfig) => ((saved = c), 1), recordStock: async () => {} };
    job = (await advance(job, deps)).job;
    job = { ...(await advance(job, deps)).job, status: 'running' };
    for (let i = 0; i < 12 && job.status === 'running'; i++) job = (await advance(job, deps)).job;
    expect(job.status).toBe('done');
    const site = siteConfigSchema.parse(saved);
    expect(site.bookings).toMatchObject({ currency: 'NGN', timezone: 'Africa/Lagos', whatsapp: '+234 803 000 0000' });
    expect(site.bookings!.services.map((s) => [s.name, s.duration, s.price])).toEqual([
      ['Silk press', 90, 25000],
      ['Cut and style 1 hr', 60, 15000],
      ['Braids 4 hours', 240, 60000],
    ]);
    expect(site.bookings!.services[0].category).toBe('');
    expect(site.pages.find((p) => p.path === '/book')!.sections.some((s) => s.type === 'booking')).toBe(true);
    expect(site.pages[0].sections.find((s) => s.type === 'navbar')?.content).toMatchObject({ cta: { label: 'Book now', href: '/book' } });
  }, 20_000);
});

describe('booking on the server', () => {
  const site = addBookings(KORA_KITCHEN, { currency: 'NGN', timezone: 'Africa/Lagos' }).config;
  const b = { ...site.bookings!, depositPercent: 30, payments: { whatsapp: true, paystack: true, stripe: false }, services: [{ id: 'cut', name: 'Cut', duration: 60, price: 15000, description: '', category: '' }] };
  const now = new Date('2026-10-11T07:00:00Z'); // Sunday 08:00 in Lagos
  const body = { provider: 'paystack', serviceId: 'cut', start: '2026-10-12T08:00:00.000Z', customer: { name: 'Ada', email: 'ada@example.com' } };

  it('prices the deposit and attaches the booking to the payment', () => {
    const r = priceBooking(b, body, [], now);
    expect(r.order).toMatchObject({ total: 4500, currency: 'NGN', booking: { serviceId: 'cut', start: '2026-10-12T08:00:00.000Z', end: '2026-10-12T09:00:00.000Z' } });
    expect(r.order.lines[0].name).toBe('Deposit: Cut, Mon 12 Oct, 09:00');
  });

  it('refuses taken or made-up times, services without a deposit, and missing details', () => {
    expect(() => priceBooking(b, body, [{ start: '2026-10-12T08:30:00.000Z', end: '2026-10-12T09:30:00.000Z' }], now)).toThrow(/isn’t free/);
    expect(() => priceBooking(b, { ...body, start: '2026-10-12T08:07:00.000Z' }, [], now)).toThrow(/isn’t free/);
    expect(() => priceBooking({ ...b, depositPercent: 0 }, body, [], now)).toThrow(/way to pay/);
    expect(() => priceBooking({ ...b, services: [{ ...b.services[0], price: 0 }] }, body, [], now)).toThrow(/doesn’t take a deposit/);
    expect(() => priceBooking(b, { ...body, customer: { name: 'Ada', email: 'nope' } }, [], now)).toThrow(/email/);
  });
});

describe('bookings in the workspace and export', () => {
  it('adds a Book page, a menu link and sample services', () => {
    const { config, pageId } = addBookings(KORA_KITCHEN, { currency: 'GHS', timezone: 'Africa/Accra' });
    expect(config.bookings).toMatchObject({ currency: 'GHS', timezone: 'Africa/Accra', depositPercent: 0 });
    expect(config.pages.find((p) => p.id === pageId)!.sections.map((s) => s.type)).toContain('booking');
    const nav = config.pages[0].sections.find((s) => s.type === 'navbar');
    expect(nav?.type === 'navbar' && nav.content.links.at(-1)).toEqual({ label: 'Book', href: '/book' });
    expect(handoverChecklist(config)[0]).toMatchObject({ key: 'bookings', important: true });
    const edited = removeService(saveService(config, { id: 'cut', name: 'Cut', duration: 45, price: 50, description: '', category: '' }), 'sample-service-1');
    expect(edited.bookings!.services.map((s) => s.id)).toEqual(['sample-service-2', 'cut']);
    expect(() => setBookings(config, { hours: [{ day: 1, open: '18:00', close: '09:00' }] })).toThrow();
  });

  it('exports deposit routes only when deposits are on', async () => {
    const base = addBookings(KORA_KITCHEN, { currency: 'NGN', timezone: 'Africa/Lagos' }).config;
    const plain = await exportSite({ config: base, projectName: 'Kora', version: 1, loadImage: async () => null });
    expect(plain.files.some((f) => f.path.startsWith('src/app/api/'))).toBe(false);
    expect(plain.files.map((f) => f.path)).toEqual(expect.arrayContaining(['src/site/sections/booking.tsx', 'src/site/store/booking-widget.tsx']));
    const deposits = { ...base, bookings: { ...base.bookings!, depositPercent: 30, payments: { whatsapp: true, paystack: true, stripe: false } } };
    const { files } = await exportSite({ config: deposits, projectName: 'Kora', version: 1, loadImage: async () => null });
    const paths = files.map((f) => f.path);
    expect(paths).toEqual(expect.arrayContaining(['src/app/api/busy/route.ts', 'src/app/api/book/route.ts', 'src/app/booking/[ref]/page.tsx', 'src/app/api/webhooks/paystack/route.ts']));
    expect(paths).not.toContain('src/app/api/checkout/route.ts');
    expect(String(files.find((f) => f.path === 'src/site/page.tsx')!.data)).toContain('booking: bookingCtx(site)');
    if (process.env.SONO_EXPORT_BOOK_OUT) {
      const { mkdir, writeFile } = await import('node:fs/promises');
      const path = await import('node:path');
      for (const f of files) {
        const p = path.join(process.env.SONO_EXPORT_BOOK_OUT, f.path);
        await mkdir(path.dirname(p), { recursive: true });
        await writeFile(p, f.data);
      }
    }
  });
});
