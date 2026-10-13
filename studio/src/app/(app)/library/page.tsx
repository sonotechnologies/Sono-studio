import type { Metadata } from 'next';
import Link from 'next/link';
import { Page } from '@/components/shell';
import { requireUser } from '@/lib/auth';
import { PRESETS, PRESET_THUMBS } from '@/lib/presets';
import { PRESET_IDS, type PresetId } from '@/lib/types';
import { SECTIONS, SECTION_TYPES } from '@/site/registry';
import { SitePageView } from '@/site/render';
import { KORA_KITCHEN } from '@/site/samples/kora-kitchen';
import { VOLT_SUPPLY } from '@/site/samples/volt-supply';
import { addBookings } from '@/workspace/bookings';
import type { Section, SectionType, SiteConfig } from '@/site/schema';
import { themeFromPreset } from '@/site/theme';

export const metadata: Metadata = { title: 'Section library' };

/** The sample sites the previews borrow from: a restaurant, a shop, and the restaurant taking bookings. */
const SAMPLES: SiteConfig[] = [KORA_KITCHEN, VOLT_SUPPLY, addBookings(KORA_KITCHEN, { currency: 'USD', timezone: 'UTC' }).config];

/** Sample content for each section type, with the site it comes from (for its products or services). */
function sampleSection(type: SectionType): { site: SiteConfig; section: Section } | null {
  for (const site of SAMPLES)
    for (const page of site.pages) {
      const section = page.sections.find((x) => x.type === type);
      if (section) return { site, section };
    }
  return null;
}

/** Custom sections are written per site by AI, so they have no library entry. */
const LIBRARY_TYPES: SectionType[] = SECTION_TYPES.filter((t) => t !== 'custom' && sampleSection(t));

const FRAME = 1200;
const SCALE = 0.3;

function VariantPreview({ site, section, preset }: { site: SiteConfig; section: Section; preset: PresetId }) {
  const config: SiteConfig = { ...site, theme: themeFromPreset(preset), pages: [{ id: 'p', path: '/', title: '', sections: [section] }] };
  return (
    <div aria-hidden inert className="relative h-[210px] overflow-hidden bg-stage">
      <div style={{ width: FRAME, transform: `scale(${SCALE})`, transformOrigin: 'top left' }} className="absolute top-0 left-0">
        <SitePageView config={config} page={config.pages[0]} ctx={{ link: () => '#', editable: false }} className="min-h-[700px]" />
      </div>
    </div>
  );
}

type Props = { searchParams: Promise<{ type?: string; preset?: string }> };

export default async function LibraryPage({ searchParams }: Props) {
  await requireUser();
  const sp = await searchParams;
  const type = LIBRARY_TYPES.includes(sp.type as SectionType) ? (sp.type as SectionType) : null;
  const preset = PRESET_IDS.includes(sp.preset as PresetId) ? (sp.preset as PresetId) : 'warm-table';
  const href = (t: SectionType | null, p: PresetId) => {
    const q = new URLSearchParams();
    if (t) q.set('type', t);
    if (p !== 'warm-table') q.set('preset', p);
    const s = q.toString();
    return `/library${s ? `?${s}` : ''}`;
  };
  const total = LIBRARY_TYPES.reduce((n, t) => n + SECTIONS[t].variants.length, 0);
  const shown = type ? [type] : LIBRARY_TYPES;

  return (
    <Page title="Section library">
      <div className="-mb-2 flex flex-col gap-4">
        <nav aria-label="Section types" className="flex gap-[22px] overflow-x-auto border-b border-border [scrollbar-color:var(--color-border)_transparent] [scrollbar-width:thin]">
          {[null, ...LIBRARY_TYPES].map((t) => {
            const on = t === type;
            const count = t ? SECTIONS[t].variants.length : total;
            return (
              <Link
                key={t ?? 'all'}
                href={href(t, preset)}
                aria-current={on ? 'page' : undefined}
                className={`flex h-11 flex-none items-center gap-1.5 text-[14px] font-medium whitespace-nowrap ${
                  on ? 'text-accent-text shadow-[inset_0_-2px_0_var(--terracotta)]' : 'text-muted hover:text-text'
                }`}
              >
                {t ? SECTIONS[t].label : 'All'}
                <span className="text-[12px] text-muted">{count}</span>
              </Link>
            );
          })}
        </nav>
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-[13px] text-muted">Shown in</span>
          {PRESET_IDS.map((p) => {
            const on = p === preset;
            return (
              <Link
                key={p}
                href={href(type, p)}
                aria-current={on ? 'true' : undefined}
                className={`flex h-9 items-center gap-2 rounded-full border pr-3.5 pl-2 text-[13px] font-medium whitespace-nowrap ${
                  on ? 'border-text bg-text text-bg' : 'border-border text-text hover:bg-hover'
                }`}
              >
                <span style={{ background: PRESET_THUMBS[p].primary }} className="size-4 rounded-full border border-white/40" />
                {PRESETS[p].name}
              </Link>
            );
          })}
        </div>
      </div>

      {shown.map((t) => {
        const def = SECTIONS[t];
        const sample = sampleSection(t)!;
        return (
          <section key={t} className="flex flex-col gap-3.5">
            <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
              <h2 className="m-0 text-[20px] font-semibold tracking-[-0.01em]">{def.label}</h2>
              <span className="text-[13px] text-muted">
                {def.variants.length} variants · {def.purpose}
              </span>
            </div>
            <div className="grid grid-cols-[repeat(auto-fill,360px)] gap-4">
              {def.variants.map((v) => (
                <article key={v.id} className="flex max-w-full flex-col overflow-hidden rounded-card border border-border bg-surface">
                  <VariantPreview site={sample.site} section={{ ...sample.section, variant: v.id } as Section} preset={preset} />
                  <div className="flex flex-col gap-0.5 border-t border-border px-3.5 py-3">
                    <span className="text-[14px] font-semibold">{v.label}</span>
                    <span className="text-[12px] text-muted">{v.note}</span>
                  </div>
                </article>
              ))}
            </div>
          </section>
        );
      })}
    </Page>
  );
}
