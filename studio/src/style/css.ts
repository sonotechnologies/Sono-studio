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
