import { PRESET_THUMBS } from '@/lib/presets';
import type { PresetId } from '@/lib/types';

/**
 * A small mock home page in the project's preset, standing in until the
 * renderer produces real screenshots (phase 2). Photos are striped placeholders.
 */
export function SiteThumb({
  preset,
  name,
  headline,
  size = 'card',
}: {
  preset: PresetId;
  name: string;
  headline: string;
  size?: 'card' | 'detail';
}) {
  const t = PRESET_THUMBS[preset];
  const heading = (
    <span
      style={{
        fontFamily: t.headingFont,
        fontSize: size === 'card' ? t.headingSize : 20,
        letterSpacing: t.headingTracking,
        textTransform: t.uppercase ? 'uppercase' : 'none',
      }}
      className={`leading-[1.02] [overflow-wrap:anywhere] ${size === 'card' ? 'line-clamp-3' : 'line-clamp-2'}`}
    >
      {headline || name}
    </span>
  );
  const cta = (
    <span
      style={{ background: t.primary, color: t.onPrimary, fontFamily: t.bodyFont, borderRadius: t.buttonRadius }}
      className={`self-start text-[9px] ${size === 'card' ? 'px-2.5 py-[5px]' : 'px-[9px] py-1'}`}
    >
      {t.cta}
    </span>
  );

  if (size === 'detail') {
    return (
      <div
        aria-hidden
        style={{ background: t.bg, color: t.text }}
        className="flex h-32 w-[200px] flex-none flex-col justify-end gap-2 overflow-hidden rounded-card border border-border p-4"
      >
        {heading}
        {cta}
      </div>
    );
  }

  return (
    <div
      aria-hidden
      style={{ background: t.bg, color: t.text }}
      className="grid h-[170px] grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] items-center gap-3.5 overflow-hidden px-5 py-[18px]"
    >
      <div className="flex flex-col gap-2.5">
        <span style={{ fontFamily: t.bodyFont }} className="truncate text-[9px] tracking-[0.08em] uppercase opacity-70">
          {name}
        </span>
        {heading}
        {cta}
      </div>
      <div
        style={{
          borderRadius: t.imageRadius,
          border: t.imageBorder,
          background: `repeating-linear-gradient(135deg, ${t.stripeA} 0 7px, ${t.stripeB} 7px 14px)`,
        }}
        className="h-[118px]"
      />
    </div>
  );
}
