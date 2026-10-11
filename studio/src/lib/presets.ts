import data from './presets.json';
import type { PresetId } from './types';

/** Full preset definitions (tokens, type scale, variants) from the design handoff. */
export const PRESETS = data as Record<PresetId, PresetDefinition>;

export interface PresetColors {
  background: string;
  surface: string;
  text: string;
  muted: string;
  primary: string;
  accent: string;
}

export interface PresetDefinition {
  name: string;
  feel: string;
  suits: string[];
  fonts: { heading: string; body: string };
  /** Tech Dark has only a dark set; the others have light and sometimes dark. */
  colors: { light?: PresetColors; dark?: PresetColors };
  radius: { card: number; button: number; input: number };
  type: { phone: Record<string, number>; desktop: Record<string, number> };
  spacing: { section: number[] };
  images: string;
  variants: Record<string, string>;
}

// export:end (exported sites keep only what is above this line)

/**
 * How a preset looks as a small mock home page (dashboard thumbnails and preset
 * cards). Values are taken from the Studio App design.
 */
export interface PresetThumb {
  bg: string;
  text: string;
  primary: string;
  onPrimary: string;
  headingFont: string;
  bodyFont: string;
  /** Heading size on a 170px-tall card thumbnail. */
  headingSize: number;
  headingTracking: string;
  uppercase: boolean;
  cta: string;
  buttonRadius: string;
  imageRadius: string;
  imageBorder: string;
  stripeA: string;
  stripeB: string;
  swatches: string[];
  sample: string;
  brand: string;
  suits: string;
}

export const PRESET_THUMBS: Record<PresetId, PresetThumb> = {
  'warm-table': {
    bg: '#FBF5EC', text: '#2B1D14', primary: '#4E5B31', onPrimary: '#FBF5EC',
    headingFont: 'var(--font-fraunces), serif', bodyFont: 'var(--font-dm-sans), sans-serif',
    headingSize: 24, headingTracking: '-0.02em', uppercase: false, cta: 'Book a table',
    buttonRadius: '8px', imageRadius: '12px', imageBorder: 'none', stripeA: '#E8D7BD', stripeB: '#E1CDAF',
    swatches: ['#FBF5EC', '#F1E6D3', '#2B1D14', '#4E5B31', '#D9A441'],
    sample: 'Slow food, served warm', brand: 'Kora Kitchen', suits: 'Restaurants, bakeries',
  },
  'luxe-minimal': {
    bg: '#F4F1EC', text: '#1C1A17', primary: '#1C1A17', onPrimary: '#F4F1EC',
    headingFont: 'var(--font-cormorant), serif', bodyFont: 'var(--font-inter), sans-serif',
    headingSize: 28, headingTracking: '0', uppercase: false, cta: 'Reserve',
    buttonRadius: '0', imageRadius: '0', imageBorder: '1px solid #1C1A17', stripeA: '#E6E0D6', stripeB: '#DDD6CA',
    swatches: ['#F4F1EC', '#FFFFFF', '#1C1A17', '#77716A', '#A88B5C'],
    sample: 'Rest, quietly', brand: 'Maison Lune', suits: 'Hotels, salons, fashion',
  },
  'bold-street': {
    bg: '#D7F24A', text: '#0D0D0D', primary: '#0D0D0D', onPrimary: '#D7F24A',
    headingFont: 'var(--font-anton), sans-serif', bodyFont: 'var(--font-space-grotesk), sans-serif',
    headingSize: 32, headingTracking: '0', uppercase: true, cta: 'Shop now',
    buttonRadius: '0', imageRadius: '0', imageBorder: '3px solid #0D0D0D', stripeA: '#C4DE3A', stripeB: '#B9D334',
    swatches: ['#F2F1EC', '#0D0D0D', '#D7F24A', '#FF5A36', '#555555'],
    sample: 'Drop 07 is live', brand: 'Kick Lab', suits: 'Streetwear, sneakers',
  },
  'clean-corporate': {
    bg: '#F6F8FB', text: '#14243B', primary: '#1F5FAE', onPrimary: '#FFFFFF',
    headingFont: 'var(--font-manrope), sans-serif', bodyFont: 'var(--font-manrope), sans-serif',
    headingSize: 22, headingTracking: '-0.02em', uppercase: false, cta: 'Get a quote',
    buttonRadius: '8px', imageRadius: '12px', imageBorder: 'none', stripeA: '#E3EAF3', stripeB: '#D9E2EE',
    swatches: ['#F6F8FB', '#FFFFFF', '#14243B', '#1F5FAE', '#2FA39A'],
    sample: 'Trips planned end to end', brand: 'Wanderly Travel', suits: 'Travel, co-ops, services',
  },
  'tech-dark': {
    bg: '#0C0F14', text: '#EEF2F7', primary: '#5B8CFF', onPrimary: '#0C0F14',
    headingFont: 'var(--font-sora), sans-serif', bodyFont: 'var(--font-inter), sans-serif',
    headingSize: 22, headingTracking: '-0.03em', uppercase: false, cta: 'Pre-order',
    buttonRadius: '10px', imageRadius: '18px', imageBorder: '1px solid #263040', stripeA: '#151A22', stripeB: '#1B212B',
    swatches: ['#0C0F14', '#151A22', '#EEF2F7', '#5B8CFF', '#39E0C5'],
    sample: 'The new X2 is here', brand: 'Volt Supply', suits: 'Gadgets, apps',
  },
  'soft-studio': {
    bg: '#FBF0EE', text: '#3A2E33', primary: '#B5677A', onPrimary: '#FFFFFF',
    headingFont: 'var(--font-playfair), serif', bodyFont: 'var(--font-nunito-sans), sans-serif',
    headingSize: 24, headingTracking: '-0.01em', uppercase: false, cta: 'Book',
    buttonRadius: '999px', imageRadius: '999px 999px 20px 20px', imageBorder: 'none', stripeA: '#F1DDD9', stripeB: '#EBD3CF',
    swatches: ['#FBF6F4', '#FFFFFF', '#3A2E33', '#B5677A', '#A9B8A0'],
    sample: 'Slow down, glow up', brand: 'Bloom Rituals', suits: 'Beauty, wellness, events',
  },
};
