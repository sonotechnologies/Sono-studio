import { describe, expect, it } from 'vitest';
import { weightedPalette } from '@/generate/palette';
import { contrast } from '@/site/theme';
import { matchFont, parseColor, styleFromReference, themeWarnings } from './reference';

const w = (hex: string, weight: number) => ({ hex, weight });

describe('reference styles', () => {
  it('reads CSS colours', () => {
    expect(parseColor('#abc')).toBe('#AABBCC');
    expect(parseColor('rgb(10, 20, 30)')).toBe('#0A141E');
    expect(parseColor('rgba(0,0,0,0.1)')).toBeNull();
    expect(parseColor('transparent')).toBeNull();
  });

  it('matches fonts to ones sites can load', () => {
    expect(matchFont('Playfair Display')).toBe('Playfair Display');
    expect(matchFont('"Bebas Neue"')).toBe('Anton');
    expect(matchFont('Montserrat')).toBe('Sora');
    expect(matchFont('Helvetica Neue')).toBe('Inter');
    expect(matchFont('Times New Roman')).toBe('Fraunces');
    expect(matchFont('Comic Neue Wobbly')).toBeNull();
  });

  it('turns a dark page with a bright accent into a readable dark theme', () => {
    const s = styleFromReference({ kind: 'link', colors: [w('#0B0F1A', 60), w('#E6E9F0', 20), w('#22D3EE', 8), w('#A855F7', 4)], fonts: ['Inter', 'Sora'] });
    expect(s.theme.mode).toBe('dark');
    expect(s.suggested).toBe('tech-dark');
    expect(s.reasons).toContain('dark background');
    expect(themeWarnings(s.theme)).toEqual([]);
  });

  it('spots a warm, serif restaurant site', () => {
    const s = styleFromReference({ kind: 'screenshot', colors: [w('#F6EEDF', 70), w('#2B1D14', 15), w('#4E5B31', 6), w('#C6772E', 4)], fonts: ['Lora', 'Lato'] });
    expect(s.suggested).toBe('warm-table');
    expect(s.theme.fonts).toEqual({ heading: 'Fraunces', body: 'Inter' });
    expect(s.theme.colors.background).toBe('#F6EEDF');
  });

  it('spots a bold condensed site and a calm corporate one', () => {
    expect(styleFromReference({ kind: 'link', colors: [w('#FFFFFF', 50), w('#111111', 40), w('#FF3B1F', 10)], fonts: ['Oswald', 'Arial'] }).suggested).toBe('bold-street');
    expect(styleFromReference({ kind: 'link', colors: [w('#FFFFFF', 60), w('#1F2937', 20), w('#2563EB', 10), w('#64748B', 5)], fonts: ['Roboto'] }).suggested).toBe('clean-corporate');
  });

  it('keeps a logo’s brand colours on the preset’s own background, and readable', () => {
    const s = styleFromReference({ kind: 'logo', colors: [w('#F2C94C', 60), w('#1E3A8A', 40)] });
    expect(s.swatches).toContain('#F2C94C');
    expect(contrast(s.theme.colors.primary, s.theme.colors.background)).toBeGreaterThanOrEqual(3);
    expect(themeWarnings(s.theme)).toEqual([]);
  });

  it('measures colours by area in a screenshot', () => {
    const px = (r: number, g: number, b: number, n: number) => Array.from({ length: n }, () => [r, g, b, 255]).flat();
    const p = weightedPalette([...px(250, 248, 245, 90), ...px(30, 30, 30, 10)]);
    expect(p[0].hex).toBe('#FAF8F5');
    expect(p[0].weight).toBeCloseTo(0.9);
  });
});

describe('reading a page’s CSS', () => {
  it('weights backgrounds and text, and finds the page background and fonts', async () => {
    const { readCss } = await import('./css');
    const colors = new Map<string, number>();
    const fonts = new Map<string, number>();
    const out: { background?: string; text?: string } = {};
    readCss(
      `/* brand */ body { background: #0b0f1a; color: rgb(230, 233, 240); font-family: "Inter", sans-serif }
       h1, h2 { font-family: 'Sora', sans-serif }
       .btn { background-color: #22d3ee; border: 1px solid #22D3EE }
       .x { color: rgba(0,0,0,.05) } .i { font-family: "Font Awesome 6" }`,
      colors,
      fonts,
      out,
    );
    expect(out).toEqual({ background: '#0B0F1A', text: '#E6E9F0' });
    expect(colors.get('#22D3EE')).toBe(3.5);
    expect([...fonts.keys()]).toEqual(['Inter', 'Sora']);
  });
});
