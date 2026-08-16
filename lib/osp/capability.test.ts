import { beforeEach, describe, expect, it, vi } from "vitest";
import { CapabilityState, CapabilityType, OspEventType, UserRole } from "@/generated/prisma/enums";
import {
  checkCapability,
  grantCapability,
  listCapabilities,
  revokeCapability,
  seedDefaultCapabilities,
} from "./capability";
import { configureOspStores, type MockDb } from "./testing/fake-prisma";

const TEST_SECRET =
  "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6";

const { fakePrisma, mockDb } = vi.hoisted(() => {
  const mk = (names: string[]) =>
    Object.fromEntries(names.map((n) => [n, vi.fn()])) as Record<string, ReturnType<typeof vi.fn>>;
  const mockDb: MockDb = {
    country: mk(["findUnique", "create"]),
    actor: mk(["findUnique", "upsert", "create"]),
    passport: mk(["findUnique", "create", "update"]),
    ospEvent: mk(["findFirst", "create", "findMany", "count"]),
    capability: mk(["findUnique", "create", "update", "findMany"]),
    user: mk(["findUnique"]),
  };
  const prisma = {
    country: mockDb.country,
    actor: mockDb.actor,
    passport: mockDb.passport,
    ospEvent: mockDb.ospEvent,
    capability: mockDb.capability,
    user: mockDb.user,
    $transaction: async (fn: (tx: Record<string, unknown>) => Promise<unknown>) =>
      fn(mockDb),
  };
  return { fakePrisma: prisma, mockDb };
});

vi.mock("@/lib/prisma", () => ({ prisma: fakePrisma }));

let stores: ReturnType<typeof configureOspStores>;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.OSP_COUNTRY_SECRET = TEST_SECRET;
  stores = configureOspStores(mockDb, TEST_SECRET);
});

const ACTOR = "actor-1";

describe("grantCapability / checkCapability", () => {
  it("grants then checks a capability", async () => {
    await grantCapability(ACTOR, CapabilityType.CREATE_POST);
    expect(await checkCapability(ACTOR, CapabilityType.CREATE_POST)).toBe(true);
  });

  it("reports false for an un-granted capability", async () => {
    expect(await checkCapability(ACTOR, CapabilityType.MODERATE)).toBe(false);
  });

  it("respects expiration", async () => {
    await grantCapability(ACTOR, CapabilityType.SEARCH, {
      expiresAt: new Date(Date.now() - 1000),
    });
    expect(await checkCapability(ACTOR, CapabilityType.SEARCH)).toBe(false);
  });

  it("is idempotent: re-granting an active capability records no new event", async () => {
    await grantCapability(ACTOR, CapabilityType.SEARCH);
    const grantedEvents = () =>
      stores.events.filter(
        (e) => e.eventType === OspEventType.CAPABILITY_GRANTED
      ).length;

    expect(grantedEvents()).toBe(1);
    await grantCapability(ACTOR, CapabilityType.SEARCH);
    expect(grantedEvents()).toBe(1);
  });
});

describe("revokeCapability", () => {
  it("revokes and records a CAPABILITY_REVOKED event", async () => {
    await grantCapability(ACTOR, CapabilityType.CREATE_POST);
    await revokeCapability(ACTOR, CapabilityType.CREATE_POST);

    expect(await checkCapability(ACTOR, CapabilityType.CREATE_POST)).toBe(false);
    expect(
      stores.events.some((e) => e.eventType === OspEventType.CAPABILITY_REVOKED)
    ).toBe(true);
  });
});

describe("seedDefaultCapabilities", () => {
  it("grants CREATE_POST + SEARCH for STANDARD users", async () => {
    await seedDefaultCapabilities(ACTOR, UserRole.STANDARD);
    expect(await checkCapability(ACTOR, CapabilityType.CREATE_POST)).toBe(true);
    expect(await checkCapability(ACTOR, CapabilityType.SEARCH)).toBe(true);
    expect(await checkCapability(ACTOR, CapabilityType.MODERATE)).toBe(false);
  });

  it("adds MODERATE for ADMIN users", async () => {
    await seedDefaultCapabilities(ACTOR, UserRole.ADMIN);
    expect(await checkCapability(ACTOR, CapabilityType.MODERATE)).toBe(true);
  });

  it("lists granted capabilities", async () => {
    await seedDefaultCapabilities(ACTOR, UserRole.STANDARD);
    const caps = await listCapabilities(ACTOR);
    expect(caps.length).toBe(2);
    expect(caps.every((c) => c.state === CapabilityState.GRANTED)).toBe(true);
  });
});
