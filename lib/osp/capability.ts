import { CapabilityState, CapabilityType, OspEventType, UserRole } from "@/generated/prisma/enums";
import type { CapabilityModel } from "@/generated/prisma/models";
import { prisma } from "@/lib/prisma";
import { recordOspEvent } from "./event";
import { canonicalize } from "./keys";
import { OBJECT_TYPES } from "./object";

/**
 * OSP RFC-015: Capability — what an Actor is allowed to do, separate from
 * identity. Grants are scoped (scope/time), revocable, and every grant/revoke
 * lands in the signed event ledger. AI behavior is expressed through
 * capabilities too — AI is not a special identity class.
 */

export const DEFAULT_USER_CAPABILITIES: CapabilityType[] = [
  CapabilityType.CREATE_POST,
  CapabilityType.SEARCH,
];

export const DEFAULT_ADMIN_CAPABILITIES: CapabilityType[] = [CapabilityType.MODERATE];

export const AI_SERVICE_CAPABILITIES: CapabilityType[] = [
  CapabilityType.SEARCH,
  CapabilityType.EXECUTE_TASK,
];

export interface GrantOptions {
  scope?: Record<string, unknown> | null;
  expiresAt?: Date | null;
  grantedBy?: string | null;
  /** Set false to skip the ledger event (e.g. inside account-deletion teardown). */
  recordEvent?: boolean;
}

function isExpired(cap: Pick<CapabilityModel, "expiresAt" | "state">): boolean {
  return cap.state !== CapabilityState.GRANTED || (cap.expiresAt !== null && cap.expiresAt.getTime() <= Date.now());
}

export async function checkCapability(actorId: string, type: CapabilityType): Promise<boolean> {
  const cap = await prisma.capability.findUnique({
    where: { actorId_capabilityType: { actorId, capabilityType: type } },
  });
  return cap !== null && !isExpired(cap);
}

/** Grant (or re-grant) a capability. Idempotent: no-op if already GRANTED & unexpired. */
export async function grantCapability(
  actorId: string,
  type: CapabilityType,
  opts: GrantOptions = {}
): Promise<CapabilityModel> {
  const existing = await prisma.capability.findUnique({
    where: { actorId_capabilityType: { actorId, capabilityType: type } },
  });
  const scopeJson = opts.scope ? canonicalize(opts.scope) : null;

  if (existing && !isExpired(existing)) {
    return existing;
  }

  const data = {
    state: CapabilityState.GRANTED,
    expiresAt: opts.expiresAt ?? null,
    scope: scopeJson,
    grantedBy: opts.grantedBy ?? "country",
    revokedAt: null as Date | null,
  };
  const cap = existing
    ? await prisma.capability.update({ where: { id: existing.id }, data })
    : await prisma.capability.create({ data: { ...data, actorId, capabilityType: type } });

  if (opts.recordEvent !== false) {
    await recordOspEvent({
      actorId,
      eventType: OspEventType.CAPABILITY_GRANTED,
      objectType: OBJECT_TYPES.CAPABILITY,
      objectId: `${actorId}:${type}`,
      payload: { capability: type },
    });
  }
  return cap;
}

/** Revoke a capability and record the ledger event. */
export async function revokeCapability(actorId: string, type: CapabilityType): Promise<CapabilityModel | null> {
  const existing = await prisma.capability.findUnique({
    where: { actorId_capabilityType: { actorId, capabilityType: type } },
  });
  if (!existing) {
    return null;
  }
  const cap = await prisma.capability.update({
    where: { id: existing.id },
    data: { state: CapabilityState.REVOKED, revokedAt: new Date() },
  });
  await recordOspEvent({
    actorId,
    eventType: OspEventType.CAPABILITY_REVOKED,
    objectType: OBJECT_TYPES.CAPABILITY,
    objectId: `${actorId}:${type}`,
    payload: { capability: type },
  });
  return cap;
}

export async function listCapabilities(actorId: string): Promise<CapabilityModel[]> {
  return prisma.capability.findMany({ where: { actorId } });
}

/** Seed a human actor's default grants (CREATE_POST + SEARCH; +MODERATE for admins). */
export async function seedDefaultCapabilities(actorId: string, role?: UserRole): Promise<void> {
  for (const cap of DEFAULT_USER_CAPABILITIES) {
    await grantCapability(actorId, cap);
  }
  if (role === UserRole.ADMIN) {
    await grantCapability(actorId, CapabilityType.MODERATE);
  }
}
