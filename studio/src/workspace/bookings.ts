import { sectionSchema, siteConfigSchema, type Bookings, type Section, type Service, type SiteConfig } from '@/site/schema';
import { preferredLayouts } from '@/site/starter';
import { syncShared, uniqueSectionId } from './model';
import { siteWhatsapp } from './store';

/*
 * Booking edits, as pure functions like the rest of the workspace model:
 * services added, changed, moved and removed, and bookings added to a site.
 */

/** Common time zones for the businesses the studio builds for; any IANA zone is accepted. */
export const TIMEZONES = [
  'Africa/Lagos',
  'Africa/Accra',
  'Africa/Nairobi',
  'Africa/Johannesburg',
  'Africa/Cairo',
  'Africa/Casablanca',
  'Africa/Kampala',
  'Africa/Kigali',
  'Africa/Dar_es_Salaam',
  'Africa/Abidjan',
  'Africa/Dakar',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'America/Toronto',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Australia/Sydney',
] as const;

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function serviceId(config: SiteConfig, name: string): string {
  const taken = new Set(config.bookings?.services.map((s) => s.id) ?? []);
  const base = name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'service';
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}

function withBookings(config: SiteConfig, fn: (b: Bookings) => Bookings): SiteConfig {
  if (!config.bookings) throw new Error('This site has no bookings yet');
  return siteConfigSchema.parse({ ...config, bookings: fn(config.bookings) });
}

export function setBookings(config: SiteConfig, patch: Partial<Bookings>): SiteConfig {
  return withBookings(config, (b) => ({ ...b, ...patch }));
}

/** Replaces the service with the same id, or adds it at the end. */
export function saveService(config: SiteConfig, service: Service): SiteConfig {
  return withBookings(config, (b) => ({
    ...b,
    services: b.services.some((s) => s.id === service.id) ? b.services.map((s) => (s.id === service.id ? service : s)) : [...b.services, service],
  }));
}

export function removeService(config: SiteConfig, id: string): SiteConfig {
  return withBookings(config, (b) => ({ ...b, services: b.services.filter((s) => s.id !== id) }));
}

export function moveService(config: SiteConfig, id: string, to: number): SiteConfig {
  return withBookings(config, (b) => {
    const from = b.services.findIndex((s) => s.id === id);
    if (from < 0) return b;
    const list = [...b.services];
    const [it] = list.splice(from, 1);
    list.splice(Math.max(0, Math.min(list.length, to)), 0, it);
    return { ...b, services: list };
  });
}

export function newService(config: SiteConfig, name = 'New service'): Service {
  return { id: serviceId(config, name), name, duration: 60, price: 0, description: '', category: '' };
}

export function sampleServices(): Service[] {
  return [
    { id: 'sample-service-1', name: 'Sample service 1', duration: 60, price: 0, description: 'Replace with a real service: its name, length and price.', category: '', sample: true },
    { id: 'sample-service-2', name: 'Sample service 2', duration: 30, price: 0, description: 'Replace with a real service: its name, length and price.', category: '', sample: true },
  ];
}

/** Monday to Saturday, 9:00 to 18:00. */
export function defaultHours(): Bookings['hours'] {
  return [1, 2, 3, 4, 5, 6].map((day) => ({ day, open: '09:00', close: '18:00' }));
}

export function defaultBookings(opts: { currency: string; timezone: string; whatsapp: string; services?: Service[] }): Bookings {
  return {
    currency: opts.currency,
    whatsapp: opts.whatsapp,
    timezone: opts.timezone,
    services: opts.services?.length ? opts.services : sampleServices(),
    hours: defaultHours(),
    step: 30,
    capacity: 1,
    notice: 2,
    daysAhead: 30,
    closed: [],
    depositPercent: 0,
    payments: { whatsapp: true, paystack: false, stripe: false },
  };
}

/**
 * Adds online booking to a site: sample services, a Book page with the
 * booking section, and a Book link in the menu.
 */
export function addBookings(config: SiteConfig, opts: { currency: string; timezone: string }): { config: SiteConfig; pageId: string } {
  if (config.bookings) {
    const page = config.pages.find((p) => p.sections.some((s) => s.type === 'booking'));
    return { config, pageId: page?.id ?? config.pages[0].id };
  }
  const home = config.pages.find((p) => p.path === '/') ?? config.pages[0];
  const path = config.pages.some((p) => p.path === '/book') ? '/booking' : '/book';
  const pageId = path.slice(1);
  const draft: SiteConfig = { ...config, bookings: defaultBookings({ currency: opts.currency, timezone: opts.timezone, whatsapp: siteWhatsapp(config) }) };
  const copy = (s: Section): Section => ({ ...structuredClone(s), id: uniqueSectionId(draft, `${pageId}-${s.type}`) });
  const wanted = preferredLayouts(config.theme).booking;
  const section = sectionSchema.parse({
    id: `${pageId}-booking`,
    type: 'booking',
    variant: wanted === 'split' ? 'split' : 'steps',
    content: { eyebrow: 'Book online', heading: 'Book an appointment', intro: 'Choose a service and a time that suits you.', category: '' },
  });
  const shared = home.sections.filter((s) => s.type === 'navbar' || s.type === 'footer' || s.type === 'whatsapp-float');
  const sections = [...shared.filter((s) => s.type === 'navbar').map(copy), section, ...shared.filter((s) => s.type !== 'navbar').map(copy)];
  let next: SiteConfig = { ...draft, pages: [...config.pages, { id: pageId, path, title: 'Book', sections }] };
  const nav = home.sections.find((s) => s.type === 'navbar');
  if (nav && nav.type === 'navbar' && !nav.content.links.some((l) => l.href === path) && nav.content.links.length < 6) {
    next = {
      ...next,
      pages: next.pages.map((p) =>
        p.id === home.id ? { ...p, sections: p.sections.map((s) => (s.id === nav.id && s.type === 'navbar' ? { ...s, content: { ...s.content, links: [...s.content.links, { label: 'Book', href: path }] } } : s)) } : p,
      ),
    };
    next = syncShared(next, nav.id);
  }
  return { config: siteConfigSchema.parse(next), pageId };
}
