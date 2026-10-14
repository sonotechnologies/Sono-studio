import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // No deploymentId here: with Turbopack it adds a ?dpl= query to next/font's Google font files and the
  // build fails ("next/font/google queries have exactly one entry"). A page left open across a deploy
  // reloads itself through app/global-error.tsx instead.
};

export default nextConfig;
