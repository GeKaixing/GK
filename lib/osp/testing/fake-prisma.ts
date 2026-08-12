import { vi } from "vitest";
import { keyPairFromSecret } from "../keys";

/**
 * Shared test harness for lib/osp DB-backed modules.
 *
 * `prisma` is mocked at the module boundary (vi.mock("@/lib/prisma")). Because
 * vi.mock factories are hoisted above imports, each test file creates the mock
 * db object inside `vi.hoisted` (which may not reference imported bindings), so
 * this factory is self-contained. The `configureOspStores` helper below — run
 * in the TEST BODY, after imports — wires up stateful in-memory stores for the
 * mocks.
 */

/** model name -> method name -> vi.fn(). Loosely typed for test ergonomics. */
export type MockDb = Record<string, Record<string, any>>;

/** Create a prisma mock with vi.fn() methods for the OSP models. For vi.hoisted. */
export function createFakePrisma(mockDb: MockDb): unknown {
  return {
    country: mockDb.country,
    actor: mockDb.actor,
    passport: mockDb.passport,
    ospEvent: mockDb.ospEvent,
    capability: mockDb.capability,
    user: mockDb.user,
    $transaction: async (fn: (tx: Record<string, unknown>) => Promise<unknown>) =>
      fn({
        country: mockDb.country,
        actor: mockDb.actor,
        passport: mockDb.passport,
        ospEvent: mockDb.ospEvent,
        capability: mockDb.capability,
        user: mockDb.user,
      }),
  };
}

/** A plain mockDb with vi.fn() under each model's methods. */
export function blankMockDb(): MockDb {
  const mk = (names: string[]) =>
    Object.fromEntries(names.map((n) => [n, vi.fn()])) as Record<string, ReturnType<typeof vi.fn>>;
  return {
    country: mk(["findUnique", "create"]),
    actor: mk(["findUnique", "upsert", "create"]),
    passport: mk(["findUnique", "create", "update"]),
    ospEvent: mk(["findFirst", "create", "findMany", "count"]),
    capability: mk(["findUnique", "create", "update", "findMany"]),
    user: mk(["findUnique"]),
  };
}

/** In-memory stores backing the stateful mock implementations. */
export interface OspStores {
  passports: Record<string, any>[];
  capabilities: Record<string, any>[];
  events: Record<string, any>[];
}

/**
 * Configure stateful in-memory behavior on a blank mockDb so OSP helpers behave
 * like a real DB. Returns the stores for assertions.
 */
export function configureOspStores(mockDb: MockDb, secret: string): OspStores {
  const stores: OspStores = { passports: [], capabilities: [], events: [] };

  const publicKey = keyPairFromSecret(Buffer.from(secret, "hex"), ["country", "root"]).publicKeyB64;

  mockDb.country.findUnique.mockResolvedValue({ id: "gkx", name: "Gekaixing", publicKey });
  mockDb.country.create.mockImplementation(({ data }: any) => ({ ...data }));

  mockDb.actor.upsert.mockImplementation(({ where, create }: any) => {
    const found =
      stores.passports.length === 0 &&
      mockDb.actor.findUnique === undefined
        ? null
        : null;
    void found;
    return { id: create?.id ?? "actor-uuid", userId: create?.userId ?? null, createdAt: new Date(), updatedAt: new Date() };
  });
  mockDb.actor.findUnique.mockImplementation(({ where }: any) => {
    if (where.userId !== undefined) {
      return { id: "actor-uuid", userId: where.userId, createdAt: new Date(), updatedAt: new Date() };
    }
    return null;
  });

  mockDb.passport.findUnique.mockImplementation(({ where }: any) => {
    const actorId = where.countryId_actorId?.actorId ?? where.actorId;
    return stores.passports.find((p) => p.actorId === actorId) ?? null;
  });
  mockDb.passport.create.mockImplementation(({ data }: any) => {
    const row = { ...data, id: data.id, createdAt: new Date(), updatedAt: new Date() };
    stores.passports.push(row);
    return row;
  });
  mockDb.passport.update.mockImplementation(({ where, data }: any) => {
    const row = stores.passports.find((p) => p.id === where.id);
    if (!row) throw new Error("passport not found");
    Object.assign(row, data);
    return row;
  });

  mockDb.capability.findUnique.mockImplementation(({ where }: any) => {
    const key = where.actorId_capabilityType;
    return (
      stores.capabilities.find(
        (c) => c.actorId === key.actorId && c.capabilityType === key.capabilityType
      ) ?? null
    );
  });
  mockDb.capability.create.mockImplementation(({ data }: any) => {
    const row = { ...data, id: `cap_${stores.capabilities.length + 1}`, createdAt: new Date(), updatedAt: new Date() };
    stores.capabilities.push(row);
    return row;
  });
  mockDb.capability.update.mockImplementation(({ where, data }: any) => {
    const row = stores.capabilities.find((c) => c.id === where.id);
    if (!row) throw new Error("capability not found");
    Object.assign(row, data);
    return row;
  });
  mockDb.capability.findMany.mockImplementation(({ where }: any) =>
    stores.capabilities.filter((c) => c.actorId === where.actorId)
  );

  mockDb.user.findUnique.mockImplementation(({ where }: any) => ({
    id: where.id,
    role: "STANDARD",
  }));

  mockDb.ospEvent.findFirst.mockImplementation(({ where }: any) => {
    const rows = stores.events.filter((e) => e.actorId === where.actorId);
    return rows[rows.length - 1] ?? null;
  });
  mockDb.ospEvent.create.mockImplementation(({ data }: any) => {
    const row = {
      ...data,
      id: `ev_${data.seq}`,
      createdAt: new Date("2026-08-12T00:00:00Z"),
      globalSeq: BigInt(stores.events.length + 1),
    };
    stores.events.push(row);
    return row;
  });
  mockDb.ospEvent.findMany.mockImplementation(() => [...stores.events]);
  mockDb.ospEvent.count.mockImplementation(({ where }: any) =>
    stores.events.filter((e) => e.actorId === where.actorId && e.eventType === where.eventType).length
  );

  return stores;
}
