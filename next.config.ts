import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
const nextConfig: NextConfig = {
  /* config options here */
  images: {
    remotePatterns: [
       {
        protocol: "https",
        hostname: "dlfxwtoaauuoithhcpcz.supabase.co",
      },
      {
        protocol: "https",
        hostname: "**", // 允许所有 https 域名
      },
      {
        protocol: "http",
        hostname: "**", // 允许所有 http 域名
      },
    ],
  },
  // OSP RFC-009 discovery: App Router ignores dot-prefixed folders (.well-known),
  // so route the well-known document through a rewrite.
  async rewrites() {
    return [
      {
        source: "/.well-known/osp",
        destination: "/well-known/osp",
      },
    ];
  },
};

const withNextIntl = createNextIntlPlugin();
export default withNextIntl(nextConfig);
