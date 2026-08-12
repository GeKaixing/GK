import type { ActorModel } from "@/generated/prisma/models";
import { prisma } from "@/lib/prisma";
import { getCountrySecret } from "./country";
import { keyPairFromSecret } from "./keys";

/**
 * OSP RFC-004: Actor — the universal participant primitive. A human actor is
 * 1:1 with a `User` (Actor.userId, SetNull on user delete); service actors
 * (like the GKX AI) are standalone rows with a fixed id. Deleting the User does
 * NOT delete the Actor, so the signed ledger and passport history survive.
 */

export const AI_SERVICE_ACTOR_ID = "actor_gkxi_ai";

/** Get the Actor for a user, creating it if missing (idempotent). */
export async function getOrCreateActorForUser(userId: string): Promise<ActorModel> {
  return prisma.actor.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });
}

export async function getActorByUserId(userId: string): Promise<ActorModel | null> {
  return prisma.actor.findUnique({ where: { userId } });
}

export async function getActor(actorId: string): Promise<ActorModel | null> {
  return prisma.actor.findUnique({ where: { id: actorId } });
}

/**
 * Derive (never store) the actor's Ed25519 public key from the country secret.
 * The private key is rebuildable on demand and never persisted.
 */
export function actorPublicKeyB64(actorId: string): string {
  return keyPairFromSecret(getCountrySecret(), ["actor", actorId]).publicKeyB64;
}
