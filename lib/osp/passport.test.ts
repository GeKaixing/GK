import { beforeEach, describe, expect, it, vi } from "vitest";
import { OspEventType, PassportStatus } from "@/generated/prisma/enums";
import { ensureCitizen, issuePassport, revokePassport, verifyPassport } from "./passport";
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

describe("issuePassport / verifyPassport", () => {
  it("issues a passport whose signature verifies", async () => {
    const passport = await issuePassport("actor-1");
    expect(passport.publicKey).toBeTruthy();
    expect(passport.signature).toBeTruthy();
    expect(passport.status).toBe(PassportStatus.ACTIVE);
    expect(await verifyPassport(passport)).toBe(true);
  });

  it("rejects a tampered public key", async () => {
    const passport = await issuePassport("actor-1");
    passport.publicKey = "tampered";
    expect(await verifyPassport(passport)).toBe(false);
  });
});

describe("revokePassport", () => {
  it("marks the passport REVOKED and records a PASSPORT_REVOKED event", async () => {
    const passport = await issuePassport("actor-1");
    expect(await verifyPassport(passport)).toBe(true);

    const revoked = await revokePassport("actor-1");
    expect(revoked?.status).toBe(PassportStatus.REVOKED);
    expect(await verifyPassport(revoked!)).toBe(false);

    expect(
      stores.events.some((e) => e.eventType === OspEventType.PASSPORT_REVOKED)
    ).toBe(true);
  });
});

describe("ensureCitizen", () => {
  it("creates an actor, passport, capabilities and lifecycle events", async () => {
    const { actor, passport } = await ensureCitizen("user-1");

    expect(actor.userId).toBe("user-1");
    expect(passport.actorId).toBe(actor.id);
    expect(stores.passports.length).toBe(1);
    expect(stores.capabilities.length).toBe(2); // CREATE_POST + SEARCH

    const types = stores.events.map((e) => e.eventType);
    expect(types).toContain(OspEventType.ACTOR_CREATED);
    expect(types).toContain(OspEventType.PASSPORT_ISSUED);
    expect(types).toContain(OspEventType.CAPABILITY_GRANTED);
  });

  it("is idempotent: a second call reuses the passport and records no duplicate events", async () => {
    await ensureCitizen("user-1");
    const first = { passports: stores.passports.length, issued: eventCount(OspEventType.PASSPORT_ISSUED) };

    await ensureCitizen("user-1");

    expect(stores.passports.length).toBe(first.passports);
    expect(eventCount(OspEventType.PASSPORT_ISSUED)).toBe(first.issued);
    expect(eventCount(OspEventType.ACTOR_CREATED)).toBe(1);
  });

  function eventCount(type: OspEventType): number {
    return stores.events.filter((e) => e.eventType === type).length;
  }
});
