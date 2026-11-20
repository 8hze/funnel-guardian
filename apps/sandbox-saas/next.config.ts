import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: [
    '@funnel-guardian/triage-gate',
    '@funnel-guardian/orchestrator',
    '@funnel-guardian/probe',
  ],
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
