import crypto from "node:crypto";
import type { FeedCachePayload, FeedPageCachePayload, FeedTab } from "@/lib/feed/types";
import { runRedisCommand } from "@/lib/redis";

const FEED_CACHE_TTL_SECONDS = 300;
const FEED_CACHE_STALE_MS = 2 * 60 * 1000;
const FEED_CACHE_PREFIX = "feed:user";
const FEED_LOCK_TTL_SECONDS = 15;

function getResolvedUserId(userId: string | null): string {
  return userId ?? "anon";
}

export function getFeedRankedCacheKey(userId: string | null, tab: FeedTab = "foryou"): string {
  const suffix = tab === "following" ? ":following" : "";
  return `${FEED_CACHE_PREFIX}:${getResolvedUserId(userId)}${suffix}`;
}

export function getFeedPageCacheKey(userId: string | null, page: number, tab: FeedTab = "foryou"): string {
  const suffix = tab === "following" ? ":following" : "";
  return `${FEED_CACHE_PREFIX}:${getResolvedUserId(userId)}${suffix}:page:${page}`;
}

function getFeedLockKey(userId: string | null, tab: FeedTab = "foryou"): string {
  const suffix = tab === "following" ? ":following" : "";
  return `${FEED_CACHE_PREFIX}:${getResolvedUserId(userId)}${suffix}:recompute:lock`;
}

export async function getFeedCache(userId: string | null, tab: FeedTab = "foryou"): Promise<FeedCachePayload | null> {
  try {
    const raw = await runRedisCommand(["GET", getFeedRankedCacheKey(userId, tab)]);
    if (typeof raw !== "string") {
      return null;
    }

    const parsed = JSON.parse(raw) as FeedCachePayload;
    if (!Array.isArray(parsed.postIds) || typeof parsed.computedAt !== "number") {
      return null;
    }

    return parsed;
  } catch (error) {
    console.error("Failed to read feed cache:", error);
    return null;
  }
}

export async function setFeedCache(userId: string | null, payload: FeedCachePayload, tab: FeedTab = "foryou"): Promise<void> {
  try {
    await runRedisCommand([
      "SET",
      getFeedRankedCacheKey(userId, tab),
      JSON.stringify(payload),
      "EX",
      FEED_CACHE_TTL_SECONDS,
    ]);
  } catch (error) {
    console.error("Failed to write feed cache:", error);
  }
}

export async function getFeedPageCache(
  userId: string | null,
  page: number,
  tab: FeedTab = "foryou"
): Promise<FeedPageCachePayload | null> {
  try {
    const raw = await runRedisCommand(["GET", getFeedPageCacheKey(userId, page, tab)]);
    if (typeof raw !== "string") {
      return null;
    }

    const parsed = JSON.parse(raw) as FeedPageCachePayload;
    if (
      !Array.isArray(parsed.postIds) ||
      typeof parsed.computedAt !== "number" ||
      typeof parsed.hasMore !== "boolean" ||
      typeof parsed.limit !== "number"
    ) {
      return null;
    }

    return parsed;
  } catch (error) {
    console.error("Failed to read feed page cache:", error);
    return null;
  }
}

export async function setFeedPageCache(
  userId: string | null,
  page: number,
  payload: FeedPageCachePayload,
  tab: FeedTab = "foryou"
): Promise<void> {
  try {
    await runRedisCommand([
      "SET",
      getFeedPageCacheKey(userId, page, tab),
      JSON.stringify(payload),
      "EX",
      FEED_CACHE_TTL_SECONDS,
    ]);
  } catch (error) {
    console.error("Failed to write feed page cache:", error);
  }
}

export async function deleteFeedCache(userId: string | null): Promise<void> {
  try {
    const resolvedUserId = getResolvedUserId(userId);
    const patterns = [
      `${FEED_CACHE_PREFIX}:${resolvedUserId}:page:*`,
      `${FEED_CACHE_PREFIX}:${resolvedUserId}:following:page:*`,
    ];
    const keysRaw = await Promise.all(
      patterns.map((pattern) => runRedisCommand(["KEYS", pattern]))
    );
    const keys = keysRaw.flat().filter((key): key is string => typeof key === "string");
    const commands: Array<Array<string | number>> = [
      ["DEL", getFeedRankedCacheKey(userId)],
      ["DEL", getFeedRankedCacheKey(userId, "following")],
    ];

    keys.forEach((key) => {
      commands.push(["DEL", key]);
    });

    await Promise.all(commands.map((command) => runRedisCommand(command)));
  } catch (error) {
    console.error("Failed to delete feed cache:", error);
  }
}

export function isFeedCacheStale(payload: FeedCachePayload): boolean {
  return Date.now() - payload.computedAt > FEED_CACHE_STALE_MS;
}

export interface FeedRecomputeLock {
  key: string;
  token: string;
}

export async function tryAcquireFeedRecomputeLock(userId: string | null, tab: FeedTab = "foryou"): Promise<FeedRecomputeLock | null> {
  try {
    const key = getFeedLockKey(userId, tab);
    const token = crypto.randomUUID();
    const result = await runRedisCommand(["SET", key, token, "EX", FEED_LOCK_TTL_SECONDS, "NX"]);

    if (result !== "OK") {
      return null;
    }

    return { key, token };
  } catch (error) {
    console.error("Failed to acquire feed recompute lock:", error);
    return null;
  }
}

export async function releaseFeedRecomputeLock(lock: FeedRecomputeLock): Promise<void> {
  try {
    const currentToken = await runRedisCommand(["GET", lock.key]);
    if (currentToken === lock.token) {
      await runRedisCommand(["DEL", lock.key]);
    }
  } catch (error) {
    console.error("Failed to release feed recompute lock:", error);
  }
}
