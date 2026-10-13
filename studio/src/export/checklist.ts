import type { SiteConfig } from '@/site/schema';
import { cardProviders, depositProviders } from '@/site/store/payments-info';

/*
 * What to sort out before a client's site goes live. Built from the config,
 * so it reflects the actual site: placeholder photos, sample reviews,
 * missing contact details, plus the hosting and domain steps.
 */

/** Unsplash and Pexels ask for their images to be linked, not copied. */
export function isStockUrl(src: string): boolean {
  return /^https:\/\/(images\.unsplash\.com|images\.pexels\.com)\//.test(src);
}

export interface ChecklistItem {
  key: string;
  title: string;
  detail: string;
  done: boolean;
  /** Blocking-ish items are shown first and in warning colour. */
  important?: boolean;
}

function walkImages(config: SiteConfig): { src: string }[] {
  const out: { src: string }[] = [];
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      if (typeof o.src === 'string' && typeof o.alt === 'string') out.push(o as { src: string });
      else Object.values(o).forEach(walk);
    }
  };
  for (const p of config.pages) for (const s of p.sections) if (!s.hidden) walk(s.content);
  return out;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function handoverChecklist(config: SiteConfig, opts: { missingImages?: number } = {}): ChecklistItem[] {
  const visible = config.pages.flatMap((p) => p.sections.filter((s) => !s.hidden));
  const imgs = walkImages(config);
  const placeholders = imgs.filter((i) => !i.src).length + (opts.missingImages ?? 0);
  const stock = imgs.filter((i) => isStockUrl(i.src)).length;
  const samples = visible
    .filter((s) => s.type === 'testimonials')
    .flatMap((s) => (s.type === 'testimonials' ? s.content.items : []))
    .filter((t) => /sample review/i.test(t.detail ?? '') || /customer name/i.test(t.name)).length;
  const contact = visible.find((s) => s.type === 'contact');
  const reachable = visible.some(
    (s) => (s.type === 'contact' && (s.content.phone || s.content.whatsapp || s.content.email)) || (s.type === 'whatsapp-float' && s.content.number),
  );

  const products = config.store?.products ?? [];
  const sampleProducts = products.filter((p) => p.sample).length;
  const unpriced = products.filter((p) => !p.sample && p.price === 0).length;
  const unphotographed = products.filter((p) => !p.image.src).length;
  const orderTo = (config.store?.whatsapp ?? '').replace(/[^0-9]/g, '');

  const customs = [...new Set(visible.flatMap((s) => (s.type === 'custom' ? [s.content.component] : [])))].map((c) => config.customSections?.[c]).filter((d) => !!d);
  const unreviewed = customs.filter((d) => !d.reviewed);

  const items: ChecklistItem[] = [
    {
      key: 'photos',
      title: 'Photos',
      done: placeholders === 0,
      important: placeholders > 0,
      detail: placeholders ? `${plural(placeholders, 'photo')} still show a placeholder. Add the client’s photos or stock photos before going live.` : 'Every photo slot has a photo.',
    },
    {
      key: 'reviews',
      title: 'Reviews',
      done: samples === 0,
      important: samples > 0,
      detail: samples ? `${plural(samples, 'sample review')} written as placeholders. Replace them with real reviews from the client, or remove the section.` : 'No sample reviews on the site.',
    },
    {
      key: 'contact',
      title: 'Contact details',
      done: reachable && (!contact || !!contact.content.address || !contact.content.mapQuery),
      important: !reachable,
      detail: reachable ? 'Check the phone, WhatsApp number, address and opening hours with the client.' : 'There is no phone, WhatsApp or email on the site. Add at least one way to reach the business.',
    },
    {
      key: 'domain',
      title: 'Domain',
      done: false,
      detail: 'Connect the client’s domain in Vercel → the project → Settings → Domains, then update their DNS records.',
    },
    {
      key: 'hosting',
      title: 'Hosting account',
      done: false,
      detail: 'Vercel’s free Hobby plan is for non-commercial use. For a paying client, transfer the project to their own Vercel account or use a paid plan.',
    },
  ];
  if (customs.length)
    items.push({
      key: 'custom-code',
      title: 'Custom sections',
      done: unreviewed.length === 0,
      important: unreviewed.length > 0,
      detail: unreviewed.length
        ? `${plural(unreviewed.length, 'section')} written by AI (${unreviewed.map((d) => d.name).join(', ')}) ${unreviewed.length === 1 ? 'hasn’t' : 'haven’t'} been reviewed. Open each in the Edit tab, read the code under “Code details” and tick “I’ve read the code”.`
        : 'Every AI-written section has been reviewed.',
    });
  const cards = [...new Set([...cardProviders(config.store), ...depositProviders(config.bookings)])];
  const names = cards.map((p) => (p === 'paystack' ? 'Paystack' : 'Stripe'));
  items.push(
    cards.length
      ? {
          key: 'env',
          title: 'Card payments',
          done: false,
          important: true,
          detail: `Paid into the client’s own ${names.join(' and ')} account. When you deploy, paste their secret key${cards.length > 1 ? 's' : ''} into the Deploy dialog (or add ${cards.map((p) => (p === 'paystack' ? 'PAYSTACK_SECRET_KEY' : 'STRIPE_SECRET_KEY')).join(' and ')} in Vercel). Then set the webhook in their dashboard: ${cards.map((p) => `<site address>/api/webhooks/${p}`).join(' and ')}${cards.includes('stripe') ? ' (Stripe: event checkout.session.completed, then add its signing secret as STRIPE_WEBHOOK_SECRET)' : ''}. Make one small real payment to test before launch.`,
        }
      : { key: 'env', title: 'Environment variables', done: true, detail: 'None needed: this site has no database, payments or forms.' },
  );
  if (config.store) {
    const problems = [
      sampleProducts && `${plural(sampleProducts, 'sample product')} to replace with real ones`,
      unpriced && `${plural(unpriced, 'product')} without a price`,
      unphotographed && `${plural(unphotographed, 'product')} without a photo`,
    ].filter(Boolean);
    items.splice(
      0,
      0,
      {
        key: 'products',
        title: 'Products',
        done: problems.length === 0,
        important: sampleProducts > 0 || unpriced > 0,
        detail: problems.length ? `${problems.join('; ')}. Edit them in the workspace’s Products tab.` : `${plural(products.length, 'product')}, each with a price and photo. Check them with the client.`,
      },
      {
        key: 'orders',
        title: 'Orders',
        done: orderTo.length >= 8,
        important: orderTo.length < 8,
        detail:
          orderTo.length >= 8
            ? `Cart orders go to WhatsApp ${config.store.whatsapp}. Send a test order before launch.`
            : 'There’s no WhatsApp number for orders, so the cart can’t send them. Add one in the Products tab.',
      },
    );
  }
  const b = config.bookings;
  if (b) {
    const sampleServices = b.services.filter((x) => x.sample).length;
    const canBook = (b.payments.whatsapp && b.whatsapp.replace(/[^0-9]/g, '').length >= 8) || depositProviders(b).length > 0;
    const problems = [
      sampleServices && `${plural(sampleServices, 'sample service')} to replace`,
      !b.services.length && 'no services yet',
      !b.hours.length && 'no opening hours',
      !canBook && 'no way to book (add a WhatsApp number or a deposit)',
    ].filter(Boolean);
    items.splice(0, 0, {
      key: 'bookings',
      title: 'Bookings',
      done: problems.length === 0,
      important: problems.length > 0,
      detail: problems.length
        ? `${problems.join('; ')}. Fix them in the workspace’s Bookings tab.`
        : `${plural(b.services.length, 'service')}, open ${b.hours.length} span${b.hours.length === 1 ? '' : 's'} a week in ${b.timezone.replace(/_/g, ' ')}. Check the services, hours and deposit with the client.`,
    });
  }
  if (stock) {
    items.splice(1, 0, {
      key: 'stock',
      title: 'Stock photo credits',
      done: false,
      detail: `${plural(stock, 'photo')} from Unsplash or Pexels. They are free to use; crediting the photographers on the site is appreciated.`,
    });
  }
  return items;
}
