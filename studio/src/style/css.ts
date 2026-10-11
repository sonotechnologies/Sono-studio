import { parseColor } from './reference';

const COLOR = /#[0-9a-f]{3}\b|#[0-9a-f]{6}(?:[0-9a-f]{2})?\b|rgba?\([^)]{5,40}\)/gi;

/** Colours and fonts from CSS text, weighted by the property they appear in. */
export function readCss(css: string, colors: Map<string, number>, fonts: Map<string, number>, out: { background?: string; text?: string }) {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  // Background and text colour on the page itself win outright.
  for (const m of clean.matchAll(/(?:^|[}\s,])(?:html|body|:root)\s*(?:,[^{]*)?\{([^}]*)\}/gi)) {
    const bg = /background(?:-color)?\s*:\s*([^;]+)/i.exec(m[1]);
    const fg = /(?:^|;|\s)color\s*:\s*([^;]+)/i.exec(m[1]);
    const bgc = bg && (bg[1].match(COLOR) ?? []).map(parseColor).find(Boolean);
    const fgc = fg && (fg[1].match(COLOR) ?? []).map(parseColor).find(Boolean);
    if (bgc && !out.background) out.background = bgc;
    if (fgc && !out.text) out.text = fgc;
  }
  for (const m of clean.matchAll(/([a-z-]+)\s*:\s*([^;{}]+)/gi)) {
    const prop = m[1].toLowerCase();
    const value = m[2];
    if (prop === 'font-family') {
      const first = value.split(',')[0].trim().replace(/^["']|["']$/g, '');
      if (first && !/^var\(|inherit|initial|unset|monospace|icon|awesome|material|glyph/i.test(first)) fonts.set(first, (fonts.get(first) ?? 0) + 1);
      continue;
    }
    const weight = prop.startsWith('background') ? 3 : prop === 'color' || prop === 'fill' ? 2 : prop.startsWith('--') ? 1.5 : prop.startsWith('border') || prop.startsWith('outline') ? 0.5 : 1;
    for (const raw of value.match(COLOR) ?? []) {
      const hex = parseColor(raw);
      if (hex) colors.set(hex, (colors.get(hex) ?? 0) + weight);
    }
  }
}

export interface PageLook {
  motion?: 'none' | 'subtle' | 'lively';
  density?: 'compact' | 'balanced' | 'airy';
  radius?: { card: number; button: number; input: number };
  /** Preferred layouts spotted on the page, e.g. { hero: 'full-bleed', navbar: 'centered' }. */
  layouts: Record<string, string>;
  /** Plain words for what was found, e.g. "scroll animations (GSAP)". */
  notes: string[];
}

const MOTION_LIBS: [RegExp, string][] = [
  [/gsap|scrolltrigger/i, 'GSAP'],
  [/data-aos|aos\.(?:js|css)/i, 'AOS'],
  [/framer-motion|data-framer/i, 'Framer Motion'],
  [/lottie/i, 'Lottie'],
  [/locomotive-scroll|lenis/i, 'smooth scrolling'],
  [/scrollreveal|wow\.(?:min\.)?js|animate\.(?:min\.)?css/i, 'scroll reveals'],
  [/swiper|splide|slick|glide\.js|embla/i, 'carousels'],
  [/data-w-id|webflow\.js/i, 'Webflow interactions'],
];

function px(value: string): number | null {
  const m = /^(-?[\d.]+)(px|rem|em)?$/.exec(value.trim());
  if (!m) return null;
  const n = parseFloat(m[1]);
  return m[2] === 'rem' || m[2] === 'em' ? n * 16 : n;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const v = [...values].sort((a, b) => a - b);
  return v[Math.floor(v.length / 2)];
}

/** Rules as [selector, declarations] pairs, ignoring at-rule wrappers. */
function rules(css: string): [string, string][] {
  return [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}@;]+)\{([^{}]*)\}/g)].map((m) => [m[1].trim().toLowerCase(), m[2].toLowerCase()]);
}

/**
 * How a page looks and moves, from its HTML and CSS: animation libraries and
 * keyframes for motion, border radii for corners, section padding for
 * spacing, and the hero and menu rules for layout.
 */
export function readLook(html: string, css: string[]): PageLook {
  const all = css.join('\n');
  const notes: string[] = [];
  const layouts: Record<string, string> = {};

  // Motion
  const libs = MOTION_LIBS.filter(([re]) => re.test(html) || re.test(all)).map(([, name]) => name);
  const keyframes = (all.match(/@(?:-webkit-)?keyframes/gi) ?? []).length;
  const animations = (all.match(/(?:^|[;{\s])animation(?:-name)?\s*:/gi) ?? []).length;
  const transitions = (all.match(/(?:^|[;{\s])transition\s*:/gi) ?? []).length;
  const scrollLibs = libs.filter((l) => l !== 'carousels');
  const motion: PageLook['motion'] = scrollLibs.length || (keyframes >= 5 && animations >= 5) ? 'lively' : keyframes >= 1 || animations >= 2 || transitions >= 8 ? 'subtle' : 'none';
  if (libs.length) notes.push(`animation (${libs.join(', ')})`);
  else if (motion !== 'none') notes.push(motion === 'lively' ? 'lots of animation' : 'light animation');

  const parsed = rules(all);
  // Corners: buttons and cards separately, in px.
  const buttonRadii: number[] = [];
  const cardRadii: number[] = [];
  const padding: number[] = [];
  for (const [selector, body] of parsed) {
    const r = /border-radius\s*:\s*([^;]+)/.exec(body);
    if (r) {
      const first = r[1].trim().split(/\s+/)[0];
      const value = first.endsWith('%') ? (parseFloat(first) >= 50 ? 999 : null) : px(first);
      if (value !== null && value >= 0) {
        if (/btn|button|cta|pill/.test(selector)) buttonRadii.push(value >= 40 ? 999 : value);
        else if (/card|tile|item|box|panel|feature|product|img|image|photo|media/.test(selector)) cardRadii.push(Math.min(value, 48));
      }
    }
    if (/(^|[\s,.#-])(section|hero|banner|block|container|wrapper|content)\b/.test(selector)) {
      const pt = /padding(?:-top|-block)?\s*:\s*([^;]+)/.exec(body);
      const v = pt ? px(pt[1].trim().split(/\s+/)[0]) : null;
      if (v !== null && v >= 16 && v <= 320) padding.push(v);
    }
  }
  const button = median(buttonRadii);
  const card = median(cardRadii);
  const radius = button !== null || card !== null ? { card: Math.round(card ?? Math.min(button ?? 0, 24)), button: Math.round(button ?? card ?? 0), input: Math.round(Math.min(button ?? card ?? 0, card ?? 999, 16)) } : undefined;
  if (radius) notes.push(radius.button >= 999 ? 'pill buttons' : radius.card <= 2 ? 'square corners' : radius.card >= 20 ? 'round corners' : 'soft corners');

  const pad = median(padding);
  const density: PageLook['density'] | undefined = pad === null ? undefined : pad >= 96 ? 'airy' : pad <= 48 ? 'compact' : 'balanced';
  if (density && density !== 'balanced') notes.push(density === 'airy' ? 'lots of space' : 'compact spacing');

  // Layouts: a video or background photo behind the first screen means a full-bleed hero.
  const heroRules = parsed.filter(([sel]) => /hero|banner|masthead|jumbotron|splash/.test(sel)).map(([, b]) => b).join(';');
  const top = html.slice(0, Math.max(4000, Math.floor(html.length * 0.35)));
  if (/<video[\s>]/i.test(top) || /background(?:-image)?\s*:[^;]*url\(/.test(heroRules) || /background-size\s*:\s*cover/.test(heroRules)) layouts.hero = 'full-bleed';
  else if (/text-align\s*:\s*center/.test(heroRules)) layouts.hero = 'centered';
  if (/font-size\s*:\s*(?:clamp\([^)]*(?:1[2-9]|[2-9]\d)vw|\d{3}px|(?:[89]|1\d)rem)/.test(heroRules)) layouts.hero = 'oversized-type';
  const navRules = parsed.filter(([sel]) => /(^|[\s,.#-])(nav|navbar|header|menu)\b/.test(sel)).map(([, b]) => b).join(';');
  if (/(?:justify-content\s*:\s*center|text-align\s*:\s*center)/.test(navRules) && !/space-between/.test(navRules)) layouts.navbar = 'centered';
  const cardShadows = parsed.filter(([sel, b]) => /card|tile|feature|product/.test(sel) && /box-shadow\s*:(?!\s*none)/.test(b)).length;
  if (cardShadows >= 2) layouts.features = 'cards';
  if (layouts.hero) notes.push(`${layouts.hero.replace('-', ' ')} hero`);
  if (layouts.navbar) notes.push('centred menu');

  return { motion, density, radius, layouts, notes };
}
