import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
const nextConfig: NextConfig = {
  /* config options here */
  // node-postgres（pg）在 Cloudflare Workers 上通过 `pg-cloudflare` 的 socket 连接数据库。
  // 该包用条件导出：Node 下解析到 dist/empty.js，workerd 下解析到 dist/index.js。
  // Next 的构建 trace 只按 Node 条件追踪 empty.js，导致 OpenNext 打包时找不到
  // workerd 需要的 dist/index.js，这里把它显式加入 trace。
  outputFileTracingIncludes: {
    "/**": ["node_modules/pg-cloudflare/dist/**"],
  },
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
