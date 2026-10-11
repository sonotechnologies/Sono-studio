import type { CSSProperties } from 'react';
import { PRESETS, type PresetColors } from '@/lib/presets';
import type { PresetId } from '@/lib/types';
import type { SiteTheme } from './schema';

/** Google fonts the renderer can use, mapped to the next/font variables in the root layout. */
export const FONT_VARS: Record<string, string> = {
  'Space Grotesk': 'var(--font-space-grotesk)',
  Fraunces: 'var(--font-fraunces)',
  'DM Sans': 'var(--font-dm-sans)',
  'Cormorant Garamond': 'var(--font-cormorant)',
  Inter: 'var(--font-inter)',
  Anton: 'var(--font-anton)',
  Manrope: 'var(--font-manrope)',
  Sora: 'var(--font-sora)',
  'Playfair Display': 'var(--font-playfair)',
  'Nunito Sans': 'var(--font-nunito-sans)',
};

/** Typographic character that the colour tokens don't capture. */
interface PresetStyle {
  headingWeight: number;
  headingCase: 'none' | 'uppercase';
  headingTracking: string;
  /** Border drawn around photos and cards (Bold Street's heavy outlines, Luxe's hairlines). */
  outline: string;
  /** Photo mask shape on supporting images. */
  imageMask: 'none' | 'arch';
}

export const PRESET_STYLE: Record<PresetId, PresetStyle> = {
  'warm-table': { headingWeight: 500, headingCase: 'none', headingTracking: '-0.02em', outline: '0px', imageMask: 'none' },
  'luxe-minimal': { headingWeight: 500, headingCase: 'none', headingTracking: '-0.01em', outline: '1px', imageMask: 'none' },
  'bold-street': { headingWeight: 400, headingCase: 'uppercase', headingTracking: '0', outline: '3px', imageMask: 'none' },
  'clean-corporate': { headingWeight: 700, headingCase: 'none', headingTracking: '-0.02em', outline: '0px', imageMask: 'none' },
  'tech-dark': { headingWeight: 600, headingCase: 'none', headingTracking: '-0.03em', outline: '1px', imageMask: 'none' },
  'soft-studio': { headingWeight: 500, headingCase: 'none', headingTracking: '-0.01em', outline: '0px', imageMask: 'arch' },
};

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

/** Whichever of the two candidates reads better on the background. */
export function readableOn(background: string, light = '#FFFFFF', dark = '#111111'): string {
  return contrast(background, light) >= contrast(background, dark) ? light : dark;
}

export interface ThemeOptions {
  mode?: 'light' | 'dark';
  /** Brand colours replace the preset's colours; everything else stays. */
  brand?: Partial<Omit<PresetColors, 'background' | 'surface'>>;
}

export function themeFromPreset(preset: PresetId, opts: ThemeOptions = {}): SiteTheme {
  const def = PRESETS[preset];
  const wanted = opts.mode ?? (def.colors.light ? 'light' : 'dark');
  const mode = def.colors[wanted] ? wanted : def.colors.light ? 'light' : 'dark';
  const base = def.colors[mode]!;
  const colors = { ...base, ...opts.brand };
  return {
    preset,
    mode,
    colors: { ...colors, onPrimary: readableOn(colors.primary, colors.background, colors.text) },
    fonts: { heading: def.fonts.heading, body: def.fonts.body },
    radius: { ...def.radius },
  };
}

/** CSS variables the section components read. Applied on the site root element. */
export function themeStyle(theme: SiteTheme): CSSProperties {
  const def = PRESETS[theme.preset];
  const style = PRESET_STYLE[theme.preset];
  const font = (name: string) => `${FONT_VARS[name] ?? `'${name}'`}, system-ui, sans-serif`;
  const px = (n: number) => `${n}px`;
  /** Reaches the desktop size when the site frame is 1280px wide. */
  const fluid = (desktop: number) => `${((desktop / 1280) * 100).toFixed(2)}cqi`;
  const space = theme.density === 'airy' ? 1.3 : theme.density === 'compact' ? 0.7 : 1;
  const section = def.spacing.section.map((n) => Math.round(n * space));
  const c = theme.colors;
  return {
    '--s-bg': c.background,
    '--s-surface': c.surface,
    '--s-text': c.text,
    '--s-muted': c.muted,
    '--s-primary': c.primary,
    '--s-on-primary': c.onPrimary,
    '--s-accent': c.accent,
    '--s-on-accent': readableOn(c.accent, '#FFFFFF', c.text),
    '--s-font-heading': font(theme.fonts.heading),
    '--s-font-body': font(theme.fonts.body),
    '--s-heading-weight': String(style.headingWeight),
    '--s-heading-case': style.headingCase,
    '--s-heading-tracking': style.headingTracking,
    '--s-outline': style.outline,
    '--s-r-card': px(theme.radius.card),
    '--s-r-button': px(theme.radius.button),
    '--s-r-input': px(theme.radius.input),
    '--s-r-image': style.imageMask === 'arch' ? '999px 999px 24px 24px' : px(theme.radius.card),
    '--s-h1-phone': px(def.type.phone.h1),
    '--s-h1-desktop': px(def.type.desktop.h1),
    '--s-h2-phone': px(def.type.phone.h2),
    '--s-h2-desktop': px(def.type.desktop.h2),
    '--s-h1-fluid': fluid(def.type.desktop.h1),
    '--s-h2-fluid': fluid(def.type.desktop.h2),
    '--s-section-fluid': fluid(section[1] ?? section[0]),
    '--s-body-phone': px(def.type.phone.body),
    '--s-body-desktop': px(def.type.desktop.body),
    '--s-section-phone': px(section[0]),
    '--s-section-desktop': px(section[1] ?? section[0]),
    colorScheme: theme.mode,
  } as CSSProperties;
}
