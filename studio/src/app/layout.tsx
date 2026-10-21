import type { Metadata, Viewport } from 'next';
import { JetBrains_Mono, Space_Grotesk } from 'next/font/google';
import { THEME_INIT_SCRIPT } from '@/lib/constants';
import './globals.css';

const spaceGrotesk = Space_Grotesk({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-space-grotesk' });
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-jetbrains-mono' });

/*
 * Fonts for generated sites and preset thumbnails load from Google Fonts in the
 * browser rather than through next/font: fetching nine families at build time
 * made the build depend on what Google served the build machine (one variable
 * font broke the Vercel build). Their CSS variables are set in globals.css.
 * Each page asks for only the ones it shows (components/site-fonts.tsx).
 */

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
      </head>
      <body>{children}</body>
    </html>
  );
}
