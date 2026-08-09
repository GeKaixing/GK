/**
 * Shared Upstash Redis REST cache helpers.
 *
 * Used by the feed cache (lib/feed/cache.ts) and the right-rail sidebar
 * endpoints (Trending news, Who-to-follow). Every helper degrades to a no-op
 * when `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` are absent, so
 * callers keep working on deployments without Redis.
 */

export const DEFAULT_CACHE_TTL_SECONDS = 300;

function getRedisConfig(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    return null;
  }

  return { url, token };
}

export async function runRedisCommand(command: Array<string | number>): Promise<unknown> {
  const config = getRedisConfig();
  if (!config) {
    return null;
  }

  const response = await fetch(config.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Redis command failed with status ${response.status}`);
  }

  const payload = (await response.json()) as { result?: unknown; error?: string };
  if (payload.error) {
    throw new Error(payload.error);
  }

  return payload.result ?? null;
}

/** Read a JSON value stored with `setCachedJson`. Returns null on miss/error. */
export async function getCachedJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await runRedisCommand(["GET", key]);
    if (typeof raw !== "string") {
      return null;
    }

    return JSON.parse(raw) as T;
  } catch (error) {
    console.error("Failed to read Redis cache:", error);
    return null;
  }
}

/** Store a JSON value with a TTL (seconds). No-op without Redis. */
export async function setCachedJson(
  key: string,
  value: unknown,
  ttlSeconds: number = DEFAULT_CACHE_TTL_SECONDS
): Promise<void> {
  try {
    await runRedisCommand(["SET", key, JSON.stringify(value), "EX", ttlSeconds]);
  } catch (error) {
    console.error("Failed to write Redis cache:", error);
  }
}
