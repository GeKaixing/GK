import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { FedInboundStatus, OspEventType, RecognitionState } from "@/generated/prisma/enums";
import { canonicalize, keyPairFromSecret, signPayload } from "./keys";
import {
  buildWellKnown,
  deliverPending,
  enqueueFederationDelivery,
  enqueueTargetedDelivery,
  fetchCountryWellKnown,
  followRemote,
  getRecognition,
  getRemoteFollowerCount,
  getRemoteLikeCount,
  handleInboundFederation,
  isFollowingRemote,
  isAdmitting,
  isRemoteLiked,
  sanitizeFederatedContent,
  setRecognition,
  unfollowRemote,
  type FedEnvelope,
} from "./federation";

const SECRET =
  "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6";
const REMOTE_COUNTRY = "other";
const REMOTE_PUBLIC_KEY = keyPairFromSecret(Buffer.from(SECRET, "hex"), ["remote", REMOTE_COUNTRY]).publicKeyB64;
const LOCAL_PUBLIC_KEY = keyPairFromSecret(Buffer.from(SECRET, "hex"), ["country", "root"]).publicKeyB64;

const { fakePrisma, mockDb } = vi.hoisted(() => {
  const mk = (names: string[]) =>
    Object.fromEntries(names.map((n) => [n, vi.fn()])) as Record<string, ReturnType<typeof vi.fn>>;
  const mockDb: Record<string, Record<string, any>> = {
    country: mk(["findUnique", "create"]),
    actor: mk(["findUnique", "upsert", "create"]),
    remoteCountry: mk(["findUnique", "findMany", "create", "upsert"]),
    recognition: mk(["findUnique", "upsert", "create"]),
    fedDelivery: mk(["findMany", "upsert", "create", "update"]),
    fedInbox: mk(["create", "update"]),
    fedObject: mk(["create"]),
    remoteActor: mk(["findUnique", "upsert", "create"]),
    remoteFollow: mk(["findUnique", "upsert", "deleteMany"]),
    remoteFollower: mk(["upsert", "deleteMany", "count"]),
    remoteLike: mk(["findFirst", "upsert", "deleteMany"]),
    remoteLikeInbound: mk(["upsert", "deleteMany", "count"]),
    ospEvent: mk(["findFirst", "create", "findMany", "count"]),
    post: mk(["findUnique"]),
  };
  (mockDb as any).$transaction = async (fn: any) =>
    fn({ ospEvent: mockDb.ospEvent, actor: mockDb.actor, country: mockDb.country });
  return { fakePrisma: mockDb, mockDb };
});

vi.mock("@/lib/prisma", () => ({ prisma: fakePrisma }));

/** Stateful in-memory stores wiring the mock DB. */
function setupStores() {
  const stores = {
    remoteCountries: [] as any[],
    recognitions: [] as any[],
    deliveries: [] as any[],
    inbox: [] as any[],
    objects: [] as any[],
    remoteActors: [] as any[],
    remoteFollows: [] as any[],
    remoteFollowers: [] as any[],
    remoteLikes: [] as any[],
    remoteLikeInbounds: [] as any[],
    events: [] as any[],
    posts: [] as any[],
  };

  mockDb.country.findUnique.mockResolvedValue({
    id: "gkx",
    name: "Gekaixing",
    publicKey: LOCAL_PUBLIC_KEY,
  });

  mockDb.remoteCountry.findUnique.mockImplementation(({ where }: any) =>
    stores.remoteCountries.find((r) => r.id === where.id) ?? null
  );
  mockDb.remoteCountry.findMany.mockImplementation(({ where }: any = {}) => {
    let rows = stores.remoteCountries;
    if (where?.recognitions?.some) {
      const { fromCountryId, state } = where.recognitions.some;
      // Unwrap Prisma's { in: [...] } operator.
      const states = state && typeof state === "object" && "in" in state
        ? (state as { in: RecognitionState[] }).in
        : Array.isArray(state)
          ? state
          : [state];
      const recognizedIds = new Set(
        stores.recognitions
          .filter((r) => r.fromCountryId === fromCountryId && states.includes(r.state))
          .map((r) => r.toCountryId)
      );
      rows = rows.filter((r) => recognizedIds.has(r.id));
    }
    return rows;
  });
  mockDb.remoteCountry.create.mockImplementation(({ data }: any) => {
    const row = { ...data, createdAt: new Date(), updatedAt: new Date() };
    stores.remoteCountries.push(row);
    return row;
  });

  mockDb.recognition.findUnique.mockImplementation(({ where }: any) =>
    stores.recognitions.find(
      (r) =>
        r.fromCountryId === where.fromCountryId_toCountryId.fromCountryId &&
        r.toCountryId === where.fromCountryId_toCountryId.toCountryId
    ) ?? null
  );
  mockDb.recognition.upsert.mockImplementation(({ where, create, update }: any) => {
    const key = where.fromCountryId_toCountryId;
    const existing = stores.recognitions.find(
      (r) => r.fromCountryId === key.fromCountryId && r.toCountryId === key.toCountryId
    );
    if (existing) {
      Object.assign(existing, update);
      return existing;
    }
    const row = { ...create, id: "rec_1", createdAt: new Date(), updatedAt: new Date() };
    stores.recognitions.push(row);
    return row;
  });

  mockDb.fedDelivery.findMany.mockImplementation(() =>
    stores.deliveries.map((d) => {
      const rc = stores.remoteCountries.find((r) => r.id === d.targetCountryId);
      return { ...d, remoteCountry: rc ?? null };
    })
  );
  mockDb.fedDelivery.upsert.mockImplementation(({ where, create }: any) => {
    const key = where.eventId_targetCountryId;
    const existing = stores.deliveries.find(
      (d) => d.eventId === key.eventId && d.targetCountryId === key.targetCountryId
    );
    if (existing) {
      return existing;
    }
    const row = {
      ...create,
      id: `del_${stores.deliveries.length + 1}`,
      status: "PENDING",
      attempts: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    stores.deliveries.push(row);
    return row;
  });
  mockDb.fedDelivery.update.mockImplementation(({ where, data }: any) => {
    const row = stores.deliveries.find((d) => d.id === where.id);
    if (!row) throw new Error("delivery not found");
    Object.assign(row, data);
    return row;
  });

  mockDb.fedInbox.create.mockImplementation(({ data }: any) => {
    const row = {
      ...data,
      id: `inbox_${stores.inbox.length + 1}`,
      receivedAt: new Date(),
      status: "RECEIVED",
    };
    stores.inbox.push(row);
    return row;
  });
  mockDb.fedInbox.update.mockImplementation(({ where, data }: any) => {
    const row = stores.inbox.find((i) => i.id === where.id);
    if (!row) throw new Error("inbox not found");
    Object.assign(row, data);
    return row;
  });

  mockDb.fedObject.create.mockImplementation(({ data }: any) => {
    const row = { ...data, id: `obj_${stores.objects.length + 1}` };
    stores.objects.push(row);
    return row;
  });

  mockDb.remoteActor.findUnique.mockImplementation(({ where }: any) =>
    stores.remoteActors.find(
      (a) => a.countryId === where.countryId_actorId.countryId && a.actorId === where.countryId_actorId.actorId
    ) ?? null
  );
  mockDb.remoteActor.upsert.mockImplementation(({ where, create }: any) => {
    const key = where.countryId_actorId;
    const existing = stores.remoteActors.find(
      (a) => a.countryId === key.countryId && a.actorId === key.actorId
    );
    if (existing) {
      return existing;
    }
    const row = { ...create, id: `ra_${stores.remoteActors.length + 1}` };
    stores.remoteActors.push(row);
    return row;
  });

  // Social-graph models (RFC-012)
  mockDb.actor.upsert.mockImplementation(({ create }: any) => ({
    id: create?.id ?? "actor-uuid",
    userId: create?.userId ?? "user-uuid",
    createdAt: new Date(),
    updatedAt: new Date(),
  }));
  mockDb.actor.findUnique.mockImplementation(({ where }: any) =>
    where.id ? { id: where.id, userId: "user-uuid" } : null
  );
  mockDb.post.findUnique.mockImplementation(({ where }: any) =>
    stores.posts.some((p) => p.id === where.id) ? { id: where.id } : null
  );

  mockDb.ospEvent.findFirst.mockImplementation(({ where }: any) => {
    const rows = stores.events.filter((e) => e.actorId === where.actorId);
    return rows[rows.length - 1] ?? null;
  });
  mockDb.ospEvent.create.mockImplementation(({ data }: any) => {
    const row = { ...data, id: `ev_${stores.events.length + 1}`, createdAt: new Date(), globalSeq: BigInt(stores.events.length + 1) };
    stores.events.push(row);
    return row;
  });

  mockDb.remoteFollow.findUnique.mockImplementation(({ where }: any) => {
    const key = where.userId_countryId_actorId;
    return stores.remoteFollows.find(
      (f) => f.userId === key.userId && f.countryId === key.countryId && f.actorId === key.actorId
    ) ?? null;
  });
  mockDb.remoteFollow.upsert.mockImplementation(({ where, create }: any) => {
    const key = where.userId_countryId_actorId;
    const existing = stores.remoteFollows.find(
      (f) => f.userId === key.userId && f.countryId === key.countryId && f.actorId === key.actorId
    );
    if (existing) return existing;
    const row = { ...create, id: `rf_${stores.remoteFollows.length + 1}` };
    stores.remoteFollows.push(row);
    return row;
  });
  mockDb.remoteFollow.deleteMany.mockImplementation(({ where }: any) => {
    const before = stores.remoteFollows.length;
    stores.remoteFollows = stores.remoteFollows.filter(
      (f) => !(f.userId === where.userId && f.countryId === where.countryId && f.actorId === where.actorId)
    );
    return { count: before - stores.remoteFollows.length };
  });

  mockDb.remoteFollower.upsert.mockImplementation(({ where, create }: any) => {
    const key = where.countryId_actorId_targetUserId;
    const existing = stores.remoteFollowers.find(
      (f) => f.countryId === key.countryId && f.actorId === key.actorId && f.targetUserId === key.targetUserId
    );
    if (existing) return existing;
    const row = { ...create, id: `rfol_${stores.remoteFollowers.length + 1}` };
    stores.remoteFollowers.push(row);
    return row;
  });
  mockDb.remoteFollower.deleteMany.mockImplementation(({ where }: any) => {
    const before = stores.remoteFollowers.length;
    stores.remoteFollowers = stores.remoteFollowers.filter(
      (f) => !(f.countryId === where.countryId && f.actorId === where.actorId && f.targetUserId === where.targetUserId)
    );
    return { count: before - stores.remoteFollowers.length };
  });
  mockDb.remoteFollower.count.mockImplementation(({ where }: any) =>
    stores.remoteFollowers.filter((f) => f.targetUserId === where.targetUserId).length
  );

  mockDb.remoteLike.findFirst.mockImplementation(({ where }: any) =>
    stores.remoteLikes.find(
      (l) => l.userId === where.userId && l.objectId === where.objectId
    ) ?? null
  );
  mockDb.remoteLike.upsert.mockImplementation(({ where, create }: any) => {
    const key = where.userId_countryId_actorId_objectId;
    const existing = stores.remoteLikes.find(
      (l) => l.userId === key.userId && l.countryId === key.countryId && l.actorId === key.actorId && l.objectId === key.objectId
    );
    if (existing) return existing;
    const row = { ...create, id: `rl_${stores.remoteLikes.length + 1}` };
    stores.remoteLikes.push(row);
    return row;
  });
  mockDb.remoteLike.deleteMany.mockImplementation(({ where }: any) => {
    const before = stores.remoteLikes.length;
    stores.remoteLikes = stores.remoteLikes.filter(
      (l) => !(l.userId === where.userId && l.objectId === where.objectId)
    );
    return { count: before - stores.remoteLikes.length };
  });

  mockDb.remoteLikeInbound.upsert.mockImplementation(({ where, create }: any) => {
    const key = where.sourceCountryId_sourceActorId_postId;
    const existing = stores.remoteLikeInbounds.find(
      (l) => l.sourceCountryId === key.sourceCountryId && l.sourceActorId === key.sourceActorId && l.postId === key.postId
    );
    if (existing) return existing;
    const row = { ...create, id: `rli_${stores.remoteLikeInbounds.length + 1}` };
    stores.remoteLikeInbounds.push(row);
    return row;
  });
  mockDb.remoteLikeInbound.deleteMany.mockImplementation(({ where }: any) => {
    const before = stores.remoteLikeInbounds.length;
    stores.remoteLikeInbounds = stores.remoteLikeInbounds.filter(
      (l) => !(l.sourceCountryId === where.sourceCountryId && l.sourceActorId === where.sourceActorId && l.postId === where.postId)
    );
    return { count: before - stores.remoteLikeInbounds.length };
  });
  mockDb.remoteLikeInbound.count.mockImplementation(({ where }: any) =>
    stores.remoteLikeInbounds.filter((l) => l.postId === where.postId).length
  );

  return stores;
}

/** Seed a peer country with a recognition state (id defaults to REMOTE_COUNTRY). */
function seedPeer(stores: any, state: RecognitionState, id = REMOTE_COUNTRY, publicKey = REMOTE_PUBLIC_KEY) {
  stores.remoteCountries.push({
    id,
    name: "Other",
    publicKey,
    federationEndpoint: "https://other.example",
    status: "ACTIVE",
  });
  if (state !== RecognitionState.UNKNOWN) {
    stores.recognitions.push({
      fromCountryId: "gkx",
      toCountryId: id,
      state,
    });
  }
}

/** Build a signed envelope from a payload using the REMOTE country key. */
function envelope(payload: Record<string, unknown>): FedEnvelope {
  return {
    country_id: REMOTE_COUNTRY,
    payload,
    signature: signPayload(Buffer.from(SECRET, "hex"), ["remote", REMOTE_COUNTRY], canonicalize(payload)),
  };
}

function contentPayload(overrides: Record<string, unknown> = {}) {
  return {
    event_id: "evt-1",
    event_type: OspEventType.POST_CREATED,
    actor: "actor-a",
    object: { type: "post", id: "post-1" },
    timestamp: "2026-08-12T00:00:00.000Z",
    seq: 1,
    prev_hash: null,
    country: REMOTE_COUNTRY,
    content: "<p>hello from the other side</p>",
    author: { name: "Alice", handle: "alice", avatar: null },
    visibility: "PUBLIC",
    ...overrides,
  };
}

let stores: ReturnType<typeof setupStores>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn());
  process.env.OSP_COUNTRY_SECRET = SECRET;
  stores = setupStores();
});

describe("sanitizeFederatedContent", () => {
  it("strips scripts, event handlers and javascript: URLs, keeps data-*", () => {
    const dirty =
      '<p onclick="alert(1)">hi <script>alert(2)</script></p>' +
      '<div data-youtube-embed="x"><img src="https://a.b/c.png" onerror="alert(3)"></div>' +
      '<a href="javascript:alert(4)">x</a>';
    const clean = sanitizeFederatedContent(dirty);
    expect(clean).not.toContain("<script");
    expect(clean).not.toContain("onclick");
    expect(clean).not.toContain("onerror");
    expect(clean).not.toContain("javascript:");
    expect(clean).toContain('data-youtube-embed="x"');
  });
});

describe("discovery", () => {
  it("builds our well-known document", async () => {
    const doc = await buildWellKnown();
    expect(doc.country_id).toBe("gkx");
    expect(doc.public_key).toBe(LOCAL_PUBLIC_KEY);
    expect(doc.protocol_version).toBe("osp/1");
  });

  it("fetches a peer well-known document", async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        country_id: REMOTE_COUNTRY,
        name: "Other",
        public_key: REMOTE_PUBLIC_KEY,
        federation_endpoint: "https://other.example",
      }),
    });
    const doc = await fetchCountryWellKnown("other.example");
    expect(doc.country_id).toBe(REMOTE_COUNTRY);
    expect(globalThis.fetch).toHaveBeenCalledWith("https://other.example/.well-known/osp", expect.anything());
  });

  it("throws on a malformed document", async () => {
    (globalThis.fetch as any).mockResolvedValue({ ok: true, json: async () => ({ foo: 1 }) });
    await expect(fetchCountryWellKnown("other.example")).rejects.toThrow(/Malformed/);
  });
});

describe("recognition", () => {
  it("defaults to UNKNOWN", async () => {
    expect(await getRecognition(REMOTE_COUNTRY)).toBe(RecognitionState.UNKNOWN);
  });

  it("sets and reads recognition", async () => {
    seedPeer(stores, RecognitionState.UNKNOWN);
    await setRecognition(REMOTE_COUNTRY, RecognitionState.RECOGNIZED);
    expect(await getRecognition(REMOTE_COUNTRY)).toBe(RecognitionState.RECOGNIZED);
  });

  it("isAdmitting admits only RECOGNIZED/TRUSTED", () => {
    expect(isAdmitting(RecognitionState.RECOGNIZED)).toBe(true);
    expect(isAdmitting(RecognitionState.TRUSTED)).toBe(true);
    expect(isAdmitting(RecognitionState.UNKNOWN)).toBe(false);
    expect(isAdmitting(RecognitionState.BLOCKED)).toBe(false);
  });
});

describe("enqueueFederationDelivery", () => {
  it("queues deliveries only for recognized peers", async () => {
    seedPeer(stores, RecognitionState.RECOGNIZED);
    seedPeer(stores, RecognitionState.BLOCKED, "other-blocked");

    const event = {
      eventId: "evt-1",
      eventType: OspEventType.POST_CREATED,
      actorId: "actor-a",
      objectType: "post",
      objectId: "post-1",
      seq: 1,
      prevHash: null,
      countryId: "gkx",
      createdAt: new Date("2026-08-12T00:00:00Z"),
    } as any;

    const deliveries = await enqueueFederationDelivery(event, { content: "<p>hi</p>", authorHandle: "alice" });
    // Only one peer is RECOGNIZED; the BLOCKED peer is skipped.
    expect(deliveries.length).toBe(1);
    expect(deliveries[0].targetCountryId).toBe(REMOTE_COUNTRY);
    // Payload embeds content + author for content events.
    expect(deliveries[0].payload).toContain("hi");
  });

  it("returns [] when no peers are recognized", async () => {
    seedPeer(stores, RecognitionState.UNKNOWN);
    const event = { eventId: "evt-1", eventType: OspEventType.POST_CREATED } as any;
    expect(await enqueueFederationDelivery(event, {})).toEqual([]);
  });
});

describe("deliverPending", () => {
  it("marks 2xx deliveries SENT", async () => {
    seedPeer(stores, RecognitionState.RECOGNIZED);
    stores.deliveries.push({
      id: "del_1",
      eventId: "evt-1",
      actorId: "actor-a",
      targetCountryId: REMOTE_COUNTRY,
      payload: canonicalize({ event_id: "evt-1" }),
      status: "PENDING",
      attempts: 0,
      nextRetryAt: null,
      createdAt: new Date(),
    });
    (globalThis.fetch as any).mockResolvedValue({ ok: true, status: 202 });

    const result = await deliverPending();
    expect(result.sent).toBe(1);
    expect(stores.deliveries[0].status).toBe("SENT");
    expect(stores.deliveries[0].deliveredAt).toBeInstanceOf(Date);
  });

  it("marks failures FAILED with exponential backoff", async () => {
    seedPeer(stores, RecognitionState.RECOGNIZED);
    stores.deliveries.push({
      id: "del_1",
      eventId: "evt-1",
      actorId: "actor-a",
      targetCountryId: REMOTE_COUNTRY,
      payload: canonicalize({ event_id: "evt-1" }),
      status: "PENDING",
      attempts: 0,
      nextRetryAt: null,
      createdAt: new Date(),
    });
    (globalThis.fetch as any).mockRejectedValue(new Error("network down"));

    const result = await deliverPending();
    expect(result.failed).toBe(1);
    const delivery = stores.deliveries[0];
    expect(delivery.status).toBe("FAILED");
    expect(delivery.attempts).toBe(1);
    expect(delivery.nextRetryAt).toBeInstanceOf(Date);
  });
});

describe("handleInboundFederation", () => {
  it("admits a valid signed content event from a recognized peer", async () => {
    seedPeer(stores, RecognitionState.RECOGNIZED);

    const result = await handleInboundFederation(envelope(contentPayload()));
    expect(result.status).toBe("ADMITTED");
    expect(stores.objects.length).toBe(1);
    expect(stores.objects[0].content).toBe("<p>hello from the other side</p>");
    expect(stores.remoteActors.length).toBe(1);
    expect(stores.inbox[0].status).toBe(FedInboundStatus.ADMITTED);
  });

  it("rejects a tampered signature", async () => {
    seedPeer(stores, RecognitionState.RECOGNIZED);

    const env = envelope(contentPayload());
    env.payload = { ...env.payload, content: "<p>tampered</p>" };
    const result = await handleInboundFederation(env);
    expect(result.status).toBe("REJECTED");
    if (result.status === "REJECTED") expect(result.reason).toBe("Invalid signature");
  });

  it("rejects an unknown country", async () => {
    const result = await handleInboundFederation(envelope(contentPayload()));
    expect(result.status).toBe("REJECTED");
    if (result.status === "REJECTED") expect(result.reason).toBe("Unknown country");
  });

  it("denies content from an unrecognized peer", async () => {
    seedPeer(stores, RecognitionState.UNKNOWN);
    const result = await handleInboundFederation(envelope(contentPayload()));
    expect(result.status).toBe("DENIED");
    expect(stores.objects.length).toBe(0);
  });

  it("denies content from a blocked peer", async () => {
    seedPeer(stores, RecognitionState.BLOCKED);
    const result = await handleInboundFederation(envelope(contentPayload()));
    expect(result.status).toBe("DENIED");
  });

  it("dedupes a repeated eventId", async () => {
    seedPeer(stores, RecognitionState.RECOGNIZED);
    mockDb.fedInbox.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("unique", {
        code: "P2002",
        clientVersion: "7.9.1",
      })
    );
    const result = await handleInboundFederation(envelope(contentPayload()));
    expect(result.status).toBe("DUPLICATE");
    expect(stores.objects.length).toBe(0);
  });

  it("sanitizes inbound content before storing", async () => {
    seedPeer(stores, RecognitionState.RECOGNIZED);
    const result = await handleInboundFederation(
      envelope(contentPayload({ content: "<p>ok</p><script>alert(1)</script>" }))
    );
    expect(result.status).toBe("ADMITTED");
    expect(stores.objects[0].content).toBe("<p>ok</p>");
  });
});

describe("cross-country social graph (RFC-012)", () => {
  it("enqueueTargetedDelivery delivers only to the specified country", async () => {
    seedPeer(stores, RecognitionState.RECOGNIZED);
    seedPeer(stores, RecognitionState.RECOGNIZED, "other-2");

    const event = { eventId: "evt-1", eventType: OspEventType.POST_CREATED, actorId: "a", countryId: "gkx", seq: 1, prevHash: null, createdAt: new Date() } as any;
    const deliveries = await enqueueTargetedDelivery("other-2", event, {});
    expect(deliveries.length).toBe(1);
    expect(deliveries[0].targetCountryId).toBe("other-2");
  });

  it("followRemote records the relationship, logs FOLLOWED and targets delivery", async () => {
    seedPeer(stores, RecognitionState.RECOGNIZED);
    const follow = await followRemote("user-1", REMOTE_COUNTRY, "remote-actor", { name: "Alice", handle: "alice" });

    expect(follow.userId).toBe("user-1");
    expect(stores.remoteFollows.length).toBe(1);
    expect(stores.events.some((e) => e.eventType === OspEventType.FOLLOWED)).toBe(true);
    expect(stores.deliveries.some((d) => d.targetCountryId === REMOTE_COUNTRY)).toBe(true);
    expect(await isFollowingRemote("user-1", REMOTE_COUNTRY, "remote-actor")).toBe(true);
  });

  it("unfollowRemote removes the relationship and delivers UNFOLLOWED", async () => {
    seedPeer(stores, RecognitionState.RECOGNIZED);
    await followRemote("user-1", REMOTE_COUNTRY, "remote-actor");
    expect(await unfollowRemote("user-1", REMOTE_COUNTRY, "remote-actor")).toBe(true);
    expect(await isFollowingRemote("user-1", REMOTE_COUNTRY, "remote-actor")).toBe(false);
    expect(stores.events.some((e) => e.eventType === OspEventType.UNFOLLOWED)).toBe(true);
  });

  it("inbound FOLLOWED records a RemoteFollower for our user", async () => {
    seedPeer(stores, RecognitionState.RECOGNIZED);
    const result = await handleInboundFederation(
      envelope({
        event_id: "evt-follow-1",
        event_type: OspEventType.FOLLOWED,
        actor: "remote-actor",
        country: REMOTE_COUNTRY,
        targetActor: "our-actor",
        follower: { name: "Remote Bob", handle: "rbob" },
      })
    );
    expect(result.status).toBe("ADMITTED");
    expect(stores.remoteFollowers.length).toBe(1);
    expect(stores.remoteFollowers[0].targetUserId).toBe("user-uuid");
    expect(stores.remoteFollowers[0].countryId).toBe(REMOTE_COUNTRY);
  });

  it("inbound UNFOLLOWED removes the RemoteFollower", async () => {
    seedPeer(stores, RecognitionState.RECOGNIZED);
    await handleInboundFederation(
      envelope({ event_id: "evt-follow-1", event_type: OspEventType.FOLLOWED, actor: "remote-actor", country: REMOTE_COUNTRY, targetActor: "our-actor" })
    );
    expect(stores.remoteFollowers.length).toBe(1);
    await handleInboundFederation(
      envelope({ event_id: "evt-unfollow-1", event_type: OspEventType.UNFOLLOWED, actor: "remote-actor", country: REMOTE_COUNTRY, targetActor: "our-actor" })
    );
    expect(stores.remoteFollowers.length).toBe(0);
  });

  it("inbound POST_LIKED records a RemoteLikeInbound on our post", async () => {
    seedPeer(stores, RecognitionState.RECOGNIZED);
    stores.posts.push({ id: "local-post-1" });
    const result = await handleInboundFederation(
      envelope({
        event_id: "evt-like-1",
        event_type: OspEventType.POST_LIKED,
        actor: "remote-actor",
        object: { type: "post", id: "local-post-1" },
        country: REMOTE_COUNTRY,
      })
    );
    expect(result.status).toBe("ADMITTED");
    expect(stores.remoteLikeInbounds.length).toBe(1);
    expect(stores.remoteLikeInbounds[0].postId).toBe("local-post-1");
    expect(await getRemoteLikeCount("local-post-1")).toBe(1);
  });

  it("inbound POST_UNLIKED removes the RemoteLikeInbound", async () => {
    seedPeer(stores, RecognitionState.RECOGNIZED);
    stores.posts.push({ id: "local-post-1" });
    await handleInboundFederation(
      envelope({ event_id: "evt-like-1", event_type: OspEventType.POST_LIKED, actor: "remote-actor", object: { type: "post", id: "local-post-1" }, country: REMOTE_COUNTRY })
    );
    await handleInboundFederation(
      envelope({ event_id: "evt-unlike-1", event_type: OspEventType.POST_UNLIKED, actor: "remote-actor", object: { type: "post", id: "local-post-1" }, country: REMOTE_COUNTRY })
    );
    expect(stores.remoteLikeInbounds.length).toBe(0);
  });

  it("isRemoteLiked reflects a like on a remote object", async () => {
    seedPeer(stores, RecognitionState.RECOGNIZED);
    await followRemote("user-1", REMOTE_COUNTRY, "remote-actor");
    mockDb.remoteLike.upsert.mockImplementationOnce(({ create }: any) => {
      const row = { ...create, id: "rl_1" };
      stores.remoteLikes.push(row);
      return row;
    });
    expect(await isRemoteLiked("user-1", "remote-post-1")).toBe(false);
  });

  it("getRemoteFollowerCount counts followers of a user", async () => {
    seedPeer(stores, RecognitionState.RECOGNIZED);
    await handleInboundFederation(
      envelope({ event_id: "evt-follow-1", event_type: OspEventType.FOLLOWED, actor: "remote-actor", country: REMOTE_COUNTRY, targetActor: "our-actor" })
    );
    expect(await getRemoteFollowerCount("user-uuid")).toBe(1);
  });
});
