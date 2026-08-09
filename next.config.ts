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
};

const withNextIntl = createNextIntlPlugin();
export default withNextIntl(nextConfig);
