import { beforeEach, describe, expect, it, vi } from "vitest";

const { fakePrisma, mockDb } = vi.hoisted(() => {
  const follow = { findMany: vi.fn() };
  const post = { findMany: vi.fn() };
  return { fakePrisma: { follow, post }, mockDb: { follow, post } };
});

vi.mock("@/lib/prisma", () => ({ prisma: fakePrisma }));

import { FollowingProvider } from "./following";
import { getFeedProvider, listFeedProviders } from "./registry";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("registry", () => {
  it("registers the built-in foryou and following providers", () => {
    const ids = listFeedProviders()
      .map((p) => p.id)
      .sort();
    expect(ids).toEqual(["following", "foryou"]);
  });

  it("falls back to foryou for an unknown or missing id", () => {
    expect(getFeedProvider("bogus").id).toBe("foryou");
    expect(getFeedProvider(null).id).toBe("foryou");
    expect(getFeedProvider(undefined).id).toBe("foryou");
  });

  it("exposes transparency declarations (RFC-014)", () => {
    const foryou = listFeedProviders().find((p) => p.id === "foryou")!;
    expect(foryou.dataSources.length).toBeGreaterThan(0);
    expect(foryou.rankingSignals.length).toBeGreaterThan(0);
    expect(foryou.policies).toContain("diversity_rerank");
  });
});

describe("FollowingProvider", () => {
  it("returns reverse-chronological posts from followed authors", async () => {
    mockDb.follow.findMany.mockResolvedValue([{ followingId: "u2" }, { followingId: "u3" }]);
    mockDb.post.findMany.mockResolvedValue([
      { id: "p3", createdAt: new Date("2026-08-12T03:00:00Z") },
      { id: "p1", createdAt: new Date("2026-08-12T01:00:00Z") },
    ]);

    const ids = await FollowingProvider.compute("u1");
    expect(ids).toEqual(["p3", "p1"]);
  });

  it("returns [] for a guest or when following nobody", async () => {
    expect(await FollowingProvider.compute(null)).toEqual([]);

    mockDb.follow.findMany.mockResolvedValue([]);
    expect(await FollowingProvider.compute("u1")).toEqual([]);
  });
});
