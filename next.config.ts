import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The designer has no server-only routes, so emit a portable static site.
  // This gives Vercel (and any other static host) a real index.html entrypoint.
  output: 'export',
};

export default nextConfig;
