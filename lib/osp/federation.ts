import sanitizeHtml from "sanitize-html";
import { Prisma } from "@/generated/prisma/client";
import {
  CountryStatus,
  FedDeliveryStatus,
  FedInboundStatus,
  OspEventType,
  RecognitionState,
} from "@/generated/prisma/enums";
import type {
  FedDeliveryModel,
  OspEventModel,
  RecognitionModel,
  RemoteActorModel,
  RemoteFollowModel,
} from "@/generated/prisma/models";
import { prisma } from "@/lib/prisma";
import { COUNTRY_ID, countrySign, getCountry } from "./country";
import { DEFAULT_CUSTOMS_PIPELINES, runCustoms } from "./customs";
import { actorDid } from "./did";
import { recordUserOspEvent } from "./event";
import { canonicalize, verifyPayload } from "./keys";
import { OBJECT_TYPES } from "./object";

/**
 * OSP RFC-009 (Federation) + RFC-011 (Recognition).
 *
 * Countries exchange SIGNED envelopes. A country's public key (recorded in
 * RemoteCountry) is the ONLY credential needed to verify an inbound envelope —
 * signature verification IS authentication, so the inbox needs no shared
 * secret. Recognition is directional: we only admit content from countries we
 * explicitly RECOGNIZED / TRUSTED (RFC-011). Inbound content is stored in
 * FedObject (never the local Post table) and sanitized server-side.
 */

// ============ Discovery (RFC-009: sender discovers the target Country) ============

export interface OspWellKnown {
  country_id: string;
  name: string;
  public_key: string;
  federation_endpoint: string;
  protocol_version: string;
  software: string;
}

/** Build OUR discovery document. */
export async function buildWellKnown(): Promise<OspWellKnown> {
  const country = await getCountry();
  return {
    country_id: country.id,
    name: country.name,
    public_key: country.publicKey,
    federation_endpoint: process.env.NEXT_PUBLIC_URL ?? "http://localhost:3000",
    protocol_version: "osp/1",
    software: "gekaixing",
  };
}

/** Fetch a peer Country's discovery document from its host. */
export async function fetchCountryWellKnown(host: string): Promise<OspWellKnown> {
  const base = (host.startsWith("http") ? host : `https://${host}`).replace(/\/$/, "");
  const res = await fetch(`${base}/.well-known/osp`, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) {
    throw new Error(`Well-known fetch failed: HTTP ${res.status}`);
  }
  const doc = (await res.json()) as Partial<OspWellKnown>;
  if (!doc.country_id || !doc.public_key || !doc.federation_endpoint) {
    throw new Error("Malformed OSP well-known document");
  }
  return doc as OspWellKnown;
}

// ============ Recognition (RFC-011) ============

/** Our current stance toward a remote country (UNKNOWN by default). */
export async function getRecognition(remoteCountryId: string): Promise<RecognitionState> {
  const rec = await prisma.recognition.findUnique({
    where: { fromCountryId_toCountryId: { fromCountryId: COUNTRY_ID, toCountryId: remoteCountryId } },
  });
  return rec?.state ?? RecognitionState.UNKNOWN;
}

/** A country admits inbound content only when recognized or trusted. */
export function isAdmitting(state: RecognitionState): boolean {
  return state === RecognitionState.RECOGNIZED || state === RecognitionState.TRUSTED;
}

export async function setRecognition(
  remoteCountryId: string,
  state: RecognitionState,
  policy?: Record<string, unknown>
): Promise<RecognitionModel> {
  const policyJson = policy ? canonicalize(policy) : null;
  return prisma.recognition.upsert({
    where: { fromCountryId_toCountryId: { fromCountryId: COUNTRY_ID, toCountryId: remoteCountryId } },
    update: { state, policy: policyJson },
    create: { fromCountryId: COUNTRY_ID, toCountryId: remoteCountryId, state, policy: policyJson },
  });
}

// ============ Outbound delivery (RFC-009) ============

/** Event types that carry viewable content and are broadcast to peers. */
const CONTENT_EVENT_TYPES = new Set<OspEventType>([
  OspEventType.POST_CREATED,
  OspEventType.REPLY_CREATED,
]);

export interface FedContentInfo {
  content?: string | null;
  authorName?: string | null;
  authorHandle?: string | null;
  authorAvatar?: string | null;
  parentId?: string | null;
}

/**
 * Queue a signed content event for delivery to every RECOGNIZED/TRUSTED peer,
 * then fire-and-forget a delivery attempt. The envelope payload is persisted on
 * FedDelivery so retries are self-contained.
 */
export async function enqueueFederationDelivery(
  ospEvent: OspEventModel,
  contentInfo: FedContentInfo = {}
): Promise<FedDeliveryModel[]> {
  const peers = await prisma.remoteCountry.findMany({
    where: {
      status: CountryStatus.ACTIVE,
      recognitions: {
        some: { fromCountryId: COUNTRY_ID, state: { in: [RecognitionState.RECOGNIZED, RecognitionState.TRUSTED] } },
      },
    },
  });
  return enqueueToPeers(peers, ospEvent, contentInfo);
}

/**
 * Deliver a signed event to ONE specific peer country (e.g. a follow or like
 * targeted at an actor/post that country owns). Broadcast would be wrong here.
 */
export async function enqueueTargetedDelivery(
  targetCountryId: string,
  ospEvent: OspEventModel,
  contentInfo: FedContentInfo = {}
): Promise<FedDeliveryModel[]> {
  const peer = await prisma.remoteCountry.findUnique({ where: { id: targetCountryId } });
  if (!peer || peer.status !== CountryStatus.ACTIVE) {
    return [];
  }
  return enqueueToPeers([peer], ospEvent, contentInfo);
}

async function enqueueToPeers(
  peers: { id: string }[],
  ospEvent: OspEventModel,
  contentInfo: FedContentInfo
): Promise<FedDeliveryModel[]> {
  if (peers.length === 0) {
    return [];
  }

  const isContent = CONTENT_EVENT_TYPES.has(ospEvent.eventType);
  const payload: Record<string, unknown> = {
    event_id: ospEvent.eventId,
    event_type: ospEvent.eventType,
    actor: ospEvent.actorId,
    timestamp: ospEvent.createdAt.toISOString(),
    seq: ospEvent.seq,
    prev_hash: ospEvent.prevHash,
    country: ospEvent.countryId,
  };
  if (ospEvent.objectType && ospEvent.objectId) {
    payload.object = { type: ospEvent.objectType, id: ospEvent.objectId };
  }
  if (isContent) {
    payload.content = contentInfo.content ?? null;
    payload.author = {
      name: contentInfo.authorName ?? null,
      handle: contentInfo.authorHandle ?? null,
      avatar: contentInfo.authorAvatar ?? null,
    };
    payload.parent_id = contentInfo.parentId ?? null;
    payload.visibility = "PUBLIC";
  }
  const payloadJson = canonicalize(payload);

  const created: FedDeliveryModel[] = [];
  for (const peer of peers) {
    const delivery = await prisma.fedDelivery.upsert({
      where: { eventId_targetCountryId: { eventId: ospEvent.eventId, targetCountryId: peer.id } },
      update: { payload: payloadJson },
      create: {
        eventId: ospEvent.eventId,
        actorId: ospEvent.actorId,
        targetCountryId: peer.id,
        payload: payloadJson,
      },
    });
    created.push(delivery);
  }

  void deliverPending();
  return created;
}

export interface DeliveryResult {
  processed: number;
  sent: number;
  failed: number;
}

/**
 * Deliver due outbound envelopes (PENDING/FAILED and due). Signature is computed
 * at send time from the country key. Failures back off attempts^2 minutes.
 */
export async function deliverPending(limit = 20): Promise<DeliveryResult> {
  const due = await prisma.fedDelivery.findMany({
    where: {
      status: { in: [FedDeliveryStatus.PENDING, FedDeliveryStatus.FAILED] },
      OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: new Date() } }],
    },
    orderBy: { createdAt: "asc" },
    take: limit,
    include: { remoteCountry: true },
  });

  let sent = 0;
  let failed = 0;
  for (const delivery of due) {
    const remote = delivery.remoteCountry;
    try {
      await prisma.fedDelivery.update({
        where: { id: delivery.id },
        data: { status: FedDeliveryStatus.SENDING },
      });
      const signature = countrySign(delivery.payload);
      const res = await fetch(`${remote.federationEndpoint.replace(/\/$/, "")}/api/fed/inbox`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          country_id: COUNTRY_ID,
          payload: JSON.parse(delivery.payload),
          signature,
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      await prisma.fedDelivery.update({
        where: { id: delivery.id },
        data: { status: FedDeliveryStatus.SENT, deliveredAt: new Date(), lastError: null },
      });
      sent++;
    } catch (error) {
      const attempts = delivery.attempts + 1;
      await prisma.fedDelivery.update({
        where: { id: delivery.id },
        data: {
          status: FedDeliveryStatus.FAILED,
          attempts,
          lastError: error instanceof Error ? error.message : String(error),
          nextRetryAt: new Date(Date.now() + attempts * attempts * 60_000),
        },
      });
      failed++;
    }
  }
  return { processed: due.length, sent, failed };
}

// ============ Inbound (RFC-009) ============

export interface FedEnvelope {
  country_id: string;
  payload: Record<string, unknown>;
  signature: string;
}

export type InboundResult =
  | { status: "ADMITTED"; eventId: string }
  | { status: "DUPLICATE"; eventId: string }
  | { status: "DENIED"; eventId: string; reason: string }
  | { status: "REJECTED"; eventId?: string; reason: string };

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "p", "br", "strong", "b", "em", "i", "u", "s", "strike", "del", "a",
    "ul", "ol", "li", "blockquote", "code", "pre", "h1", "h2", "h3", "h4",
    "h5", "h6", "hr", "span", "div", "img", "figure", "figcaption", "table",
    "thead", "tbody", "tr", "td", "th", "video", "audio", "source",
  ],
  allowedAttributes: {
    a: ["href", "target", "rel"],
    img: ["src", "alt", "title", "width", "height"],
    video: ["src", "controls", "poster"],
    audio: ["src", "controls"],
    source: ["src", "type"],
    span: ["class", "style", "data-*"],
    div: ["class", "data-*"],
    code: ["class"],
    pre: ["class"],
    td: ["colspan", "rowspan"],
    th: ["colspan", "rowspan"],
  },
  allowedSchemes: ["http", "https", "data"],
  allowProtocolRelative: false,
};

/** Sanitize inbound HTML (defense against XSS from misbehaving peers). */
export function sanitizeFederatedContent(html: string): string {
  return sanitizeHtml(html, SANITIZE_OPTIONS);
}

/**
 * Receive an envelope: verify the sender's signature, enforce recognition and
 * Customs, dedupe by eventId, and store admitted content. Throws only on DB
 * failure; policy outcomes are returned as InboundResult.
 */
export async function handleInboundFederation(body: FedEnvelope): Promise<InboundResult> {
  const payload = body?.payload;
  if (!payload || typeof payload !== "object") {
    return { status: "REJECTED", reason: "Malformed envelope" };
  }
  const countryId = (body.country_id || payload.country) as string | undefined;
  const eventId = payload.event_id ? String(payload.event_id) : "";
  if (!countryId || !eventId) {
    return { status: "REJECTED", reason: "Missing country or event id" };
  }

  const remote = await prisma.remoteCountry.findUnique({ where: { id: countryId } });
  if (!remote) {
    return { status: "REJECTED", reason: "Unknown country" };
  }

  const payloadJson = canonicalize(payload);
  if (!verifyPayload(remote.publicKey, payloadJson, body.signature ?? "")) {
    return { status: "REJECTED", reason: "Invalid signature" };
  }

  const eventType = payload.event_type as OspEventType;
  const object = payload.object as { type?: string; id?: string } | undefined;
  const actorId = payload.actor ? String(payload.actor) : "";

  let inboxId: string;
  try {
    const inbox = await prisma.fedInbox.create({
      data: {
        eventId,
        sourceCountryId: countryId,
        actorId,
        eventType,
        objectType: object?.type ?? null,
        objectId: object?.id ?? null,
        payload: payloadJson,
        signature: body.signature ?? "",
        status: FedInboundStatus.RECEIVED,
      },
    });
    inboxId = inbox.id;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { status: "DUPLICATE", eventId };
    }
    throw error;
  }

  const recognition = await getRecognition(countryId);
  if (!isAdmitting(recognition)) {
    await prisma.fedInbox.update({
      where: { id: inboxId },
      data: { status: FedInboundStatus.DENIED, error: `Recognition: ${recognition}` },
    });
    return { status: "DENIED", eventId, reason: `Recognition: ${recognition}` };
  }

  const content = typeof payload.content === "string" ? payload.content : null;
  const customs = await runCustoms(
    { actorId, objectType: object?.type ?? "post", content },
    DEFAULT_CUSTOMS_PIPELINES
  );
  if (customs.decision === "DENY" || customs.decision === "QUARANTINE") {
    await prisma.fedInbox.update({
      where: { id: inboxId },
      data: { status: FedInboundStatus.DENIED, error: customs.reason ?? "Customs denied" },
    });
    return { status: "DENIED", eventId, reason: customs.reason ?? "Customs denied" };
  }

  if (CONTENT_EVENT_TYPES.has(eventType) && object?.id && content) {
    const author = payload.author as Record<string, unknown> | undefined;
    const timestamp =
      typeof payload.timestamp === "string" ? new Date(payload.timestamp) : new Date();
    const parentId = payload.parent_id ? String(payload.parent_id) : null;

    await prisma.fedObject.create({
      data: {
        eventId,
        sourceCountryId: countryId,
        actorId,
        objectType: object.type ?? "post",
        objectId: object.id,
        content: sanitizeFederatedContent(content),
        authorName: author?.name ? String(author.name) : null,
        authorHandle: author?.handle ? String(author.handle) : null,
        authorAvatar: author?.avatar ? String(author.avatar) : null,
        parentId,
        createdAt: timestamp,
        status: FedInboundStatus.ADMITTED,
      },
    });

    await prisma.remoteActor.upsert({
      where: { countryId_actorId: { countryId, actorId } },
      update: {
        name: author?.name ? String(author.name) : null,
        handle: author?.handle ? String(author.handle) : null,
        avatar: author?.avatar ? String(author.avatar) : null,
      },
      create: {
        countryId,
        actorId,
        name: author?.name ? String(author.name) : null,
        handle: author?.handle ? String(author.handle) : null,
        avatar: author?.avatar ? String(author.avatar) : null,
      },
    });
  } else if (eventType === OspEventType.FOLLOWED || eventType === OspEventType.UNFOLLOWED) {
    // RFC-012: a remote actor follows / unfollows one of OUR users.
    const targetActorId = payload.targetActor ? String(payload.targetActor) : null;
    if (targetActorId) {
      const targetActor = await prisma.actor.findUnique({
        where: { id: targetActorId },
        select: { userId: true },
      });
      if (targetActor?.userId) {
        if (eventType === OspEventType.FOLLOWED) {
          await prisma.remoteFollower.upsert({
            where: {
              countryId_actorId_targetUserId: { countryId, actorId, targetUserId: targetActor.userId },
            },
            update: {},
            create: { countryId, actorId, targetUserId: targetActor.userId },
          });
        } else {
          await prisma.remoteFollower.deleteMany({
            where: { countryId, actorId, targetUserId: targetActor.userId },
          });
        }
      }
    }
  } else if (eventType === OspEventType.POST_LIKED || eventType === OspEventType.POST_UNLIKED) {
    // RFC-012: a remote actor likes / unlikes one of OUR posts.
    const postId = object?.id;
    if (postId) {
      const post = await prisma.post.findUnique({ where: { id: postId }, select: { id: true } });
      if (post) {
        if (eventType === OspEventType.POST_LIKED) {
          await prisma.remoteLikeInbound.upsert({
            where: {
              sourceCountryId_sourceActorId_postId: { sourceCountryId: countryId, sourceActorId: actorId, postId },
            },
            update: {},
            create: { sourceCountryId: countryId, sourceActorId: actorId, postId },
          });
        } else {
          await prisma.remoteLikeInbound.deleteMany({
            where: { sourceCountryId: countryId, sourceActorId: actorId, postId },
          });
        }
      }
    }
  }

  await prisma.fedInbox.update({
    where: { id: inboxId },
    data: { status: FedInboundStatus.ADMITTED },
  });
  return { status: "ADMITTED", eventId };
}

// ============ Remote identity resolution ============

export interface RemoteActorProfile {
  countryId: string;
  actorId: string;
  did: string;
  name: string | null;
  handle: string | null;
  avatar: string | null;
  publicKey: string | null;
  passportStatus: string | null;
}

/** Resolve a remote actor, fetching from the peer and caching on miss. */
export async function resolveRemoteActor(
  countryId: string,
  actorId: string
): Promise<RemoteActorModel | null> {
  const remote = await prisma.remoteCountry.findUnique({ where: { id: countryId } });
  if (!remote || !isAdmitting(await getRecognition(countryId))) {
    return null;
  }

  const cached = await prisma.remoteActor.findUnique({
    where: { countryId_actorId: { countryId, actorId } },
  });
  if (cached) {
    return cached;
  }

  try {
    const res = await fetch(
      `${remote.federationEndpoint.replace(/\/$/, "")}/api/fed/actors/${countryId}/${actorId}`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) {
      return null;
    }
    const data = (await res.json())?.data as Record<string, unknown> | undefined;
    return prisma.remoteActor.upsert({
      where: { countryId_actorId: { countryId, actorId } },
      update: {
        name: data?.name ? String(data.name) : null,
        handle: data?.handle ? String(data.handle) : null,
        avatar: data?.avatar ? String(data.avatar) : null,
        publicKey: data?.publicKey ? String(data.publicKey) : null,
        profile: data?.profile ? canonicalize(data.profile) : null,
      },
      create: {
        countryId,
        actorId,
        name: data?.name ? String(data.name) : null,
        handle: data?.handle ? String(data.handle) : null,
        avatar: data?.avatar ? String(data.avatar) : null,
        publicKey: data?.publicKey ? String(data.publicKey) : null,
        profile: data?.profile ? canonicalize(data.profile) : null,
      },
    });
  } catch {
    return null;
  }
}

/** Public actor profile for the federation surface (ours or a recognized peer). */
export async function buildRemoteActorProfile(
  countryId: string,
  actorId: string
): Promise<RemoteActorProfile | null> {
  if (countryId === COUNTRY_ID) {
    const actor = await prisma.actor.findUnique({ where: { id: actorId }, include: { user: true } });
    if (!actor) {
      return null;
    }
    const passport = await prisma.passport.findUnique({
      where: { countryId_actorId: { countryId: COUNTRY_ID, actorId } },
    });
    return {
      countryId: COUNTRY_ID,
      actorId,
      did: actorDid(actorId),
      name: actor.user?.name ?? null,
      handle: actor.user?.userid ?? null,
      avatar: actor.user?.avatar ?? null,
      publicKey: passport?.publicKey ?? null,
      passportStatus: passport?.status ?? null,
    };
  }

  const remote = await resolveRemoteActor(countryId, actorId);
  if (!remote) {
    return null;
  }
  return {
    countryId: remote.countryId,
    actorId: remote.actorId,
    did: `did:osp:${remote.countryId}:${remote.actorId}`,
    name: remote.name,
    handle: remote.handle,
    avatar: remote.avatar,
    publicKey: remote.publicKey,
    passportStatus: null,
  };
}

// ============ Cross-country social graph (RFC-012) ============

export interface RemoteFollowerInfo {
  name?: string | null;
  handle?: string | null;
  avatar?: string | null;
}

/** Is a LOCAL user following a REMOTE actor? */
export async function isFollowingRemote(
  userId: string,
  countryId: string,
  actorId: string
): Promise<boolean> {
  const row = await prisma.remoteFollow.findUnique({
    where: { userId_countryId_actorId: { userId, countryId, actorId } },
    select: { id: true },
  });
  return !!row;
}

/**
 * A LOCAL user follows a REMOTE actor: record the relationship, log a FOLLOWED
 * event, and deliver it (targeted) to the actor's country.
 */
export async function followRemote(
  userId: string,
  countryId: string,
  actorId: string,
  followerInfo: RemoteFollowerInfo = {}
): Promise<RemoteFollowModel> {
  const follow = await prisma.remoteFollow.upsert({
    where: { userId_countryId_actorId: { userId, countryId, actorId } },
    update: {},
    create: { userId, countryId, actorId },
  });

  const ospEvent = await recordUserOspEvent(userId, {
    eventType: OspEventType.FOLLOWED,
    payload: {
      targetActor: actorId,
      follower: {
        name: followerInfo.name ?? null,
        handle: followerInfo.handle ?? null,
        avatar: followerInfo.avatar ?? null,
      },
    },
  });
  await enqueueTargetedDelivery(countryId, ospEvent, {});
  return follow;
}

/** A LOCAL user unfollows a REMOTE actor (deletes + delivers UNFOLLOWED). */
export async function unfollowRemote(
  userId: string,
  countryId: string,
  actorId: string
): Promise<boolean> {
  const removed = await prisma.remoteFollow.deleteMany({ where: { userId, countryId, actorId } });
  if (removed.count === 0) {
    return false;
  }
  const ospEvent = await recordUserOspEvent(userId, {
    eventType: OspEventType.UNFOLLOWED,
    payload: { targetActor: actorId },
  });
  await enqueueTargetedDelivery(countryId, ospEvent, {});
  return true;
}

/** A LOCAL user likes a REMOTE post (records + delivers POST_LIKED, targeted). */
export async function likeRemote(
  userId: string,
  countryId: string,
  actorId: string,
  objectId: string
): Promise<boolean> {
  const existing = await prisma.remoteLike.findUnique({
    where: { userId_countryId_actorId_objectId: { userId, countryId, actorId, objectId } },
    select: { id: true },
  });
  if (existing) {
    return false;
  }
  await prisma.remoteLike.create({ data: { userId, countryId, actorId, objectId } });
  const ospEvent = await recordUserOspEvent(userId, {
    eventType: OspEventType.POST_LIKED,
    objectType: OBJECT_TYPES.POST,
    objectId,
  });
  await enqueueTargetedDelivery(countryId, ospEvent, {});
  return true;
}

/** A LOCAL user unlikes a REMOTE post (removes + delivers POST_UNLIKED). */
export async function unlikeRemote(
  userId: string,
  countryId: string,
  actorId: string,
  objectId: string
): Promise<boolean> {
  const removed = await prisma.remoteLike.deleteMany({
    where: { userId, countryId, actorId, objectId },
  });
  if (removed.count === 0) {
    return false;
  }
  const ospEvent = await recordUserOspEvent(userId, {
    eventType: OspEventType.POST_UNLIKED,
    objectType: OBJECT_TYPES.POST,
    objectId,
  });
  await enqueueTargetedDelivery(countryId, ospEvent, {});
  return true;
}

/** How many remote actors follow one of OUR users. */
export async function getRemoteFollowerCount(targetUserId: string): Promise<number> {
  return prisma.remoteFollower.count({ where: { targetUserId } });
}

/** How many remote actors like one of OUR posts. */
export async function getRemoteLikeCount(postId: string): Promise<number> {
  return prisma.remoteLikeInbound.count({ where: { postId } });
}

/** How many LOCAL users like a specific REMOTE post (by its source objectId). */
export async function getRemotePostLikeCount(objectId: string): Promise<number> {
  return prisma.remoteLike.count({ where: { objectId } });
}

export interface FedInteractionMaps {
  /** "countryId:actorId" pairs the viewer follows. */
  following: Set<string>;
  /** remote objectIds the viewer liked. */
  liked: Set<string>;
  /** remote objectId -> number of LOCAL users who liked it. */
  likeCount: Map<string, number>;
}

/**
 * Batch interaction state for a page of federated items (used by /api/fed/feed
 * and the /gekaixing/federated page). Guests get counts but no per-viewer state.
 */
export async function buildFedInteractionMaps(
  viewerId: string | null,
  items: Array<{ sourceCountryId: string; actorId: string; objectId: string }>
): Promise<FedInteractionMaps> {
  const objectIds = items.map((i) => i.objectId);
  const maps: FedInteractionMaps = { following: new Set(), liked: new Set(), likeCount: new Map() };

  if (objectIds.length > 0) {
    const counts = await prisma.remoteLike.groupBy({
      by: ["objectId"],
      where: { objectId: { in: objectIds } },
      _count: true,
    });
    for (const row of counts) {
      maps.likeCount.set(row.objectId, row._count);
    }
  }

  if (viewerId && items.length > 0) {
    const [follows, likes] = await Promise.all([
      prisma.remoteFollow.findMany({
        where: {
          userId: viewerId,
          OR: items.map((i) => ({ countryId: i.sourceCountryId, actorId: i.actorId })),
        },
        select: { countryId: true, actorId: true },
      }),
      prisma.remoteLike.findMany({
        where: { userId: viewerId, objectId: { in: objectIds } },
        select: { objectId: true },
      }),
    ]);
    for (const f of follows) {
      maps.following.add(`${f.countryId}:${f.actorId}`);
    }
    for (const l of likes) {
      maps.liked.add(l.objectId);
    }
  }

  return maps;
}

/** Has a LOCAL user liked a specific REMOTE post (by its source objectId)? */
export async function isRemoteLiked(userId: string, objectId: string): Promise<boolean> {
  const row = await prisma.remoteLike.findFirst({
    where: { userId, objectId },
    select: { id: true },
  });
  return !!row;
}
