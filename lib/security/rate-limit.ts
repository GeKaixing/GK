import { prisma } from "@/lib/prisma";

export type RateLimitConfig = {
  limit: number;
  windowMs: number;
};

export type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
};

function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  const ip = forwardedFor?.split(",", 1)[0]?.trim() || realIp?.trim();

  return ip || "unknown";
}

export function getRateLimitKeys(request: Request, scope: string, identifier?: string): string[] {
  const ip = getClientIp(request);
  const normalizedIdentifier = identifier?.trim().toLowerCase();
  const keys = [`${scope}:ip:${ip}`];

  if (normalizedIdentifier) {
    keys.push(`${scope}:identifier:${normalizedIdentifier}`);
  }

  return keys;
}

export async function checkRateLimit(
  key: string,
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  const windowSeconds = Math.ceil(config.windowMs / 1000);

  const rows = await prisma.$queryRaw<{ count: number; window_start: Date }[]>`
    INSERT INTO "RateLimitBucket" ("key", "count", "window_start")
    VALUES (${key}, 1, NOW())
    ON CONFLICT ("key") DO UPDATE
    SET
      "count" = CASE
        WHEN "RateLimitBucket"."window_start" <= NOW() - (${windowSeconds} * INTERVAL '1 second')
          THEN 1
        ELSE "RateLimitBucket"."count" + 1
      END,
      "window_start" = CASE
        WHEN "RateLimitBucket"."window_start" <= NOW() - (${windowSeconds} * INTERVAL '1 second')
          THEN NOW()
        ELSE "RateLimitBucket"."window_start"
      END
    RETURNING "count", "window_start"
  `;

  const bucket = rows[0];
  if (!bucket) {
    throw new Error("Rate limit bucket was not returned");
  }

  const elapsedMs = Date.now() - bucket.window_start.getTime();
  const retryAfterSeconds = Math.max(1, Math.ceil((config.windowMs - elapsedMs) / 1000));

  return {
    allowed: bucket.count <= config.limit,
    retryAfterSeconds,
  };
}

export async function enforceRateLimit(
  request: Request,
  scope: string,
  identifier: string | undefined,
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  const results = await Promise.all(
    getRateLimitKeys(request, scope, identifier).map((key) => checkRateLimit(key, config)),
  );

  const blocked = results.find((result) => !result.allowed);
  return blocked ?? { allowed: true, retryAfterSeconds: 0 };
}
