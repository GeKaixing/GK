import { randomUUID } from "node:crypto";
import { OspEventType, PassportStatus, UserRole } from "@/generated/prisma/enums";
import type { ActorModel, PassportModel } from "@/generated/prisma/models";
import { prisma } from "@/lib/prisma";
import {
  AI_SERVICE_ACTOR_ID,
  actorPublicKeyB64,
  getActorByUserId,
  getOrCreateActorForUser,
} from "./actor";
import { AI_SERVICE_CAPABILITIES, grantCapability, seedDefaultCapabilities } from "./capability";
import { countryPublicKey, countrySign, getCountry } from "./country";
import { recordOspEvent } from "./event";
import { canonicalize, verifyPayload } from "./keys";
import { OBJECT_TYPES } from "./object";

/**
 * OSP RFC-003: the universal Passport. Issued by the Country and signed with
 * the Country key, binding an Actor's id to its (derived) public key. Human and
 * service actors both get passports; a human citizen is created via
 * ensureCitizen() at signup / OAuth callback, and backfilled by the bootstrap
 * script. Passport history is portable (RFC-003) — future federation only needs
 * to exchange Country public keys.
 */

export interface PassportPayload {
  passportId: string;
  countryId: string;
  actorId: string;
  publicKey: string;
  issuedAt: string;
  status: string;
}

/** Canonical passport payload (RFC-003 field set), signed by the Country key. */
export function buildPassportPayload(p: PassportPayload): string {
  return canonicalize({
    passport_id: p.passportId,
    country_id: p.countryId,
    actor_id: p.actorId,
    public_key: p.publicKey,
    issued_at: p.issuedAt,
    status: p.status,
  });
}

export async function getPassport(actorId: string): Promise<PassportModel | null> {
  const country = await getCountry();
  return prisma.passport.findUnique({
    where: { countryId_actorId: { countryId: country.id, actorId } },
  });
}

/** Issue a passport for an actor. Idempotent under the (countryId, actorId) unique. */
export async function issuePassport(actorId: string): Promise<PassportModel> {
  const country = await getCountry();
  const publicKey = actorPublicKeyB64(actorId);
  const passportId = randomUUID();
  const issuedAt = new Date();
  const signature = countrySign(
    buildPassportPayload({
      passportId,
      countryId: country.id,
      actorId,
      publicKey,
      issuedAt: issuedAt.toISOString(),
      status: PassportStatus.ACTIVE,
    })
  );

  try {
    return await prisma.passport.create({
      data: {
        id: passportId,
        countryId: country.id,
        actorId,
        publicKey,
        issuedAt,
        status: PassportStatus.ACTIVE,
        signature,
      },
    });
  } catch (error) {
    const existing = await getPassport(actorId);
    if (existing) {
      return existing;
    }
    throw error;
  }
}

/** Revoke an actor's passport (status + signed ledger event). Returns null if none. */
export async function revokePassport(actorId: string): Promise<PassportModel | null> {
  const passport = await getPassport(actorId);
  if (!passport) {
    return null;
  }
  const updated = await prisma.passport.update({
    where: { id: passport.id },
    data: { status: PassportStatus.REVOKED },
  });
  await recordOspEvent({
    actorId,
    eventType: OspEventType.PASSPORT_REVOKED,
    objectType: OBJECT_TYPES.PASSPORT,
    objectId: passport.id,
  });
  return updated;
}

/** Verify a passport: ACTIVE status + Country-key signature over its payload. */
export async function verifyPassport(passport: PassportModel): Promise<boolean> {
  if (passport.status !== PassportStatus.ACTIVE) {
    return false;
  }
  const payload = buildPassportPayload({
    passportId: passport.id,
    countryId: passport.countryId,
    actorId: passport.actorId,
    publicKey: passport.publicKey,
    issuedAt: passport.issuedAt.toISOString(),
    status: passport.status,
  });
  const publicKey = await countryPublicKey();
  return verifyPayload(publicKey, payload, passport.signature);
}

async function hasEvent(actorId: string, eventType: OspEventType): Promise<boolean> {
  const count = await prisma.ospEvent.count({ where: { actorId, eventType } });
  return count > 0;
}

/**
 * Identity bootstrap entry point (RFC-001/003/004): ensure the Actor exists,
 * issue its Passport, seed default Capabilities, and record the lifecycle
 * events (ACTOR_CREATED / PASSPORT_ISSUED) exactly once. Idempotent — safe to
 * call on every signup and from the bootstrap backfill script.
 */
export async function ensureCitizen(
  userId: string
): Promise<{ actor: ActorModel; passport: PassportModel }> {
  const actor = await getOrCreateActorForUser(userId);
  const passport = (await getPassport(actor.id)) ?? (await issuePassport(actor.id));

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  await seedDefaultCapabilities(actor.id, user?.role ?? UserRole.STANDARD);

  if (!(await hasEvent(actor.id, OspEventType.ACTOR_CREATED))) {
    await recordOspEvent({
      actorId: actor.id,
      eventType: OspEventType.ACTOR_CREATED,
      objectType: OBJECT_TYPES.ACTOR,
      objectId: actor.id,
    });
  }
  if (!(await hasEvent(actor.id, OspEventType.PASSPORT_ISSUED))) {
    await recordOspEvent({
      actorId: actor.id,
      eventType: OspEventType.PASSPORT_ISSUED,
      objectType: OBJECT_TYPES.PASSPORT,
      objectId: passport.id,
    });
  }

  return { actor, passport };
}

/** Ensure the GKX AI service actor exists with a passport and its capabilities. */
export async function ensureAiServiceActor(): Promise<{
  actor: ActorModel;
  passport: PassportModel;
}> {
  const actor = await prisma.actor.upsert({
    where: { id: AI_SERVICE_ACTOR_ID },
    update: {},
    create: { id: AI_SERVICE_ACTOR_ID },
  });
  const passport = (await getPassport(actor.id)) ?? (await issuePassport(actor.id));

  for (const cap of AI_SERVICE_CAPABILITIES) {
    await grantCapability(actor.id, cap);
  }

  if (!(await hasEvent(actor.id, OspEventType.ACTOR_CREATED))) {
    await recordOspEvent({
      actorId: actor.id,
      eventType: OspEventType.ACTOR_CREATED,
      objectType: OBJECT_TYPES.ACTOR,
      objectId: actor.id,
    });
  }
  if (!(await hasEvent(actor.id, OspEventType.PASSPORT_ISSUED))) {
    await recordOspEvent({
      actorId: actor.id,
      eventType: OspEventType.PASSPORT_ISSUED,
      objectType: OBJECT_TYPES.PASSPORT,
      objectId: passport.id,
    });
  }

  return { actor, passport };
}
