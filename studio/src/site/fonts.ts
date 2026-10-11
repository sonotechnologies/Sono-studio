/** Google Fonts families (with the weights the sections use) for every font a theme can pick. */
export const GOOGLE_FONTS: Record<string, string> = {
  Anton: 'Anton',
  'Cormorant Garamond': 'Cormorant+Garamond:wght@500;600',
  'DM Sans': 'DM+Sans:wght@400;500;700',
  Fraunces: 'Fraunces:wght@500;600',
  Inter: 'Inter:wght@400;500;600',
  Manrope: 'Manrope:wght@400;500;700',
  'Nunito Sans': 'Nunito+Sans:wght@400;600;700',
  'Playfair Display': 'Playfair+Display:wght@500',
  Sora: 'Sora:wght@600',
  'Space Grotesk': 'Space+Grotesk:wght@400;500;600;700',
};

export function googleFontsHref(names: string[]): string {
  const families = [...new Set(names)].filter((n) => GOOGLE_FONTS[n]).map((n) => `family=${GOOGLE_FONTS[n]}`);
  return `https://fonts.googleapis.com/css2?${families.join('&')}&display=swap`;
}
