import type { Metadata, Viewport } from 'next';
import {
  Anton,
  Cormorant_Garamond,
  DM_Sans,
  Fraunces,
  Inter,
  JetBrains_Mono,
  Manrope,
  Nunito_Sans,
  Playfair_Display,
  Sora,
  Space_Grotesk,
} from 'next/font/google';
import { THEME_INIT_SCRIPT } from '@/lib/constants';
import './globals.css';

const spaceGrotesk = Space_Grotesk({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-space-grotesk' });
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-jetbrains-mono' });

// Preset fonts appear only in site thumbnails, so they are not preloaded.
const fraunces = Fraunces({ subsets: ['latin'], preload: false, weight: '500', variable: '--font-fraunces' });
const cormorant = Cormorant_Garamond({ subsets: ['latin'], preload: false, weight: '500', variable: '--font-cormorant' });
const anton = Anton({ subsets: ['latin'], preload: false, weight: '400', variable: '--font-anton' });
const manrope = Manrope({ subsets: ['latin'], preload: false, weight: ['500', '700'], variable: '--font-manrope' });
const sora = Sora({ subsets: ['latin'], preload: false, weight: '600', variable: '--font-sora' });
const playfair = Playfair_Display({ subsets: ['latin'], preload: false, weight: '500', variable: '--font-playfair' });
const inter = Inter({ subsets: ['latin'], preload: false, weight: '400', variable: '--font-inter' });
const dmSans = DM_Sans({ subsets: ['latin'], preload: false, weight: '400', variable: '--font-dm-sans' });
const nunitoSans = Nunito_Sans({ subsets: ['latin'], preload: false, weight: '400', variable: '--font-nunito-sans' });

const fontVars = [
  spaceGrotesk, jetbrainsMono, fraunces, cormorant, anton, manrope, sora, playfair, inter, dmSans, nunitoSans,
]
  .map((f) => f.variable)
  .join(' ');

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
