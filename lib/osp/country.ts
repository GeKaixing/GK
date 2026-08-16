import { prisma } from "@/lib/prisma";
import type { CountryModel } from "@/generated/prisma/models";
import { keyPairFromSecret, signPayload, verifyPayload } from "./keys";

/**
 * OSP RFC-002: the Country. Gekaixing is Country "gkx" — the reference
 * implementation's single realm. The Country Ed25519 keypair is derived
 * deterministically from OSP_COUNTRY_SECRET; the private key never exists at
 * rest (rebuilt on demand), and the public key is persisted on the Country row
 * for verification. If OSP_COUNTRY_SECRET is lost, rotation requires re-issuing
 * every passport.
 */

export const COUNTRY_ID = "gkx";
export const COUNTRY_NAME = "Gekaixing";

let cachedSecret: Buffer | null = null;

/**
 * Resolve the country secret from env. Accepts a hex string (recommended,
 * `openssl rand -hex 32`) or any opaque string (used as UTF-8 key material).
 */
export function getCountrySecret(): Buffer {
  if (cachedSecret) {
    return cachedSecret;
  }
  const raw = process.env.OSP_COUNTRY_SECRET ?? "";
  if (!raw) {
    throw new Error(
      "OSP_COUNTRY_SECRET is not set. Generate one with `openssl rand -hex 32` and keep it stable."
    );
  }
  const secret =
    raw.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(raw)
      ? Buffer.from(raw, "hex")
      : Buffer.from(raw, "utf8");
  cachedSecret = secret;
  return secret;
}

/** Convenience: sign a canonical payload with the Country key. */
export function countrySign(canonical: string): string {
  return signPayload(getCountrySecret(), ["country", "root"], canonical);
}

/** Convenience: verify a Country-key signature. */
export async function countryVerify(canonical: string, signatureB64: string): Promise<boolean> {
  const publicKey = await countryPublicKey();
  return verifyPayload(publicKey, canonical, signatureB64);
}

/**
 * Idempotently ensure the Country row exists and its public key matches the
 * secret-derived key. Throws if the row holds a different public key (secret
 * changed under an existing deployment).
 */
export async function ensureCountry(): Promise<CountryModel> {
  const { publicKeyB64 } = keyPairFromSecret(getCountrySecret(), ["country", "root"]);

  const existing = await prisma.country.findUnique({ where: { id: COUNTRY_ID } });
  if (existing) {
    if (existing.publicKey !== publicKeyB64) {
      throw new Error(
        `Country ${COUNTRY_ID} public key mismatch — OSP_COUNTRY_SECRET changed. ` +
          "Restore the original secret or rotate (re-issue all passports)."
      );
    }
    return existing;
  }

  return prisma.country.create({
    data: {
      id: COUNTRY_ID,
      name: COUNTRY_NAME,
      publicKey: publicKeyB64,
    },
  });
}

/** Lazy ensure + return the Country row (safe to call from any OSP helper). */
export async function getCountry(): Promise<CountryModel> {
  return ensureCountry();
}

/** The Country public key (base64 SPKI), ensuring the row exists. */
export async function countryPublicKey(): Promise<string> {
  const country = await getCountry();
  return country.publicKey;
}

/** The Country's federation endpoint (RFC-002); unset until federation ships. */
export function countryFederationEndpoint(): string | null {
  return process.env.NEXT_PUBLIC_URL ?? null;
}
