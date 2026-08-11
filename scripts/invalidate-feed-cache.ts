/**
 * Invalidate all home-feed caches in Upstash so the next request recomputes
 * with the current ranking logic (e.g. after a recommendation-engine change).
 *
 * Run: npx tsx scripts/invalidate-feed-cache.ts
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.development.local" });

async function main() {
  const { runRedisCommand } = await import("@/lib/redis");

  const keys = (await runRedisCommand(["KEYS", "feed:user:*"])) as string[] | null;
  if (!keys || keys.length === 0) {
    console.log("No feed cache keys found.");
    return;
  }
  console.log(`Found ${keys.length} feed cache keys.`);
  await runRedisCommand(["DEL", ...keys]);
  console.log("Feed caches cleared — next request will recompute.");
}

main().catch((e) => {
  console.error("Failed:", e);
  process.exit(1);
});
