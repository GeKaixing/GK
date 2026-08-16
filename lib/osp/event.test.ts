import { beforeEach, describe, expect, it, vi } from "vitest";
import { OspEventType } from "@/generated/prisma/enums";
import { countrySign } from "./country";
import { verifyEventChain, recordOspEvent, verifyEvent } from "./event";
import { keyPairFromSecret } from "./keys";

const TEST_SECRET =
  "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6";

const { fakePrisma, mockDb } = vi.hoisted(() => {
  const mk = (names: string[]) =>
    Object.fromEntries(names.map((n) => [n, vi.fn()])) as Record<string, ReturnType<typeof vi.fn>>;
  const ospEvent = mk(["findFirst", "create", "findMany", "count"]);
  const country = mk(["findUnique", "create"]);
  const actor = mk(["findUnique", "upsert", "create"]);
  const passport = mk(["findUnique", "create", "update"]);
  const capability = mk(["findUnique", "create", "update"]);
  const user = mk(["findUnique"]);
  const prisma = {
    country,
    actor,
    passport,
    ospEvent,
    capability,
    user,
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ ospEvent, country, actor, passport, capability, user }),
  };
  return { fakePrisma: prisma, mockDb: { ospEvent, country, actor, passport, capability, user } };
});

vi.mock("@/lib/prisma", () => ({ prisma: fakePrisma }));

/** Wire the fake ospEvent store so recordOspEvent appends sequenced, hashed rows. */
function setupEventStore() {
  const rows: Record<string, any>[] = [];
  mockDb.ospEvent.findFirst.mockImplementation(({ where }: any) => {
    const actorRows = rows.filter((r) => r.actorId === where.actorId);
    return actorRows[actorRows.length - 1] ?? null;
  });
  mockDb.ospEvent.create.mockImplementation(({ data }: any) => {
    const row = {
      ...data,
      id: `ev_${data.seq}`,
      createdAt: new Date("2026-08-12T00:00:00Z"),
      globalSeq: BigInt(rows.length + 1),
    };
    rows.push(row);
    return row;
  });
  mockDb.ospEvent.findMany.mockImplementation(() => [...rows]);
  mockDb.country.findUnique.mockResolvedValue({
    id: "gkx",
    // getCountrySecret() hex-decodes the env secret; derive the public key the same way.
    publicKey: keyPairFromSecret(Buffer.from(TEST_SECRET, "hex"), ["country", "root"]).publicKeyB64,
  });
  return rows;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.OSP_COUNTRY_SECRET = TEST_SECRET;
});

describe("recordOspEvent", () => {
  it("appends sequenced, hash-chained, signed events per actor", async () => {
    const rows = setupEventStore();

    const first = await recordOspEvent({
      actorId: "actor-1",
      eventType: OspEventType.POST_CREATED,
      objectType: "post",
      objectId: "p1",
    });
    const second = await recordOspEvent({
      actorId: "actor-1",
      eventType: OspEventType.POST_LIKED,
      objectType: "post",
      objectId: "p2",
    });

    expect(first.seq).toBe(1);
    expect(first.prevHash).toBeNull();
    expect(second.seq).toBe(2);
    expect(second.prevHash).toBe(first.hash);
    expect(second.hash).not.toBe(first.hash);
    expect(second.signature).toBeTruthy();

    // Independent actors get independent sequences.
    const other = await recordOspEvent({ actorId: "actor-2", eventType: OspEventType.FOLLOWED });
    expect(other.seq).toBe(1);
    expect(rows.length).toBe(3);
  });
});

describe("verifyEvent", () => {
  it("verifies a valid event", async () => {
    setupEventStore();
    const row = await recordOspEvent({
      actorId: "actor-1",
      eventType: OspEventType.POST_CREATED,
      objectType: "post",
      objectId: "p1",
      payload: { data: "x" },
    });
    expect(await verifyEvent(row)).toBe(true);
  });

  it("rejects a tampered signature (foreign key)", async () => {
    setupEventStore();
    const row = await recordOspEvent({ actorId: "actor-1", eventType: OspEventType.FOLLOWED });
    const forged = countrySign("forged-payload");
    row.signature = forged;
    expect(await verifyEvent(row)).toBe(false);
  });
});

describe("verifyEventChain", () => {
  it("reports a valid chain", async () => {
    setupEventStore();
    await recordOspEvent({ actorId: "actor-1", eventType: OspEventType.ACTOR_CREATED });
    await recordOspEvent({ actorId: "actor-1", eventType: OspEventType.PASSPORT_ISSUED });
    await recordOspEvent({ actorId: "actor-1", eventType: OspEventType.POST_CREATED });

    const result = await verifyEventChain("actor-1");
    expect(result.valid).toBe(true);
    expect(result.count).toBe(3);
  });

  it("detects a broken prevHash link", async () => {
    const rows = setupEventStore();
    await recordOspEvent({ actorId: "actor-1", eventType: OspEventType.ACTOR_CREATED });
    await recordOspEvent({ actorId: "actor-1", eventType: OspEventType.PASSPORT_ISSUED });
    await recordOspEvent({ actorId: "actor-1", eventType: OspEventType.POST_CREATED });

    // Break the middle link: change the second event's prevHash.
    rows[1].prevHash = "0".repeat(64);
    const result = await verifyEventChain("actor-1");
    expect(result.valid).toBe(false);
    expect(result.brokenAtSeq).toBe(2);
  });

  it("detects a tampered hash column", async () => {
    const rows = setupEventStore();
    await recordOspEvent({ actorId: "actor-1", eventType: OspEventType.ACTOR_CREATED });
    await recordOspEvent({ actorId: "actor-1", eventType: OspEventType.POST_CREATED });

    rows[0].hash = "0".repeat(64);
    const result = await verifyEventChain("actor-1");
    expect(result.valid).toBe(false);
    expect(result.brokenAtSeq).toBe(1);
  });

  it("detects a tampered payload", async () => {
    const rows = setupEventStore();
    await recordOspEvent({ actorId: "actor-1", eventType: OspEventType.ACTOR_CREATED });
    await recordOspEvent({ actorId: "actor-1", eventType: OspEventType.POST_CREATED });

    rows[0].payload = '{"evil":true}';
    const result = await verifyEventChain("actor-1");
    expect(result.valid).toBe(false);
    expect(result.brokenAtSeq).toBe(1);
  });

  it("treats an empty chain as valid", async () => {
    setupEventStore();
    const result = await verifyEventChain("actor-ghost");
    expect(result.valid).toBe(true);
    expect(result.count).toBe(0);
  });
});
