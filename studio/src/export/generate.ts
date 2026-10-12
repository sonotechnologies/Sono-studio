import { createHash } from 'node:crypto';
import { PRESET_IDS } from '@/lib/types';
import { googleFontsHref } from '@/site/fonts';
import type { SectionType, SiteConfig, SitePage } from '@/site/schema';
import { cardProviders } from '@/site/store/payments-info';
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
  for (const type of used) add(`src/site/sections/${COMPONENTS[type].file}.tsx`, t.files[`src/site/sections/${COMPONENTS[type].file}.tsx`]);
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
    `import data from './config.json';
import { findPage, SitePageView } from './render';
import type { SiteConfig } from './schema';
${cards.length ? "import { checkoutCtx } from '@/lib/payments';\n" : ''}
/** All the site's content: edit config.json to change text, photos or colours. */
export const site = data as unknown as SiteConfig;

export const ctx = { link: (href: string) => href, editable: false${cards.length ? ', checkout: checkoutCtx(site)' : ''} };

export function SitePage({ path }: { path: string }) {
  const page = findPage(site, path);
  if (!page) return null;
  return <SitePageView config={site} page={page} ctx={ctx} className="min-h-dvh" />;
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
import { SitePage, site } from '@/site/page';

/** One page per product, built ahead of time. */
export function generateStaticParams() {
  return (site.store?.products ?? []).map((p) => ({ id: p.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const product = site.store?.products.find((p) => p.id === id);
  return product ? { title: product.name, description: product.description.slice(0, 160) } : {};
}

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!site.store?.products.some((p) => p.id === id)) notFound();
  return <SitePage path={\`/product/\${id}\`} />;
}
`,
    );
  }
  if (cards.length) addPayments(add);
  add(
    'src/app/not-found.tsx',
    `import { site } from '@/site/page';
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
function addPayments(add: (path: string, data: string) => void) {
  add(
    'src/lib/payments.ts',
    `import type { CheckoutCtx } from '@/site/primitives';
import type { PaymentProvider, SiteConfig } from '@/site/schema';
import { cardProviders } from '@/site/store/payments-info';
import type { Order } from '@/site/store/payments';

/** The business's own keys, set as environment variables where the site is hosted. */
export function secretFor(provider: PaymentProvider): string | null {
  return (provider === 'paystack' ? process.env.PAYSTACK_SECRET_KEY : process.env.STRIPE_SECRET_KEY) || null;
}

/** Card payments switched on for the shop that have a key. */
export function checkoutCtx(site: SiteConfig): CheckoutCtx | undefined {
  const providers = cardProviders(site.store).filter((p) => secretFor(p));
  if (!providers.length) return undefined;
  return { endpoint: '/api/checkout', providers, test: providers.every((p) => secretFor(p)!.startsWith('sk_test_')) };
}

/** Tells the studio about a paid order, when the site is connected to it. Safe to call twice. */
export async function reportOrder(order: Order): Promise<void> {
  const url = process.env.SONO_ORDERS_URL;
  const key = process.env.SONO_ORDERS_KEY;
  if (!url || !key) return;
  const mode = secretFor(order.provider)?.startsWith('sk_test_') ? 'test' : 'live';
  try {
    await fetch(url, {
      method: 'POST',
      headers: { authorization: \`Bearer \${key}\`, 'content-type': 'application/json' },
      body: JSON.stringify({ order, mode }),
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    // The order is still in the payment provider's dashboard.
    console.error('order not reported', err);
  }
}
`,
  );
  add(
    'src/app/api/checkout/route.ts',
    `import { secretFor } from '@/lib/payments';
import { siteKey } from '@/site/render';
import { site } from '@/site/page';
import { newReference, PaymentError, priceCart, startPayment } from '@/site/store/payments';

/** Prices the cart from the product list and returns the payment page to send the customer to. */
export async function POST(req: Request) {
  try {
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
  add(
    'src/app/order/[ref]/page.tsx',
    `import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { reportOrder, secretFor } from '@/lib/payments';
import { orderPage, siteKey, SitePageView } from '@/site/render';
import { ctx, site } from '@/site/page';
import { OrderView } from '@/site/store/order-view';
import { PaymentError, verifyPaystack, verifyStripe, type Verified } from '@/site/store/payments';

export const metadata: Metadata = { title: 'Your order', robots: { index: false } };
// Checked with the payment provider on every visit.
export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ ref: string }>; searchParams: Promise<{ session_id?: string }> };

export default async function OrderPage({ params, searchParams }: Props) {
  const { ref } = await params;
  const { session_id } = await searchParams;
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
    `import { reportOrder, secretFor } from '@/lib/payments';
import { checkPaystack, paystackSignatureOk } from '@/site/store/payments';

/** Paystack → Settings → API Keys & Webhooks → Webhook URL: https://<this site>/api/webhooks/paystack */
export async function POST(req: Request) {
  const raw = await req.text();
  const secret = secretFor('paystack');
  if (!secret || !paystackSignatureOk(raw, req.headers.get('x-paystack-signature'), secret)) return new Response(null, { status: 401 });
  const event = JSON.parse(raw) as { event?: string; data?: Parameters<typeof checkPaystack>[0] };
  if (event.event === 'charge.success' && event.data) {
    const v = checkPaystack(event.data);
    if (v.paid && v.order) await reportOrder(v.order);
  }
  return new Response(null, { status: 200 });
}
`,
  );
  add(
    'src/app/api/webhooks/stripe/route.ts',
    `import { reportOrder, secretFor } from '@/lib/payments';
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
    if (v.paid && v.order) await reportOrder(v.order);
  }
  return new Response(null, { status: 200 });
}
`,
  );
  add(
    '.env.example',
    `# Card payments: the business's own keys (Paystack and/or Stripe dashboards).
# Test keys (sk_test_...) take test payments; live keys (sk_live_...) take real ones.
PAYSTACK_SECRET_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

# Optional: report paid orders to Sono Studio (set by the studio when it deploys).
SONO_ORDERS_URL=
SONO_ORDERS_KEY=
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
