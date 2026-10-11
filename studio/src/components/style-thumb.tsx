import type { SiteTheme } from '@/site/schema';
import { FONT_VARS, PRESET_STYLE } from '@/site/theme';

/** A small mock home page drawn from a theme, for style cards. */
export function StyleThumb({ theme, sample = 'Your headline here', cta = 'Get in touch', className = 'h-[190px]' }: { theme: SiteTheme; sample?: string; cta?: string; className?: string }) {
  const c = theme.colors;
  const look = PRESET_STYLE[theme.preset];
  const font = (name: string) => `${FONT_VARS[name] ?? `'${name}'`}, system-ui, sans-serif`;
  const stripe = (t: number) => `color-mix(in srgb, ${c.text} ${t}%, ${c.background})`;
  return (
    <div aria-hidden style={{ background: c.background, color: c.text }} className={`grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] items-center gap-4 p-[22px] ${className}`}>
      <div className="flex min-w-0 flex-col gap-3">
        <span
          style={{
            fontFamily: font(theme.fonts.heading),
            fontWeight: look.headingWeight,
            textTransform: look.headingCase,
            letterSpacing: look.headingTracking,
          }}
          className="text-[26px] leading-[1.02]"
        >
          {sample}
        </span>
        <span style={{ fontFamily: font(theme.fonts.body), color: c.muted }} className="text-[11px] leading-snug">
          {theme.fonts.heading} and {theme.fonts.body}
        </span>
        <span style={{ background: c.primary, color: c.onPrimary, fontFamily: font(theme.fonts.body), borderRadius: Math.min(theme.radius.button, 999) }} className="self-start px-3 py-[7px] text-[11px] font-semibold">
          {cta}
        </span>
      </div>
      <div className="flex h-full flex-col justify-center gap-2">
        <div
          style={{
            borderRadius: look.imageMask === 'arch' ? '999px 999px 12px 12px' : Math.min(theme.radius.card, 24),
            border: look.outline !== '0px' ? `${look.outline} solid ${c.text}` : 'none',
            background: `repeating-linear-gradient(135deg, ${stripe(7)} 0 8px, ${stripe(12)} 8px 16px)`,
          }}
          className="h-[100px]"
        />
        <div className="flex gap-1">
          {[c.surface, c.primary, c.accent].map((x, i) => (
            <span key={i} style={{ background: x, borderColor: stripe(18) }} className="size-4 rounded-full border" />
          ))}
        </div>
      </div>
    </div>
  );
}
