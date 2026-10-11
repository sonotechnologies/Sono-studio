import { PRESETS } from '@/lib/presets';
import { PRESET_IDS, type PresetId } from '@/lib/types';
import type { SiteTheme } from '@/site/schema';
import { contrast, FONT_VARS, readableOn } from '@/site/theme';

/*
 * Turns what a reference gives us (a logo's, screenshot's or web page's
 * colours and fonts) into a complete, readable theme and the closest preset.
 * All in code, no AI: colours get roles by weight, saturation and contrast,
 * fonts are matched to the ones sites can load, and presets are scored on
 * the same features a person would notice (dark or light, warm or cool,
 * serif or sans, loud or quiet).
 */

export interface WeightedColor {
  hex: string;
  /** Relative amount: pixel share for images, weighted mentions for CSS. */
  weight: number;
}

export interface ReferenceInput {
  colors: WeightedColor[];
  /** Font families in order of use, most used first. */
  fonts?: string[];
  /** Set when the source says so directly (CSS on body, theme-color). */
  background?: string;
  text?: string;
  /** A logo gives brand colours, not a page background. */
  kind: 'logo' | 'screenshot' | 'link';
}

export interface ReferenceStyle {
  theme: SiteTheme;
  suggested: PresetId;
  /** Short plain reasons for the suggestion, e.g. "dark background", "serif headings". */
  reasons: string[];
  /** The brand colours found, strongest first (shown as swatches). */
  swatches: string[];
}

/* ---------- Colour helpers ---------- */

type RGB = [number, number, number];

export function parseColor(input: string): string | null {
  const s = input.trim().toLowerCase();
  let m = /^#([0-9a-f]{3})$/.exec(s);
  if (m) return `#${m[1].split('').map((c) => c + c).join('')}`.toUpperCase();
  m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/.exec(s);
  if (m) return m[2] && parseInt(m[2], 16) < 128 ? null : `#${m[1]}`.toUpperCase();
  m = /^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(s);
  if (m) {
    const alpha = m[4] ? (m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4])) : 1;
    if (alpha < 0.5) return null;
    return toHex([+m[1], +m[2], +m[3]].map((v) => Math.min(255, v)) as RGB);
  }
  return null;
}

const rgb = (hex: string): RGB => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as RGB;
const toHex = (c: RGB) => `#${c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`.toUpperCase();

export function hsl(hex: string): { h: number; s: number; l: number } {
  const [r, g, b] = rgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) * 60 : max === g ? ((b - r) / d + 2) * 60 : ((r - g) / d + 4) * 60;
  return { h, s, l };
}

function fromHsl(h: number, s: number, l: number): string {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return toHex([f(0) * 255, f(8) * 255, f(4) * 255]);
}

export function mix(a: string, b: string, t: number): string {
  const [x, y] = [rgb(a), rgb(b)];
  return toHex(x.map((v, i) => v + (y[i] - v) * t) as RGB);
}

const hueGap = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
const isChromatic = (hex: string) => {
  const c = hsl(hex);
  return c.s >= 0.25 && c.l >= 0.12 && c.l <= 0.88;
};

/** Moves a colour's lightness away from the background until it reaches the contrast asked for. */
function readable(hex: string, background: string, min: number): string {
  if (contrast(hex, background) >= min) return hex;
  const { h, s, l } = hsl(hex);
  const darker = hsl(background).l > 0.5;
  for (let step = 1; step <= 20; step++) {
    const next = fromHsl(h, s, Math.max(0, Math.min(1, darker ? l - step * 0.04 : l + step * 0.04)));
    if (contrast(next, background) >= min) return next;
  }
  return readableOn(background, '#FFFFFF', '#111111');
}

/**
 * A primary colour and button-text colour that read well together: the most
 * readable text colour is chosen, and if even that is too faint the primary
 * is made darker or lighter until it isn't.
 */
function buttonColors(primary: string, background: string, text: string): { primary: string; onPrimary: string } {
  const best = (p: string) => [background, text, '#FFFFFF', '#111111'].sort((a, b) => contrast(b, p) - contrast(a, p))[0];
  let on = best(primary);
  if (contrast(on, primary) >= 4.5) return { primary, onPrimary: on };
  const { h, s, l } = hsl(primary);
  const lighterText = hsl(on).l > 0.5;
  for (let step = 1; step <= 20; step++) {
    const next = fromHsl(h, s, Math.max(0, Math.min(1, lighterText ? l - step * 0.04 : l + step * 0.04)));
    on = best(next);
    if (contrast(on, next) >= 4.5) return { primary: next, onPrimary: on };
  }
  return { primary: text, onPrimary: background };
}

/** Merges near-identical colours so a gradient or anti-aliasing doesn't split one colour into many. */
export function mergeColors(colors: WeightedColor[], distance = 40): WeightedColor[] {
  const out: (WeightedColor & { c: RGB })[] = [];
  for (const col of [...colors].sort((a, b) => b.weight - a.weight)) {
    const c = rgb(col.hex);
    const near = out.find((o) => Math.hypot(o.c[0] - c[0], o.c[1] - c[1], o.c[2] - c[2]) < distance);
    if (near) near.weight += col.weight;
    else out.push({ ...col, c });
  }
  const total = out.reduce((s, o) => s + o.weight, 0) || 1;
  return out.map(({ hex, weight }) => ({ hex, weight: weight / total })).sort((a, b) => b.weight - a.weight);
}

/* ---------- Fonts ---------- */

const AVAILABLE = Object.keys(FONT_VARS);
const FONT_FAMILIES: [RegExp, string][] = [
  [/anton|oswald|bebas|league gothic|archivo (black|narrow)|impact|barlow condensed|fjalla|teko|big shoulders/, 'Anton'],
  [/playfair|bodoni|didot|prata|abril|dm serif|yeseva/, 'Playfair Display'],
  [/cormorant|garamond|cinzel|marcellus|tenor|italiana|bellefair/, 'Cormorant Garamond'],
  [/fraunces|recoleta|lora|merriweather|libre baskerville|baskerville|crimson|georgia|times|source serif|noto serif|pt serif|spectral|young serif|roboto slab|\bserif\b/, 'Fraunces'],
  [/nunito|quicksand|varela|comfortaa|rubik|mulish|lexend/, 'Nunito Sans'],
  [/sora|montserrat|poppins|outfit|urbanist|futura|gilroy|avenir|jost|raleway|syne|clash|satoshi|general sans/, 'Sora'],
  [/manrope|plus jakarta|figtree|work sans|be vietnam/, 'Manrope'],
  [/space grotesk|grotesk|neue haas|akzidenz|space mono|ibm plex/, 'Space Grotesk'],
  [/dm sans/, 'DM Sans'],
  [/inter|roboto|helvetica|arial|open sans|lato|source sans|system-ui|-apple-system|segoe|sf pro|noto sans|sans-serif|geist/, 'Inter'],
];

/** The closest font sites can load, or null if nothing about the name is recognisable. */
export function matchFont(name: string): string | null {
  const n = name.trim().replace(/^["']|["']$/g, '').toLowerCase();
  const exact = AVAILABLE.find((f) => f.toLowerCase() === n);
  if (exact) return exact;
  return FONT_FAMILIES.find(([re]) => re.test(n))?.[1] ?? null;
}

const SERIF = new Set(['Fraunces', 'Playfair Display', 'Cormorant Garamond']);

/* ---------- Presets ---------- */

interface Features {
  dark: boolean;
  warm: boolean;
  pastel: boolean;
  cool: boolean;
  neon: boolean;
  mono: boolean;
  serif: boolean;
  condensed: boolean;
  rounded: boolean;
}

function score(id: PresetId, f: Features): number {
  const modes = PRESETS[id].colors;
  if (f.dark && !modes.dark) return -100;
  if (!f.dark && !modes.light) return -100;
  const table: Record<PresetId, Partial<Record<keyof Features, number>>> = {
    'warm-table': { warm: 3, serif: 1.5, pastel: -1, neon: -2, cool: -1 },
    'luxe-minimal': { mono: 3, serif: 2, condensed: -1, neon: -2, warm: 0.5 },
    'bold-street': { condensed: 4, neon: 1, mono: 1, serif: -1 },
    'clean-corporate': { cool: 3, serif: -1, warm: -1, pastel: -0.5 },
    'tech-dark': { dark: 3, neon: 3, cool: 1, serif: -2 },
    'soft-studio': { pastel: 3, rounded: 2, serif: 0.5, neon: -2 },
  };
  return Object.entries(table[id]).reduce((s, [k, v]) => s + (f[k as keyof Features] ? v! : 0), 0.1);
}

const REASON: Partial<Record<keyof Features, string>> = {
  dark: 'dark background',
  warm: 'warm, earthy colours',
  pastel: 'soft pastel colours',
  cool: 'cool blues and greys',
  neon: 'bright accent on dark',
  mono: 'mostly black, white and neutrals',
  serif: 'serif headings',
  condensed: 'tall condensed headings',
  rounded: 'rounded, friendly type',
};

/* ---------- The whole style ---------- */

export function styleFromReference(input: ReferenceInput): ReferenceStyle {
  const colors = mergeColors(input.colors.filter((c) => /^#[0-9A-F]{6}$/i.test(c.hex)).map((c) => ({ ...c, hex: c.hex.toUpperCase() })));
  const chroma = colors.filter((c) => isChromatic(c.hex) && c.weight >= 0.01);

  // Background: what the source says, else (for pages and screenshots) the most used neutral-ish colour.
  let background = input.background ?? null;
  if (!background && input.kind !== 'logo') {
    background = colors.find((c) => hsl(c.hex).s < 0.4 || hsl(c.hex).l > 0.9 || hsl(c.hex).l < 0.12)?.hex ?? colors[0]?.hex ?? null;
  }
  // A logo, or a source with no clear background, sits on a soft neutral.
  if (!background) background = '#FAF8F5';
  const dark = hsl(background).l < 0.35;

  let text = input.text ?? null;
  if (!text || contrast(text, background) < 4.5) {
    const candidates = colors.filter((c) => c.hex !== background && contrast(c.hex, background) >= 7 && hsl(c.hex).s < 0.5);
    text = candidates[0]?.hex ?? (dark ? '#F5F3EF' : '#17150F');
  }

  const brand = chroma.filter((c) => Math.abs(hsl(c.hex).l - hsl(background).l) > 0.08);
  const primary = brand[0] ? readable(brand[0].hex, background, 3) : text;
  const accentPick = brand.slice(1).find((c) => hueGap(hsl(c.hex).h, hsl(brand[0].hex).h) >= 30) ?? brand[1];
  const accent = accentPick ? accentPick.hex : brand[0] ? mix(brand[0].hex, dark ? '#FFFFFF' : '#000000', 0.25) : mix(text, background, 0.5);
  const surface = mix(background, text, dark ? 0.07 : 0.04);
  let muted = mix(text, background, 0.4);
  if (contrast(muted, background) < 4.5) muted = mix(text, background, 0.25);
  if (contrast(muted, background) < 4.5) muted = text;

  // Fonts: what the source uses, matched to fonts sites can load.
  const matched = [...new Set((input.fonts ?? []).map(matchFont).filter((f): f is string => !!f))];
  const bodyFont = matched.find((f) => !SERIF.has(f) && f !== 'Anton') ?? null;
  const headingFont = matched.find((f) => f !== bodyFont) ?? matched[0] ?? null;

  const bg = hsl(background);
  const p = hsl(primary);
  const features: Features = {
    dark,
    warm: !dark && ((bg.h >= 15 && bg.h <= 60 && bg.s >= 0.15) || brand.some((c) => hsl(c.hex).h >= 10 && hsl(c.hex).h <= 50 && hsl(c.hex).s < 0.75)),
    pastel: !dark && bg.l > 0.85 && brand.length > 0 && brand.every((c) => hsl(c.hex).l > 0.55 || hsl(c.hex).s < 0.55) && brand.some((c) => hsl(c.hex).l > 0.7),
    cool: brand.length > 0 && p.h >= 190 && p.h <= 250,
    neon: dark && brand.some((c) => hsl(c.hex).s > 0.65 && hsl(c.hex).l > 0.45),
    mono: brand.reduce((s, c) => s + c.weight, 0) < 0.06,
    serif: !!headingFont && SERIF.has(headingFont),
    condensed: headingFont === 'Anton',
    rounded: headingFont === 'Nunito Sans' || bodyFont === 'Nunito Sans',
  };
  const ranked = [...PRESET_IDS].sort((a, b) => score(b, features) - score(a, features));
  const suggested = ranked[0];
  const base = PRESETS[suggested];

  const theme: SiteTheme = {
    preset: suggested,
    mode: dark ? 'dark' : 'light',
    colors: { background, surface, text, muted, accent, ...buttonColors(primary, background, text) },
    fonts: { heading: headingFont ?? base.fonts.heading, body: bodyFont ?? base.fonts.body },
    radius: { ...base.radius },
  };
  // Logos only give brand colours: keep the preset's own background and text.
  if (input.kind === 'logo') {
    const own = (base.colors.light ?? base.colors.dark)!;
    theme.mode = base.colors.light ? 'light' : 'dark';
    Object.assign(theme.colors, { background: own.background, surface: own.surface, text: own.text, muted: own.muted });
    Object.assign(theme.colors, buttonColors(readable(primary === text ? own.primary : primary, own.background, 3), own.background, own.text));
  }

  const reasons = (Object.keys(REASON) as (keyof Features)[]).filter((k) => features[k] && (score(suggested, { ...features, [k]: false }) < score(suggested, features))).map((k) => REASON[k]!);
  return { theme, suggested, reasons: reasons.length ? reasons : ['closest overall match'], swatches: brand.slice(0, 5).map((c) => c.hex) };
}

/** Contrast problems in a theme, in plain words (shared by every theme editor). */
export function themeWarnings(t: SiteTheme): string[] {
  const c = t.colors;
  const out: string[] = [];
  if (contrast(c.text, c.background) < 4.5) out.push('Text is hard to read on the background.');
  if (contrast(c.text, c.surface) < 4.5) out.push('Text is hard to read on the surface colour.');
  if (contrast(c.muted, c.background) < 3) out.push('Muted text is too faint on the background.');
  if (contrast(c.onPrimary, c.primary) < 4.5) out.push('Button text is hard to read on the primary colour.');
  return out;
}
