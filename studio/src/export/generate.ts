import { createHash } from 'node:crypto';
import { PRESET_IDS } from '@/lib/types';
import { googleFontsHref } from '@/site/fonts';
import type { SectionType, SiteConfig, SitePage } from '@/site/schema';
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

  const used = [...new Set(config.pages.flatMap((p) => p.sections.map((s) => s.type)))].sort() as SectionType[];
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

/** All the site's content: edit config.json to change text, photos or colours. */
export const site = data as unknown as SiteConfig;

const ctx = { link: (href: string) => href, editable: false };

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
