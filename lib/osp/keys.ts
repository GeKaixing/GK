import {
  createHash,
  createHmac,
  createPrivateKey,
  createPublicKey,
  sign as cryptoSign,
  verify as cryptoVerify,
} from "node:crypto";
import type { KeyObject } from "node:crypto";

/**
 * OSP cryptographic primitives (RFC-001 Identity, RFC-003 Passport).
 *
 * Ed25519 keys are DETERMINISTICALLY DERIVED from a secret + a path of labels
 * (HMAC-SHA256). Country and actor keys never exist at rest: the private key is
 * rebuilt on demand from the secret and immediately discarded. Public keys are
 * persisted (Country.publicKey / Passport.publicKey) for verification.
 *
 * Derivation scheme (secret = OSP_COUNTRY_SECRET):
 *   seed(secret, ["country","root"])   -> Country Ed25519 keypair
 *   seed(secret, ["actor", actorId])   -> per-Actor Ed25519 keypair
 *
 * Signing is "country-managed" in v1 (RFC-003): the Country key signs
 * passports and events; actor keys are identity anchors only.
 */

/** Recursively sort keys; stable canonical JSON (JCS-lite, RFC 8785). */
export function canonicalize(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (value instanceof Date) {
    // Dates have no enumerable keys; serialize to ISO for a faithful, stable form.
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      sorted[key] = sortValue(record[key]);
    }
    return sorted;
  }
  return value;
}

/** SHA-256 hex digest of a UTF-8 string. */
export function sha256Hex(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

/**
 * Deterministically derive a 32-byte Ed25519 seed via an HMAC-SHA256 chain:
 * key = secret; for each part: key = HMAC(key, part). The final key is the seed.
 */
export function deriveSeed(secret: string | Buffer, parts: string[]): Buffer {
  let key = Buffer.isBuffer(secret) ? secret : Buffer.from(secret, "utf8");
  for (const part of parts) {
    key = createHmac("sha256", key).update(part, "utf8").digest();
  }
  return key;
}

/**
 * Build PKCS#8 DER for an Ed25519 private key from a 32-byte seed (RFC 8410).
 *
 *   SEQUENCE {                         30 2e
 *     INTEGER 0                         02 01 00
 *     SEQUENCE { OID 1.3.101.112 }      30 05 06 03 2b 65 70
 *     OCTET STRING {                   04 22
 *       OCTET STRING { 32-byte seed }  04 20 <seed>
 *     }
 *   }
 */
export function buildEd25519Pkcs8Der(seed: Buffer): Buffer {
  if (seed.length !== 32) {
    throw new Error("Ed25519 seed must be exactly 32 bytes");
  }
  const curvePrivateKey = Buffer.concat([Buffer.from([0x04, 0x20]), seed]); // inner OCTET STRING
  const privateKey = Buffer.concat([Buffer.from([0x04, 0x22]), curvePrivateKey]); // outer OCTET STRING
  const algorithmIdentifier = Buffer.from([0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70]); // Ed25519 OID
  const version = Buffer.from([0x02, 0x01, 0x00]); // v1
  const content = Buffer.concat([version, algorithmIdentifier, privateKey]);
  return Buffer.concat([Buffer.from([0x30, 0x2e]), content]);
}

export interface DerivedKeyPair {
  /** base64 SPKI public key */
  publicKeyB64: string;
  privateKey: KeyObject;
}

/** Derive an Ed25519 keypair from a secret + label path. Deterministic. */
export function keyPairFromSecret(secret: string | Buffer, parts: string[]): DerivedKeyPair {
  const seed = deriveSeed(secret, parts);
  const der = buildEd25519Pkcs8Der(seed);
  const privateKey = createPrivateKey({ key: der, format: "der", type: "pkcs8" });
  const publicKey = createPublicKey(privateKey);
  return {
    publicKeyB64: publicKey.export({ format: "der", type: "spki" }).toString("base64"),
    privateKey,
  };
}

/** Country/actor sign a canonical payload; returns base64 Ed25519 signature. */
export function signPayload(
  secret: string | Buffer,
  parts: string[],
  canonical: string
): string {
  const { privateKey } = keyPairFromSecret(secret, parts);
  return cryptoSign(null, Buffer.from(canonical, "utf8"), privateKey).toString("base64");
}

/** Verify a base64 Ed25519 signature over a canonical payload with a base64 SPKI public key. */
export function verifyPayload(
  publicKeyB64: string,
  canonical: string,
  signatureB64: string
): boolean {
  try {
    const publicKey = createPublicKey({
      key: Buffer.from(publicKeyB64, "base64"),
      format: "der",
      type: "spki",
    });
    return cryptoVerify(
      null,
      Buffer.from(canonical, "utf8"),
      publicKey,
      Buffer.from(signatureB64, "base64")
    );
  } catch {
    return false;
  }
}
