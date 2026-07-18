import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["pino", "pino-pretty"],
  images: {
    // Add CDN / Supabase storage hosts here as needed, e.g.:
    // { protocol: 'https', hostname: '*.supabase.co' }
    remotePatterns: [],
  },
};

export default nextConfig;
