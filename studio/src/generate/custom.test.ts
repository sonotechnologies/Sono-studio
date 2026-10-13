import { describe, expect, it } from 'vitest';
import { demoClient } from '@/ai/demo';
import { handoverChecklist } from '@/export/checklist';
import { exportSite } from '@/export/generate';
import { timelineDef } from '@/site/custom/samples';
import { KORA_KITCHEN } from '@/site/samples/kora-kitchen';
import { siteConfigSchema, type SiteConfig } from '@/site/schema';
import { adminChangeProblem } from '@/workspace/admin-guard';
import { addCustomSection, duplicateSection, removeSection, replaceCustom, setCustomReviewed, setField } from '@/workspace/model';
import type { Brief, GenerationJob } from './brief';
import { advance } from './pipeline';

const brief: Brief = {
  businessName: 'Kora Kitchen',
  businessType: 'Restaurant',
  preset: 'warm-table',
  pages: ['home', 'contact'],
  paste: '',
  client: { ownerName: 'Kora', whatsapp: '+234 803 000 0000', instagram: '', address: 'Lekki' },
  brandColors: [],
  useBrand: false,
};

const timelineData = { eyebrow: 'Since 2014', heading: 'Our story', moments: [{ year: '2014', title: 'First stall', text: 'Saturday market' }] };

/** Kora Kitchen without its seeded custom section, so each test adds its own. */
function plainSite(): SiteConfig {
  const site = structuredClone(KORA_KITCHEN);
  for (const p of site.pages) p.sections = p.sections.filter((s) => s.type !== 'custom');
  delete site.customSections;
  return site;
}

describe('custom sections in generation', () => {
  it('writes a planned custom section and places it on its page', async () => {
    let saved: SiteConfig | null = null;
    let job: GenerationJob = { id: 'j', projectId: 'p', status: 'running', brief, extracted: null, plan: null, filled: {}, imagesDone: false, steps: [], error: null, createdAt: '', updatedAt: '' };
    const deps = { providers: [demoClient()], stock: null, assets: [], saveVersion: async (c: SiteConfig) => ((saved = c), 1), recordStock: async () => {} };
    for (let i = 0; i < 4 && !job.plan; i++) job = { ...(await advance(job, deps)).job, status: 'running' };
    expect(job.plan).toBeTruthy();
    job.plan!.pages[0].sections.splice(2, 0, { id: 'home-story', type: 'custom', variant: 'default', note: 'A timeline of our story, year by year' });
    for (let i = 0; i < 15 && job.status === 'running'; i++) job = (await advance(job, deps)).job;
    expect(job.status).toBe('done');
    const site = siteConfigSchema.parse(saved);
    const section = site.pages[0].sections.find((s) => s.id === 'home-story');
    expect(section?.type).toBe('custom');
    const def = site.customSections![section!.type === 'custom' ? section!.content.component : ''];
    expect(def).toMatchObject({ reviewed: false });
    expect(def.js).toContain('return Section');
  }, 20_000);
});

describe('custom sections in the workspace', () => {
  it('adds, copies, changes and removes them, keeping definitions tidy', () => {
    const site = plainSite();
    const added = addCustomSection(site, 'home', 2, timelineDef(), timelineData);
    expect(siteConfigSchema.safeParse(added.config).success).toBe(true);
    const copy = duplicateSection(added.config, added.id);
    expect(Object.keys(copy.config.customSections!)).toHaveLength(2); // the copy has its own component
    const changed = replaceCustom(copy.config, copy.id, { ...timelineDef(), name: 'Milestones', reviewed: true }, timelineData);
    expect(Object.values(changed.customSections!).map((d) => [d.name, d.reviewed])).toEqual([
      ['Timeline', false],
      ['Milestones', false], // new code needs a fresh review
    ]);
    expect(() => setField(changed, added.id, 'data', { heading: 1 })).toThrow(); // content must fit the fields
    const gone = removeSection(removeSection(changed, copy.id), added.id);
    expect(gone.customSections).toBeUndefined();
  });

  it('flags unreviewed code in the handover checklist', () => {
    const { config } = addCustomSection(plainSite(), 'home', 2, timelineDef(), timelineData);
    const item = () => handoverChecklist(config).find((i) => i.key === 'custom-code')!;
    expect(item()).toMatchObject({ done: false, important: true });
    expect(item().detail).toContain('Timeline');
    const component = Object.keys(config.customSections!)[0];
    expect(handoverChecklist(setCustomReviewed(config, component, true)).find((i) => i.key === 'custom-code')).toMatchObject({ done: true });
    expect(handoverChecklist(plainSite()).find((i) => i.key === 'custom-code')).toBeUndefined();
  });

  it('lets a client change the words but not the code', () => {
    const { config, id } = addCustomSection(plainSite(), 'home', 2, timelineDef(), timelineData);
    expect(adminChangeProblem(config, setField(config, id, 'data', { ...timelineData, heading: 'Since 2014' }))).toBeNull();
    const component = Object.keys(config.customSections!)[0];
    const code = structuredClone(config);
    code.customSections![component].code += '\n';
    expect(adminChangeProblem(config, code)).toBe('a custom section’s code');
    const swap = structuredClone(config);
    const s = swap.pages[0].sections.find((x) => x.id === id)!;
    if (s.type === 'custom') s.content.component = 'other';
    expect(adminChangeProblem(config, swap)).not.toBeNull();
  });
});

describe('custom sections on export', () => {
  it('turns each into a normal component file with a dispatcher', async () => {
    const { config } = addCustomSection(plainSite(), 'home', 2, timelineDef(), timelineData);
    const component = Object.keys(config.customSections!)[0];
    const { files } = await exportSite({ config, projectName: 'Kora', version: 1, loadImage: async () => null });
    const get = (p: string) => files.find((f) => f.path === p)?.data as string | undefined;
    const file = get(`src/site/sections/custom/${component}.tsx`)!;
    expect(file).toContain('// @ts-nocheck');
    expect(file).toContain('export default function');
    const dispatcher = get('src/site/sections/custom.tsx')!;
    expect(dispatcher).toContain(`import Custom0 from './custom/${component}'`);
    expect(dispatcher).not.toContain('CustomFrame');
    expect(get('src/site/registry.tsx')).toContain("case 'custom'");
    expect(files.some((f) => f.path.includes('custom/frame'))).toBe(false);

    const plain = await exportSite({ config: plainSite(), projectName: 'Kora', version: 1, loadImage: async () => null });
    expect(plain.files.some((f) => f.path.startsWith('src/site/sections/custom'))).toBe(false);
  });
});
