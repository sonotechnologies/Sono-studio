import type { Metadata } from 'next';
import { Page } from '@/components/shell';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { StyleThumb } from '@/components/style-thumb';
import { getRepo, requireUser } from '@/lib/auth';
import { PRESETS, PRESET_THUMBS } from '@/lib/presets';
import { PRESET_IDS } from '@/lib/types';

export const metadata: Metadata = { title: 'Style presets' };

const card = 'flex flex-col overflow-hidden rounded-dialog border border-border bg-surface';

export default async function PresetsPage() {
  await requireUser();
  const styles = await (await getRepo()).listStyles();
  return (
    <Page title="Style presets">
      <div className="-mb-2 flex flex-wrap items-end gap-4">
        <p className="m-0 max-w-[640px] flex-1 text-[16px] leading-normal text-muted">
          Each preset sets colours, fonts, corners, spacing, image treatment and preferred section variants. Make your own styles from a preset or from a
          reference: a screenshot, a link or a logo.
        </p>
        <Link href="/presets/new" className="inline-flex h-11 flex-none items-center justify-center gap-1.5 rounded-full bg-terracotta px-5 text-[15px] font-semibold whitespace-nowrap text-white transition-[background-color,transform] duration-[90ms] hover:bg-terracotta-hover active:scale-[0.97]">
          <Plus size={16} />
          New style
        </Link>
      </div>

      <section className="flex flex-col gap-4">
        <h2 className="m-0 text-[13px] font-medium tracking-[0.12em] text-muted uppercase">Your styles</h2>
        {styles.length ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,360px),1fr))] gap-[18px]">
            {styles.map((st) => (
              <Link key={st.id} href={`/presets/${st.id}`} className={`${card} transition-transform duration-150 hover:-translate-y-0.5`}>
                <StyleThumb theme={st.theme} sample={st.name} className="h-[200px]" />
                <div className="flex flex-col gap-1 px-[18px] pt-4 pb-[18px]">
                  <span className="text-[16px] font-semibold">{st.name}</span>
                  <span className="text-[13px] text-muted">{st.note || `Based on ${PRESETS[st.theme.preset].name}`}</span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <p className="m-0 rounded-card border border-dashed border-border px-5 py-6 text-[14px] text-muted">
            None yet. Start one from a preset below (“Customise”), from a reference with New style, or save a site’s theme from the workspace’s Theme panel.
          </p>
        )}
      </section>

      <h2 className="m-0 -mb-2 text-[13px] font-medium tracking-[0.12em] text-muted uppercase">Built-in presets</h2>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,360px),1fr))] gap-[18px]">
        {PRESET_IDS.map((id) => {
          const p = PRESETS[id];
          const t = PRESET_THUMBS[id];
          return (
            <article key={id} className="flex flex-col overflow-hidden rounded-dialog border border-border bg-surface">
              <div
                aria-hidden
                style={{ background: t.bg, color: t.text }}
                className="flex h-[200px] flex-col justify-between gap-3.5 p-[22px]"
              >
                <div
                  style={{ fontFamily: t.bodyFont }}
                  className="flex items-center justify-between text-[10px] tracking-[0.06em] uppercase opacity-75"
                >
                  <span>{t.brand}</span>
                  <span>Menu · About · Contact</span>
                </div>
                <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] items-end gap-4">
                  <div className="flex flex-col gap-3">
                    <span
                      style={{
                        fontFamily: t.headingFont,
                        fontSize: t.headingSize + 4,
                        letterSpacing: t.headingTracking,
                        textTransform: t.uppercase ? 'uppercase' : 'none',
                      }}
                      className="leading-[1.02]"
                    >
                      {t.sample}
                    </span>
                    <span
                      style={{ background: t.primary, color: t.onPrimary, fontFamily: t.bodyFont, borderRadius: t.buttonRadius }}
                      className="self-start px-3 py-[7px] text-[11px]"
                    >
                      {t.cta}
                    </span>
                  </div>
                  <div
                    style={{
                      borderRadius: t.imageRadius,
                      border: t.imageBorder,
                      background: `repeating-linear-gradient(135deg, ${t.stripeA} 0 8px, ${t.stripeB} 8px 16px)`,
                    }}
                    className="h-[110px]"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-3 px-[18px] pt-4 pb-[18px]">
                <div className="flex items-baseline gap-2">
                  <h2 className="m-0 flex-1 text-[16px] font-semibold">{p.name}</h2>
                  <span className="text-[12px] text-muted">{t.suits}</span>
                </div>
                <div className="flex items-center gap-3.5">
                  <div className="flex" aria-label="Colours">
                    {t.swatches.map((c) => (
                      <span
                        key={c}
                        title={c}
                        style={{ background: c }}
                        className="-mr-1.5 size-6 rounded-full border-2 border-surface"
                      />
                    ))}
                  </div>
                  <span className="flex-1 pl-1.5 text-[13px] text-muted">
                    {p.fonts.heading} / {p.fonts.body}
                  </span>
                  <Link href={`/presets/new?base=${id}`} className="text-[13px] font-medium text-accent-text hover:underline">
                    Customise
                  </Link>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </Page>
  );
}
