import type { SiteConfig } from '@/site/schema';

/*
 * What a client may change in the admin panel: the words and photos in each
 * section, their products, services, opening hours and contact number. The
 * design stays yours: theme, pages, which sections there are, their layouts
 * and order, the code of AI-written sections, and the payment and deposit
 * settings.
 */

/** The config with everything a client may edit blanked out; two configs that match here differ only in client-editable parts. */
function frame(c: SiteConfig): unknown {
  return {
    ...c,
    meta: c.meta,
    pages: c.pages.map((p) => ({ ...p, sections: p.sections.map((s) => ({ ...s, content: s.type === 'custom' ? { component: s.content.component } : null })) })),
    ...(c.store ? { store: { ...c.store, products: null, whatsapp: null } } : {}),
    ...(c.bookings
      ? { bookings: { ...c.bookings, services: null, hours: null, closed: null, whatsapp: null, step: null, capacity: null, notice: null, daysAhead: null } }
      : {}),
  };
}

/** Null when the change is one a client may make, otherwise what they tried to change. */
export function adminChangeProblem(before: SiteConfig, after: SiteConfig): string | null {
  if (JSON.stringify(frame(before)) === JSON.stringify(frame(after))) return null;
  if (JSON.stringify(before.theme) !== JSON.stringify(after.theme)) return 'the design';
  if (before.pages.length !== after.pages.length || before.pages.some((p, i) => p.id !== after.pages[i].id || p.path !== after.pages[i].path || p.title !== after.pages[i].title))
    return 'the pages';
  if (JSON.stringify(before.store?.payments) !== JSON.stringify(after.store?.payments) || JSON.stringify(before.bookings?.payments) !== JSON.stringify(after.bookings?.payments))
    return 'the payment settings';
  if (before.bookings?.depositPercent !== after.bookings?.depositPercent) return 'the deposit';
  if (JSON.stringify(before.customSections) !== JSON.stringify(after.customSections)) return 'a custom section’s code';
  return 'the layout';
}
