import { createHash } from 'node:crypto';
import { PRESET_IDS } from '@/lib/types';
import { googleFontsHref } from '@/site/fonts';
import type { SectionType, SiteConfig, SitePage } from '@/site/schema';
import { cardProviders, depositProviders } from '@/site/store/payments-info';
import { handoverChecklist, isStockUrl, type ChecklistItem } from './checklist';
import template from './template.generated.json';

/*
 * Turns a site config into a standalone Next.js project: the same section
 * components the studio renders with (only the ones this site uses), the
 * config as a JSON file, one route per page, and the client's own photos
 * copied in. Nothing in it depends on Sono Studio.
 */

export interface ExportFile {
  path: string;
  data: string | Uint8Array;
}

export interface ExportResult {
  files: ExportFile[];
  checklist: ChecklistItem[];
}

/** Loads a photo the site uses; null if it can't be fetched. */
export type ImageLoader = (src: string) => Promise<{ bytes: Uint8Array; contentType: string } | null>;

const COMPONENTS: Record<SectionType, { file: string; name: string }> = {
  navbar: { file: 'navbar', name: 'Navbar' },
  hero: { file: 'hero', name: 'Hero' },
  about: { file: 'about', name: 'About' },
  features: { file: 'features', name: 'Features' },
  gallery: { file: 'gallery', name: 'Gallery' },
  testimonials: { file: 'testimonials', name: 'Testimonials' },
  stats: { file: 'stats', name: 'Stats' },
  faq: { file: 'faq', name: 'Faq' },
  cta: { file: 'cta', name: 'Cta' },
  contact: { file: 'contact', name: 'Contact' },
  footer: { file: 'footer', name: 'Footer' },
  'product-grid': { file: 'product-grid', name: 'ProductGrid' },
  'product-feature': { file: 'product-feature', name: 'ProductFeature' },
  'product-detail': { file: 'product-detail', name: 'ProductDetail' },
  booking: { file: 'booking', name: 'Booking' },
  // Generated per site from its AI-written sections (see customFiles), not copied.
  custom: { file: 'custom', name: 'Custom' },
  'whatsapp-float': { file: 'whatsapp-float', name: 'WhatsappFloat' },
};

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'image/avif': 'avif' };


/** Every {src, alt} image object in a config, so photos can be copied and rewritten. */
function images(config: SiteConfig): { src: string }[] {
  const out: { src: string }[] = [];
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      if (typeof o.src === 'string' && typeof o.alt === 'string') out.push(o as { src: string });
      else Object.values(o).forEach(walk);
    }
  };
  for (const p of config.pages) for (const s of p.sections) walk(s.content);
  return out;
}

/**
 * AI-written sections become ordinary components in the exported site: one
 * file each, exactly as reviewed in the studio, and a small dispatcher. The
 * code passed the studio's check; the Vercel build is the final check.
 */
export function customFiles(config: SiteConfig): { path: string; data: string }[] {
  const used = [...new Set(config.pages.flatMap((p) => p.sections.flatMap((s) => (s.type === 'custom' ? [s.content.component] : []))))].filter(
    (c) => config.customSections?.[c],
  );
  const files = used.map((c) => {
    const def = config.customSections![c];
    const head = [
      '// @ts-nocheck',
      `// ${def.name}: written by AI in Sono Studio${def.reviewed ? ' and reviewed' : ''}.`,
      `// ${def.purpose.replace(/\s+/g, ' ')}`,
      '// Its content comes from config.json (data); edit the words there or in the admin panel.',
      '',
    ].join('\n');
    return { path: `src/site/sections/custom/${c}.tsx`, data: `${head}${def.code.trim()}\n` };
  });
  files.push({
    path: 'src/site/sections/custom.tsx',
    data: `import type { SectionOf } from '../schema';
import type { RenderCtx } from '../primitives';
${used.map((c, i) => `import Custom${i} from './custom/${c}';`).join('\n')}

type Props = { section: SectionOf<'custom'>; ctx: RenderCtx };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const COMPONENTS: Record<string, (props: { data: any }) => React.ReactNode> = {
${used.map((c, i) => `  '${c}': Custom${i},`).join('\n')}
};

/** The site's custom sections, written by AI and checked in the studio. */
export function Custom({ section }: Props) {
  const Component = COMPONENTS[section.content.component];
  return Component ? <Component data={section.content.data} /> : null;
}
`,
  });
  return files;
}

export function packageName(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50) || 'site'
  );
}

function routeFile(page: SitePage): string {
  return page.path === '/' ? 'src/app/page.tsx' : `src/app${page.path}/page.tsx`;
}

const json = (v: unknown) => `${JSON.stringify(v, null, 2)}\n`;
const str = (s: string) => JSON.stringify(s);

export async function exportSite(input: { config: SiteConfig; projectName: string; version: number; loadImage: ImageLoader }): Promise<ExportResult> {
  const config = structuredClone(input.config);
  const name = packageName(input.projectName);
  const files: ExportFile[] = [];
  const add = (path: string, data: string | Uint8Array) => files.push({ path, data });

  // Photos: the client's own are copied into public/images; stock photos stay linked.
  const copied = new Map<string, string>();
  const missing: string[] = [];
  for (const img of images(config)) {
    if (!img.src || isStockUrl(img.src)) continue;
    if (!copied.has(img.src)) {
      const got = await input.loadImage(img.src).catch(() => null);
      if (!got) {
        missing.push(img.src);
        copied.set(img.src, '');
      } else {
        const ext = EXT[got.contentType.split(';')[0].trim()] ?? 'jpg';
        const file = `${createHash('sha1').update(got.bytes).digest('hex').slice(0, 12)}.${ext}`;
        add(`public/images/${file}`, got.bytes);
        copied.set(img.src, `/images/${file}`);
      }
    }
    img.src = copied.get(img.src)!;
  }

  const store = config.store?.products.length ? config.store : null;
  // A store always has product pages, and the store sections share the grid's price and card parts.
  // Card payments need the site's own server routes and the business's keys.
  const cards = store ? cardProviders(store) : [];
  // Deposits need the same keys, plus the studio as the booking calendar.
  const deposits = depositProviders(config.bookings);
  const server = cards.length > 0 || deposits.length > 0;
  const used = [...new Set([...config.pages.flatMap((p) => p.sections.map((s) => s.type)), ...(store ? (['product-detail', 'product-grid'] as const) : [])])].sort() as SectionType[];
  const t = template as { files: Record<string, string>; css: { fonts: string; tokens: string; site: string }; versions: Record<string, string> };
  const v = t.versions;

  /* ---------- Project files ---------- */
  add(
    'package.json',
    json({
      name,
      version: `1.0.${input.version}`,
      private: true,
      scripts: { dev: 'next dev', build: 'next build', start: 'next start' },
      dependencies: { next: v.next, react: v.react, 'react-dom': v['react-dom'], 'lucide-react': v['lucide-react'], zod: v.zod },
      devDependencies: {
        '@tailwindcss/postcss': v['@tailwindcss/postcss'],
        tailwindcss: v.tailwindcss,
        typescript: v.typescript,
        '@types/node': v['@types/node'],
        '@types/react': v['@types/react'],
        '@types/react-dom': v['@types/react-dom'],
      },
    }),
  );
  add(
    'tsconfig.json',
    json({
      compilerOptions: {
        target: 'ES2022',
        lib: ['dom', 'dom.iterable', 'esnext'],
        allowJs: false,
        skipLibCheck: true,
        strict: true,
        noEmit: true,
        esModuleInterop: true,
        module: 'esnext',
        moduleResolution: 'bundler',
        resolveJsonModule: true,
        isolatedModules: true,
        jsx: 'react-jsx',
        incremental: true,
        plugins: [{ name: 'next' }],
        paths: { '@/*': ['./src/*'] },
      },
      include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts', '.next/dev/types/**/*.ts'],
      exclude: ['node_modules'],
    }),
  );
  add('next.config.ts', `import type { NextConfig } from 'next';\n\nconst nextConfig: NextConfig = {};\n\nexport default nextConfig;\n`);
  add('postcss.config.mjs', `export default { plugins: { '@tailwindcss/postcss': {} } };\n`);
  add('.gitignore', 'node_modules\n.next\n.env*.local\nnext-env.d.ts\n*.tsbuildinfo\n.vercel\n');

  /* ---------- Renderer (shared with the studio) ---------- */
  for (const f of ['src/site/primitives.tsx', 'src/site/render.tsx', 'src/site/theme.ts', 'src/site/schema.ts', 'src/lib/presets.ts', 'src/lib/presets.json']) add(f, t.files[f]);
  // The cart is part of the renderer (it shows only when the site has products).
  for (const [f, data] of Object.entries(t.files)) if (f.startsWith('src/site/store/')) add(f, data);
  for (const type of used) if (type !== 'custom') add(`src/site/sections/${COMPONENTS[type].file}.tsx`, t.files[`src/site/sections/${COMPONENTS[type].file}.tsx`]);
  if (used.includes('custom')) for (const f of customFiles(config)) add(f.path, f.data);
  add(
    'src/lib/types.ts',
    `export const PRESET_IDS = ${JSON.stringify(PRESET_IDS)} as const;\nexport type PresetId = (typeof PRESET_IDS)[number];\n`,
  );
  add(
    'src/site/registry.tsx',
    `import type { RenderCtx } from './primitives';
import type { Section } from './schema';
${used.map((type) => `import { ${COMPONENTS[type].name} } from './sections/${COMPONENTS[type].file}';`).join('\n')}

/** The sections this site uses. */
export function renderSection(section: Section, ctx: RenderCtx): React.ReactNode {
  switch (section.type) {
${used.map((type) => `    case '${type}':\n      return <${COMPONENTS[type].name} section={section} ctx={ctx} />;`).join('\n')}
    default:
      return null;
  }
}
`,
  );
  add('src/site/config.json', json(config));
  add(
    'src/site/page.tsx',
    `import { notFound } from 'next/navigation';
import data from './config.json';
import type { RenderCtx } from './primitives';
import { findPage, SitePageView } from './render';
import { siteConfigSchema, type SiteConfig } from './schema';
${server ? `import { ${[cards.length && 'checkoutCtx', deposits.length && 'bookingCtx'].filter(Boolean).join(', ')} } from '@/lib/payments';\n` : ''}
/** The site's content as built. Edit config.json to change text, photos or colours. */
export const builtSite = data as unknown as SiteConfig;
/** The Sono Studio version it was built from. */
const BUILT_VERSION = ${input.version};

/**
 * The site's content: the version published from Sono Studio when it's
 * connected (SONO_SITE_API), so the owner's edits in the admin panel go live
 * without a rebuild, checked at most once a minute. Otherwise, or if the
 * studio can't be reached, the built-in copy.
 */
export async function loadSite(): Promise<SiteConfig> {
  const api = process.env.SONO_SITE_API;
  if (!api) return builtSite;
  try {
    const res = await fetch(\`\${api}/config\`, { next: { revalidate: 60 }, signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const body = (await res.json()) as { config?: unknown; version?: number | null };
      // Built from a newer version than the studio has marked as published yet: the built copy is the newer one.
      if (typeof body.version === 'number' && body.version < BUILT_VERSION) return builtSite;
      const parsed = siteConfigSchema.safeParse(body.config);
      if (parsed.success) return parsed.data;
    }
  } catch {}
  return builtSite;
}

export function ctxFor(site: SiteConfig): RenderCtx {
  return { link: (href: string) => href, editable: false${cards.length ? ', checkout: checkoutCtx(site)' : ''}${deposits.length ? ', booking: bookingCtx(site)' : ''} };
}

export async function SitePage({ path }: { path: string }) {
  const site = await loadSite();
  const page = findPage(site, path);
  if (!page) notFound();
  return <SitePageView config={site} page={page} ctx={ctxFor(site)} className="min-h-dvh" />;
}
`,
  );

  /* ---------- App routes ---------- */
  const { meta, theme } = config;
  add(
    'src/app/layout.tsx',
    `import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: { default: ${str(meta.businessName)}, template: ${str(`%s · ${meta.businessName}`)} },
  description: ${str(meta.description)},
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang=${str(meta.language)}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href=${str(googleFontsHref([theme.fonts.heading, theme.fonts.body]))} />
      </head>
      <body>{children}</body>
    </html>
  );
}
`,
  );
  add(
    'src/app/globals.css',
    `@import 'tailwindcss';

:root {
  --font-space-grotesk: 'Space Grotesk', system-ui, sans-serif;
  ${t.css.fonts}
}

@theme inline {
  --color-*: initial;
  --color-transparent: transparent;
  --color-current: currentColor;
  --color-white: #ffffff;
  --color-black: #000000;
  ${t.css.tokens}
}

body {
  margin: 0;
  background: ${theme.colors.background};
}

${t.css.site}
`,
  );
  for (const page of config.pages) {
    add(
      routeFile(page),
      `import type { Metadata } from 'next';
import { SitePage } from '@/site/page';

export const metadata: Metadata = ${page.path === '/' ? '{}' : `{ title: ${str(page.title)} }`};
// Picks up published edits within a minute.
export const revalidate = 60;

export default function Page() {
  return <SitePage path=${str(page.path)} />;
}
`,
    );
  }
  if (store) {
    add(
      'src/app/product/[id]/page.tsx',
      `import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SitePage, builtSite, loadSite } from '@/site/page';

// Products added later are rendered when first visited; all pick up published edits within a minute.
export const revalidate = 60;

/** One page per product, built ahead of time. */
export function generateStaticParams() {
  return (builtSite.store?.products ?? []).map((p) => ({ id: p.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const product = (await loadSite()).store?.products.find((p) => p.id === id);
  return product ? { title: product.name, description: product.description.slice(0, 160) } : {};
}

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await loadSite()).store?.products.some((p) => p.id === id)) notFound();
  return <SitePage path={\`/product/\${id}\`} />;
}
`,
    );
  }
  if (server) addPayments(add, { cards: cards.length > 0, deposits: deposits.length > 0 });
  add(
    'src/app/not-found.tsx',
    `import { builtSite as site } from '@/site/page';
import { themeStyle } from '@/site/theme';

export default function NotFound() {
  return (
    <main className="sono-site flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center" style={themeStyle(site.theme)}>
      <h1 className="s-heading s-h2">Page not found</h1>
      <a href="/" className="underline underline-offset-4">
        Back to ${meta.businessName.replace(/[{}<>]/g, '')}
      </a>
    </main>
  );
}
`,
  );

  const checklist = handoverChecklist(input.config, { missingImages: missing.length });
  add('README.md', readme(input.projectName, config, checklist));
  return { files, checklist };
}

/**
 * Card checkout for a live site: the business's own Paystack or Stripe keys
 * (environment variables), a checkout route, the order page and webhooks.
 * Nothing is stored on the site; paid orders are reported to the studio when
 * it's connected, and are always in the payment provider's dashboard.
 */
function addPayments(add: (path: string, data: string) => void, has: { cards: boolean; deposits: boolean }) {
  add(
    'src/lib/payments.ts',
    `import type { BookingCtx, CheckoutCtx } from '@/site/primitives';
import type { PaymentProvider, SiteConfig } from '@/site/schema';
import { cardProviders, depositProviders } from '@/site/store/payments-info';
import type { Order } from '@/site/store/payments';
import type { Busy } from '@/site/store/booking-slots';

/** The business's own keys, set as environment variables where the site is hosted. */
export function secretFor(provider: PaymentProvider): string | null {
  return (provider === 'paystack' ? process.env.PAYSTACK_SECRET_KEY : process.env.STRIPE_SECRET_KEY) || null;
}

/** Test keys: Paystack and Stripe secret keys, and Stripe restricted keys. */
const isTestKey = (key: string | null | undefined) => !!key && /^(sk|rk)_test_/.test(key);

/** Card payments switched on for the shop that have a key. */
export function checkoutCtx(site: SiteConfig): CheckoutCtx | undefined {
  const providers = cardProviders(site.store).filter((p) => secretFor(p));
  if (!providers.length) return undefined;
  return { endpoint: '/api/checkout', providers, test: providers.every((p) => isTestKey(secretFor(p))) };
}

/** Deposits switched on for bookings that have a key, when the studio keeps the booking calendar. */
export function bookingCtx(site: SiteConfig): BookingCtx | undefined {
  if (!process.env.SONO_SITE_API || !process.env.SONO_ORDERS_KEY) return undefined;
  const providers = depositProviders(site.bookings).filter((p) => secretFor(p));
  if (!providers.length) return undefined;
  return { busyEndpoint: '/api/busy', bookEndpoint: '/api/book', providers, test: providers.every((p) => isTestKey(secretFor(p))) };
}

/** The studio's booking calendar for this site. */
function studio(path: string, init?: RequestInit) {
  return fetch(\`\${process.env.SONO_SITE_API}\${path}\`, {
    ...init,
    headers: { authorization: \`Bearer \${process.env.SONO_ORDERS_KEY}\`, 'content-type': 'application/json', ...init?.headers },
    signal: AbortSignal.timeout(10000),
    cache: 'no-store',
  });
}

/** Times already booked between two moments. */
export async function busyTimes(from: string, to: string): Promise<Busy[]> {
  const res = await studio(\`/busy?from=\${encodeURIComponent(from)}&to=\${encodeURIComponent(to)}\`);
  if (!res.ok) throw new Error('booking calendar unavailable');
  return ((await res.json()) as { busy: Busy[] }).busy;
}

/** Holds a time while the deposit is paid: 'taken' if someone got there first. */
export async function holdBooking(hold: Record<string, unknown>, provider: PaymentProvider): Promise<'ok' | 'taken'> {
  const mode = isTestKey(secretFor(provider)) ? 'test' : 'live';
  const res = await studio('/bookings', { method: 'POST', body: JSON.stringify({ action: 'hold', mode, hold }) });
  if (res.status === 409) return 'taken';
  if (!res.ok) throw new Error(\`booking calendar refused the booking (\${res.status})\`);
  return 'ok';
}

/** Confirms a booking once its deposit is paid. Safe to call twice. */
export async function confirmBooking(reference: string): Promise<void> {
  // Tried twice: a deposit that isn't confirmed lets its time go to someone else.
  for (let tries = 0; tries < 2; tries++) {
    try {
      const res = await studio('/bookings', { method: 'POST', body: JSON.stringify({ action: 'confirm', reference }) });
      if (res.ok) return;
      console.error('booking not confirmed', res.status);
    } catch (err) {
      console.error('booking not confirmed', err);
    }
  }
}

/** Tells the studio about a paid order or deposit. */
export async function recordPaid(order: Order): Promise<void> {
  if (order.booking) await confirmBooking(order.reference);
  else await reportOrder(order);
}

/** Tells the studio about a paid order, when the site is connected to it. Safe to call twice. */
export async function reportOrder(order: Order): Promise<void> {
  const url = process.env.SONO_ORDERS_URL;
  const key = process.env.SONO_ORDERS_KEY;
  if (!url || !key) return;
  const mode = isTestKey(secretFor(order.provider)) ? 'test' : 'live';
  // Tried twice; if it still fails, the order is in the payment provider's dashboard.
  for (let tries = 0; tries < 2; tries++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { authorization: \`Bearer \${key}\`, 'content-type': 'application/json' },
        body: JSON.stringify({ order, mode }),
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) return;
      console.error('order not reported', res.status);
    } catch (err) {
      console.error('order not reported', err);
    }
  }
}
`,
  );
  if (has.cards)
  add(
    'src/app/api/checkout/route.ts',
    `import { secretFor } from '@/lib/payments';
import { siteKey } from '@/site/render';
import { loadSite } from '@/site/page';
import { newReference, PaymentError, priceCart, startPayment } from '@/site/store/payments';

/** Prices the cart from the product list (as published) and returns the payment page to send the customer to. */
export async function POST(req: Request) {
  try {
    const site = await loadSite();
    if (!site.store) throw new PaymentError('This site has no shop.');
    const priced = priceCart(site.store, await req.json().catch(() => null));
    const secret = secretFor(priced.provider);
    if (!secret) throw new PaymentError('Card payments aren’t set up yet.');
    const order = { ...priced, reference: newReference(siteKey(site)) };
    const origin = new URL(req.url).origin;
    const shop = site.pages.find((p) => p.sections.some((s) => s.type === 'product-grid'))?.path ?? '/';
    const url = await startPayment({ secret, order, returnUrl: \`\${origin}/order/\${order.reference}\`, cancelUrl: \`\${origin}\${shop}\` });
    return Response.json({ url });
  } catch (err) {
    if (err instanceof PaymentError) return Response.json({ error: err.message }, { status: 400 });
    console.error('checkout failed', err);
    return Response.json({ error: 'The payment couldn’t start. Try again in a moment.' }, { status: 500 });
  }
}
`,
  );
  if (has.cards)
  add(
    'src/app/order/[ref]/page.tsx',
    `import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { reportOrder, secretFor } from '@/lib/payments';
import { orderPage, siteKey, SitePageView } from '@/site/render';
import { ctxFor, loadSite } from '@/site/page';
import { OrderView } from '@/site/store/order-view';
import { orderFitsStore, PaymentError, verifyPaystack, verifyStripe, type Verified } from '@/site/store/payments';

export const metadata: Metadata = { title: 'Your order', robots: { index: false } };
// Checked with the payment provider on every visit.
export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ ref: string }>; searchParams: Promise<{ session_id?: string }> };

export default async function OrderPage({ params, searchParams }: Props) {
  const { ref } = await params;
  const { session_id } = await searchParams;
  const site = await loadSite();
  const ctx = ctxFor(site);
  if (!site.store || !/^[a-z0-9-]{6,80}$/.test(ref)) notFound();
  let verified: Verified | null = null;
  let error: string | undefined;
  try {
    const provider = session_id ? 'stripe' : 'paystack';
    const secret = secretFor(provider);
    if (!secret) throw new PaymentError('Card payments aren’t set up.');
    verified = provider === 'stripe' ? await verifyStripe({ secret, sessionId: session_id! }) : await verifyPaystack({ secret, reference: ref });
    if (verified.order?.reference !== ref) {
      verified = null;
      error = 'This order wasn’t found.';
    } else if (verified.paid && !orderFitsStore(site.store, verified.order)) {
      // Paid, but not what the shop charges for these items: never counted as an order.
      verified = { ...verified, paid: false, reason: 'The amount paid doesn’t match this order' };
    } else if (verified.paid) await reportOrder(verified.order);
  } catch (err) {
    error = err instanceof PaymentError ? err.message : 'The payment couldn’t be checked right now.';
  }
  const test = !!ctx.checkout?.test;
  return (
    <SitePageView
      config={site}
      page={orderPage(site)}
      ctx={ctx}
      className="min-h-dvh"
      insert={<OrderView config={site} reference={ref} verified={verified} error={error} ctx={ctx} siteKey={siteKey(site)} test={test} />}
    />
  );
}
`,
  );
  add(
    'src/app/api/webhooks/paystack/route.ts',
    `import { recordPaid, secretFor } from '@/lib/payments';
import { loadSite } from '@/site/page';
import { checkPaystack, orderFitsStore, paystackSignatureOk } from '@/site/store/payments';

/** Paystack → Settings → API Keys & Webhooks → Webhook URL: https://<this site>/api/webhooks/paystack */
export async function POST(req: Request) {
  const raw = await req.text();
  const secret = secretFor('paystack');
  if (!secret || !paystackSignatureOk(raw, req.headers.get('x-paystack-signature'), secret)) return new Response(null, { status: 401 });
  const event = JSON.parse(raw) as { event?: string; data?: Parameters<typeof checkPaystack>[0] };
  if (event.event === 'charge.success' && event.data) {
    const v = checkPaystack(event.data);
    // An order's lines travel with the payment, so they're priced again before it counts.
    if (v.paid && v.order && (v.order.booking || orderFitsStore((await loadSite()).store, v.order))) await recordPaid(v.order);
  }
  return new Response(null, { status: 200 });
}
`,
  );
  add(
    'src/app/api/webhooks/stripe/route.ts',
    `import { recordPaid, secretFor } from '@/lib/payments';
import { stripeSignatureOk, verifyStripe } from '@/site/store/payments';

/** Stripe → Developers → Webhooks: https://<this site>/api/webhooks/stripe, event checkout.session.completed. */
export async function POST(req: Request) {
  const raw = await req.text();
  const signing = process.env.STRIPE_WEBHOOK_SECRET;
  const secret = secretFor('stripe');
  if (!signing || !secret || !stripeSignatureOk(raw, req.headers.get('stripe-signature'), signing)) return new Response(null, { status: 401 });
  const event = JSON.parse(raw) as { type?: string; data?: { object?: { id?: string } } };
  const id = event.data?.object?.id;
  if (id && (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded')) {
    // Read back from Stripe before counting it as paid.
    const v = await verifyStripe({ secret, sessionId: id });
    if (v.paid && v.order) await recordPaid(v.order);
  }
  return new Response(null, { status: 200 });
}
`,
  );
  if (has.deposits) {
    add(
      'src/app/api/busy/route.ts',
      `import { busyTimes } from '@/lib/payments';

/** Times already booked, from the studio's booking calendar. Never who booked them. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const from = Date.parse(q.get('from') ?? '');
  const to = Date.parse(q.get('to') ?? '');
  if (Number.isNaN(from) || Number.isNaN(to) || to <= from || to - from > 15 * 86400000) return Response.json({ busy: [] }, { status: 400 });
  try {
    return Response.json({ busy: await busyTimes(new Date(from).toISOString(), new Date(to).toISOString()) }, { headers: { 'cache-control': 'no-store' } });
  } catch {
    return Response.json({ busy: [] }, { status: 503 });
  }
}
`,
    );
    add(
      'src/app/api/book/route.ts',
      `import { busyTimes, holdBooking, secretFor } from '@/lib/payments';
import { siteKey } from '@/site/render';
import { loadSite } from '@/site/page';
import { newReference, PaymentError, priceBooking, startPayment } from '@/site/store/payments';

/** Checks the time is still free, holds it, and returns the deposit's payment page. */
export async function POST(req: Request) {
  try {
    const site = await loadSite();
    const b = site.bookings;
    if (!b) throw new PaymentError('Booking isn’t available here.');
    const body = await req.json().catch(() => null);
    const start = Date.parse(String(body?.start ?? ''));
    if (Number.isNaN(start)) throw new PaymentError('Choose a time.');
    const busy = await busyTimes(new Date(start - 86400000).toISOString(), new Date(start + 2 * 86400000).toISOString());
    const { order: priced, slot, service } = priceBooking(b, body, busy);
    const secret = secretFor(priced.provider);
    if (!secret) throw new PaymentError('Deposits aren’t set up yet.');
    const order = { ...priced, reference: newReference(siteKey(site)) };
    const held = await holdBooking(
      { reference: order.reference, serviceId: service.id, serviceName: service.name, start: slot.start, end: slot.end, capacity: b.capacity, provider: priced.provider, currency: b.currency, deposit: priced.total, price: service.price, customer: priced.customer },
      priced.provider,
    );
    if (held === 'taken') throw new PaymentError('Someone has just booked that time. Choose another.');
    const origin = new URL(req.url).origin;
    const bookPath = site.pages.find((p) => p.sections.some((s) => s.type === 'booking'))?.path ?? '/';
    const url = await startPayment({ secret, order, returnUrl: \`\${origin}/booking/\${order.reference}\`, cancelUrl: \`\${origin}\${bookPath}\` });
    return Response.json({ url });
  } catch (err) {
    if (err instanceof PaymentError) return Response.json({ error: err.message }, { status: 400 });
    console.error('booking failed', err);
    return Response.json({ error: 'The booking couldn’t start. Try again in a moment.' }, { status: 500 });
  }
}
`,
    );
    add(
      'src/app/booking/[ref]/page.tsx',
      `import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { confirmBooking, secretFor } from '@/lib/payments';
import { orderPage, SitePageView } from '@/site/render';
import { ctxFor, loadSite } from '@/site/page';
import { BookingView } from '@/site/store/booking-view';
import { PaymentError, verifyPaystack, verifyStripe, type Verified } from '@/site/store/payments';

export const metadata: Metadata = { title: 'Your booking', robots: { index: false } };
// Checked with the payment provider on every visit.
export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ ref: string }>; searchParams: Promise<{ session_id?: string }> };

export default async function BookingPage({ params, searchParams }: Props) {
  const { ref } = await params;
  const { session_id } = await searchParams;
  const site = await loadSite();
  const ctx = ctxFor(site);
  if (!site.bookings || !/^[a-z0-9-]{6,80}$/.test(ref)) notFound();
  let verified: Verified | null = null;
  let error: string | undefined;
  try {
    const provider = session_id ? 'stripe' : 'paystack';
    const secret = secretFor(provider);
    if (!secret) throw new PaymentError('Deposits aren’t set up.');
    verified = provider === 'stripe' ? await verifyStripe({ secret, sessionId: session_id! }) : await verifyPaystack({ secret, reference: ref });
    if (verified.order?.reference !== ref || !verified.order.booking) {
      verified = null;
      error = 'This booking wasn’t found.';
    } else if (verified.paid) await confirmBooking(ref);
  } catch (err) {
    error = err instanceof PaymentError ? err.message : 'The deposit couldn’t be checked right now.';
  }
  return (
    <SitePageView
      config={site}
      page={orderPage(site)}
      ctx={ctx}
      className="min-h-dvh"
      insert={<BookingView config={site} reference={ref} verified={verified} error={error} ctx={ctx} test={!!ctx.booking?.test} />}
    />
  );
}
`,
    );
  }
  add(
    '.env.example',
    `# Card payments: the business's own keys (Paystack and/or Stripe dashboards).
# Test keys (sk_test_...) take test payments; live keys (sk_live_...) take real ones.
PAYSTACK_SECRET_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

# Set by Sono Studio when it deploys: paid orders are reported to it, and it
# keeps the booking calendar (needed for booking deposits).
SONO_ORDERS_URL=
SONO_ORDERS_KEY=
SONO_SITE_API=
`,
  );
}

function readme(projectName: string, config: SiteConfig, checklist: ChecklistItem[]): string {
  return `# ${projectName}

Website for ${config.meta.businessName}, built with Next.js and Tailwind CSS.

## Run it

\`\`\`bash
npm install
npm run dev     # http://localhost:3000
npm run build   # production build
\`\`\`

Deploy anywhere that runs Next.js (Vercel, Netlify, Cloudflare Pages). No environment variables are needed.

## Change the content

All text, links, photos and colours are in \`src/site/config.json\`. Pages and their sections are listed in order; each section has a \`type\`, a layout \`variant\` and its \`content\`. Photos the business supplied are in \`public/images\`.

## Handover checklist

${checklist.map((c) => `- [${c.done ? 'x' : ' '}] **${c.title}.** ${c.detail}`).join('\n')}
`;
}
