/**
 * Cloudflare build wrapper.
 *
 * Next.js 16's `proxy.ts` (middleware) always runs on the Node.js runtime, and
 * OpenNext Cloudflare does not support Node.js middleware yet — it fails with
 * "Node.js middleware is not currently supported. Consider switching to Edge
 * Middleware.".
 *
 * To keep the Supabase auth proxy on Vercel while still building on Cloudflare,
 * this script temporarily moves `proxy.ts` aside, runs the OpenNext Cloudflare
 * build (which invokes `next build` without middleware), then restores the file.
 * Route protection is handled by the layout guards in `app/gekaixing/layout.tsx`
 * and `app/dashboard/layout.tsx` when the proxy is absent.
 */
import { spawnSync } from "node:child_process";
import { existsSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const proxyPath = join(root, "proxy.ts");
const backupPath = join(root, "proxy.ts.cf-backup");
const hasProxy = existsSync(proxyPath);

if (hasProxy) {
  console.log("[build:cloudflare] Moving proxy.ts aside (OpenNext Cloudflare does not support Node.js middleware).");
  renameSync(proxyPath, backupPath);
}

let exitCode = 1;
try {
  const result = spawnSync("npx", ["opennextjs-cloudflare", "build"], {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });
  exitCode = result.status ?? 1;
} finally {
  if (hasProxy) {
    console.log("[build:cloudflare] Restoring proxy.ts.");
    renameSync(backupPath, proxyPath);
  }
}

process.exit(exitCode);
