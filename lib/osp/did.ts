import { COUNTRY_ID } from "./country";

/**
 * OSP addressing (RFC-001/002/003). A canonical DID per actor:
 *   did:osp:<countryId>:<actorId>
 * Stable across country migration (the DID namespace is global; only the
 * country segment changes when a passport migrates).
 */
export function actorDid(actorId: string): string {
  return `did:osp:${COUNTRY_ID}:${actorId}`;
}

export function countryDid(): string {
  return `did:osp:${COUNTRY_ID}`;
}

/** Parse a did:osp DID. Throws on malformed input. */
export function parseDid(did: string): { countryId: string; actorId: string } {
  const parts = did.split(":");
  if (parts.length !== 4 || parts[0] !== "did" || parts[1] !== "osp") {
    throw new Error(`Invalid did:osp DID: ${did}`);
  }
  return { countryId: parts[2], actorId: parts[3] };
}
