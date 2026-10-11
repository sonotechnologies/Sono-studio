import type { Metadata, Viewport } from 'next';
import { JetBrains_Mono, Space_Grotesk } from 'next/font/google';
import { THEME_INIT_SCRIPT } from '@/lib/constants';
import { GOOGLE_FONTS, googleFontsHref } from '@/site/fonts';
import './globals.css';

const spaceGrotesk = Space_Grotesk({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-space-grotesk' });
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-jetbrains-mono' });

/*
 * Fonts for generated sites and preset thumbnails load from Google Fonts in the
 * browser rather than through next/font: fetching nine families at build time
 * made the build depend on what Google served the build machine (one variable
 * font broke the Vercel build). Their CSS variables are set in globals.css.
 */
// Space Grotesk comes from next/font above.
const PRESET_FONTS_CSS = googleFontsHref(Object.keys(GOOGLE_FONTS).filter((f) => f !== 'Space Grotesk'));

const fontVars = `${spaceGrotesk.variable} ${jetbrainsMono.variable}`;

export const metadata: Metadata = {
  title: { default: 'Sono Studio', template: '%s · Sono Studio' },
  icons: { icon: '/logo/sono-favicon.svg' },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F7F5F1' },
    { media: '(prefers-color-scheme: dark)', color: '#16140F' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={fontVars} suppressHydrationWarning>
      <head>
        {/* Sets data-theme before first paint so there is no flash of the wrong theme. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href={PRESET_FONTS_CSS} />
      </head>
      <body>{children}</body>
    </html>
  );
}
