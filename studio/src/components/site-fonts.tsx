import { GOOGLE_FONTS, googleFontsHref } from '@/site/fonts';

/** Every font a site can use (Space Grotesk comes from next/font), for pages that show many styles. */
const ALL = googleFontsHref(Object.keys(GOOGLE_FONTS).filter((f) => f !== 'Space Grotesk'));

/**
 * The Google Fonts stylesheet a page needs: just a site's own two fonts where
 * one site is shown, or all of them where styles are picked. React puts it in
 * the head once, however many times it's rendered.
 */
export function SiteFonts({ fonts }: { fonts?: string[] }) {
  const href = fonts ? googleFontsHref(fonts.filter((f) => f !== 'Space Grotesk')) : ALL;
  if (!/family=/.test(href)) return null;
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link rel="stylesheet" href={href} precedence="default" />
    </>
  );
}
