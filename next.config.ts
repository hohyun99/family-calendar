import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',
  basePath: '/family-calendar',
  images: { unoptimized: true },
};

export default nextConfig;
