import { randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { OspEventType } from "@/generated/prisma/enums";
import type { OspEventModel } from "@/generated/prisma/models";
import { prisma } from "@/lib/prisma";
import { getOrCreateActorForUser } from "./actor";
import { countrySign, countryVerify, getCountry } from "./country";
import { canonicalize, sha256Hex } from "./keys";

/**
 * OSP RFC-006: the append-only, signed event ledger.
 *
 * Each event is a canonical JSON payload (event_id, actor, event_type, object,
 * timestamp, seq, prev_hash, country) signed by the Country key. `seq` is a
 * per-actor monotonic counter, `hash` chains each event to its predecessor
 * (prevHash = previous event's hash), giving a verifiable, replayable stream.
 *
 * The ledger is intentionally separate from `UserAction` (analytics): impressions,
 * clicks and dwells are NOT protocol events and never enter this table.
 */

export interface OspEventInput {
  actorId: string;
  eventType: OspEventType;
  objectType?: string | null;
  objectId?: string | null;
  /** Arbitrary protocol data (e.g. message participants). Never sensitive content. */
  payload?: Record<string, unknown> | null;
}

export interface EventChainResult {
  valid: boolean;
  count: number;
  brokenAtSeq?: number;
  reason?: string;
}

/** Build the canonical event payload object. Used for both signing and verifying. */
function buildEventPayload(fields: {
  eventId: string;
  actorId: string;
  eventType: OspEventType;
  objectType?: string | null;
  objectId?: string | null;
  seq: number;
  prevHash: string | null;
  timestamp: string;
  countryId: string;
  data?: Record<string, unknown> | null;
}): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    event_id: fields.eventId,
    actor: fields.actorId,
    event_type: fields.eventType,
    timestamp: fields.timestamp,
    seq: fields.seq,
    prev_hash: fields.prevHash ?? null,
    country: fields.countryId,
  };
  if (fields.objectType && fields.objectId) {
    payload.object = { type: fields.objectType, id: fields.objectId };
  }
  if (fields.data && Object.keys(fields.data).length > 0) {
    payload.data = fields.data;
  }
  return payload;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
  );
}

/**
 * Append a signed event to the actor's ledger. Per-actor seq is computed inside
 * a transaction; concurrent writes to the same actor retry on unique violation.
 * Throws on failure — callers' existing try/catch surfaces it as a 500, keeping
 * the ledger trustworthy.
 */
export async function recordOspEvent(input: OspEventInput): Promise<OspEventModel> {
  const country = await getCountry();
  const countryId = country.id;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const last = await tx.ospEvent.findFirst({
          where: { actorId: input.actorId },
          orderBy: { seq: "desc" },
          select: { seq: true, hash: true },
        });
        const seq = (last?.seq ?? 0) + 1;
        const prevHash = last?.hash ?? null;
        const eventId = randomUUID();
        const timestamp = new Date().toISOString();
        const payloadJson = canonicalize(
          buildEventPayload({
            eventId,
            actorId: input.actorId,
            eventType: input.eventType,
            objectType: input.objectType,
            objectId: input.objectId,
            seq,
            prevHash,
            timestamp,
            countryId,
            data: input.payload,
          })
        );
        const hash = sha256Hex(payloadJson);
        const signature = countrySign(payloadJson);
        return tx.ospEvent.create({
          data: {
            eventId,
            countryId,
            actorId: input.actorId,
            eventType: input.eventType,
            objectType: input.objectType ?? null,
            objectId: input.objectId ?? null,
            seq,
            prevHash,
            hash,
            signature,
            payload: payloadJson,
          },
        });
      });
    } catch (error) {
      if (isUniqueViolation(error) && attempt < 2) {
        continue;
      }
      throw error;
    }
  }
  throw new Error("recordOspEvent: too many retries");
}

/**
 * Record an event for a USER's actor, resolving the Actor from the user id
 * (creating it if the user predates OSP). Convenience for API-route
 * instrumentation, which has `user.id` in hand.
 */
export async function recordUserOspEvent(
  userId: string,
  input: Omit<OspEventInput, "actorId">
): Promise<OspEventModel> {
  const actor = await getOrCreateActorForUser(userId);
  return recordOspEvent({ ...input, actorId: actor.id });
}

/**
 * Verify a single event:
 *   1. stored payload hashes to the stored hash;
 *   2. the Country-key signature verifies over the stored payload;
 *   3. the row's scalar fields match what the signed payload claims
 *      (binds event_type/actor/seq/object/etc. to the signature without
 *      depending on wall-clock reconstruction of the timestamp).
 */
export async function verifyEvent(row: OspEventModel): Promise<boolean> {
  if (!row.payload) {
    return false;
  }
  if (sha256Hex(row.payload) !== row.hash) {
    return false;
  }
  if (!(await countryVerify(row.payload, row.signature))) {
    return false;
  }
  const parsed = safeParse(row.payload);
  if (!parsed || typeof parsed !== "object") {
    return false;
  }
  const p = parsed as Record<string, unknown>;
  if (p.event_id !== row.eventId) return false;
  if (p.actor !== row.actorId) return false;
  if (p.event_type !== row.eventType) return false;
  if (p.seq !== row.seq) return false;
  if ((p.prev_hash ?? null) !== row.prevHash) return false;
  if (p.country !== row.countryId) return false;
  const obj = p.object as { type?: unknown; id?: unknown } | undefined;
  if (row.objectType || row.objectId) {
    if (obj?.type !== row.objectType || obj?.id !== row.objectId) return false;
  }
  return true;
}

/** Verify an actor's whole chain: hash linkage, then per-event verification. */
export async function verifyEventChain(actorId: string): Promise<EventChainResult> {
  const events = await prisma.ospEvent.findMany({
    where: { actorId },
    orderBy: { seq: "asc" },
  });
  if (events.length === 0) {
    return { valid: true, count: 0 };
  }

  for (const event of events) {
    if (event.seq === 1 && event.prevHash !== null) {
      return { valid: false, count: events.length, brokenAtSeq: event.seq, reason: "first event has prevHash" };
    }
    if (event.seq > 1) {
      const previous = events[event.seq - 2];
      if (!previous || previous.hash !== event.prevHash) {
        return { valid: false, count: events.length, brokenAtSeq: event.seq, reason: "prevHash chain broken" };
      }
    }
    if (!(await verifyEvent(event))) {
      return { valid: false, count: events.length, brokenAtSeq: event.seq, reason: "signature/hash invalid" };
    }
  }

  return { valid: true, count: events.length };
}

function safeParse(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}
