import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Studio, client admin and pitch pages can only be framed by the studio itself (its previews and
  // thumbnails), so no other site can overlay them and trick a click.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
  // No deploymentId here: with Turbopack it adds a ?dpl= query to next/font's Google font files and the
  // build fails ("next/font/google queries have exactly one entry"). A page left open across a deploy
  // reloads itself through app/global-error.tsx instead.
};

export default nextConfig;
