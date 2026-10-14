import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Every push deploys a new version. A page still open from the previous one then does a full
  // reload when you click a link, instead of asking the new server for files it no longer has.
  deploymentId: process.env.VERCEL_DEPLOYMENT_ID || undefined,
};

export default nextConfig;
