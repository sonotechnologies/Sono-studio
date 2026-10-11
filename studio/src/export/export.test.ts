import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { KORA_KITCHEN } from '@/site/samples/kora-kitchen';
import type { SiteConfig } from '@/site/schema';
import { handoverChecklist } from './checklist';
import { exportSite } from './generate';

const site = (): SiteConfig => structuredClone(KORA_KITCHEN);
const text = (files: { path: string; data: string | Uint8Array }[], p: string) => files.find((f) => f.path === p)?.data as string;

describe('export', () => {
  it('writes a standalone project with only the sections the site uses', async () => {
    const config = site();
    // One uploaded photo, one stock photo.
    const hero = config.pages[0].sections.find((s) => s.type === 'hero')!;
    (hero.content as { image: { src: string } }).image.src = '/api/uploads/p/photo.jpg';
    const about = config.pages[0].sections.find((s) => s.type === 'about')!;
    (about.content as { image: { src: string } }).image.src = 'https://images.unsplash.com/photo-1?w=1600';
    const { files, checklist } = await exportSite({
      config,
      projectName: 'Kora Kitchen',
      version: 7,
      loadImage: async () => ({ bytes: new Uint8Array([1, 2, 3]), contentType: 'image/jpeg' }),
    });
    const paths = files.map((f) => f.path);
    expect(paths).toContain('src/app/page.tsx');
    expect(paths).toContain('src/app/menu/page.tsx');
    expect(paths).toContain('src/site/sections/hero.tsx');
    expect(paths.some((p) => p.includes('studio') || p.includes('workspace'))).toBe(false);
    const pkg = JSON.parse(text(files, 'package.json'));
    expect(pkg.name).toBe('kora-kitchen');
    expect(pkg.dependencies['@supabase/supabase-js']).toBeUndefined();
    // Photos: uploads copied in, stock linked.
    const cfg = JSON.parse(text(files, 'src/site/config.json')) as SiteConfig;
    const heroSrc = (cfg.pages[0].sections.find((s) => s.type === 'hero')!.content as { image: { src: string } }).image.src;
    expect(heroSrc).toMatch(/^\/images\/[0-9a-f]{12}\.jpg$/);
    expect(paths).toContain(`public${heroSrc}`);
    expect((cfg.pages[0].sections.find((s) => s.type === 'about')!.content as { image: { src: string } }).image.src).toContain('images.unsplash.com');
    // Registry imports exactly the used sections.
    const used = new Set(config.pages.flatMap((p) => p.sections.map((s) => s.type)));
    expect(paths.filter((p) => p.startsWith('src/site/sections/')).length).toBe(used.size);
    expect(text(files, 'src/app/globals.css')).toContain('.sono-site');
    expect(text(files, 'README.md')).toContain('Handover checklist');
    expect(checklist.find((c) => c.key === 'stock')).toBeTruthy();

    // Set SONO_EXPORT_OUT to write the project to disk and try building it.
    if (process.env.SONO_EXPORT_OUT) {
      for (const f of files) {
        const p = path.join(process.env.SONO_EXPORT_OUT, f.path);
        await mkdir(path.dirname(p), { recursive: true });
        await writeFile(p, f.data);
      }
    }
  });

  it('blanks photos it cannot copy and says so', async () => {
    const config = site();
    (config.pages[0].sections.find((s) => s.type === 'hero')!.content as { image: { src: string } }).image.src = '/api/uploads/p/gone.jpg';
    const { files, checklist } = await exportSite({ config, projectName: 'K', version: 1, loadImage: async () => null });
    const cfg = JSON.parse(text(files, 'src/site/config.json')) as SiteConfig;
    expect((cfg.pages[0].sections.find((s) => s.type === 'hero')!.content as { image: { src: string } }).image.src).toBe('');
    expect(checklist.find((c) => c.key === 'photos')!.done).toBe(false);
  });

  it('lists what to fix before handover', () => {
    const items = handoverChecklist(site());
    expect(items.find((c) => c.key === 'photos')!.done).toBe(false);
    expect(items.find((c) => c.key === 'contact')!.done).toBe(true);
  });
});
