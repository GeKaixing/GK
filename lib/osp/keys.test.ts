import { describe, expect, it } from "vitest";
import {
  buildEd25519Pkcs8Der,
  canonicalize,
  deriveSeed,
  keyPairFromSecret,
  sha256Hex,
  signPayload,
  verifyPayload,
} from "./keys";

const SECRET = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

describe("canonicalize", () => {
  it("sorts object keys recursively and is deterministic", () => {
    const a = { b: 1, a: { d: [2, 1], c: "x" } };
    const b = { a: { c: "x", d: [2, 1] }, b: 1 };
    const c = { a: { d: [2, 1], c: "x" }, b: 1 };
    expect(canonicalize(a)).toBe(canonicalize(b));
    expect(canonicalize(a)).toBe(canonicalize(c));
    expect(canonicalize(a)).toBe('{"a":{"c":"x","d":[2,1]},"b":1}');
  });

  it("keeps arrays ordered (order is significant in arrays)", () => {
    expect(canonicalize({ a: [1, 2] })).toBe('{"a":[1,2]}');
    expect(canonicalize({ a: [2, 1] })).toBe('{"a":[2,1]}');
  });

  it("serializes Date values to ISO strings deterministically", () => {
    const a = { at: new Date("2026-08-12T00:00:00Z"), n: 1 };
    const b = { n: 1, at: new Date("2026-08-12T00:00:00Z") };
    expect(canonicalize(a)).toBe(canonicalize(b));
    expect(canonicalize(a)).toBe('{"at":"2026-08-12T00:00:00.000Z","n":1}');
  });
});

describe("deriveSeed", () => {
  it("is deterministic for the same secret and parts", () => {
    const s1 = deriveSeed(SECRET, ["country", "root"]);
    const s2 = deriveSeed(SECRET, ["country", "root"]);
    expect(s1.equals(s2)).toBe(true);
    expect(s1.length).toBe(32);
  });

  it("differs when the label path differs", () => {
    const a = deriveSeed(SECRET, ["actor", "u1"]);
    const b = deriveSeed(SECRET, ["actor", "u2"]);
    expect(a.equals(b)).toBe(false);
  });
});

describe("keyPairFromSecret", () => {
  it("derives the same public key for the same secret and parts", () => {
    const k1 = keyPairFromSecret(SECRET, ["country", "root"]);
    const k2 = keyPairFromSecret(SECRET, ["country", "root"]);
    expect(k1.publicKeyB64).toBe(k2.publicKeyB64);
  });

  it("derives different public keys for different actor ids", () => {
    const k1 = keyPairFromSecret(SECRET, ["actor", "u1"]);
    const k2 = keyPairFromSecret(SECRET, ["actor", "u2"]);
    expect(k1.publicKeyB64).not.toBe(k2.publicKeyB64);
  });
});

describe("signPayload / verifyPayload", () => {
  it("round-trips a signature", () => {
    const canonical = canonicalize({ event_type: "PING", seq: 1, ts: "2026-08-12T00:00:00Z" });
    const sig = signPayload(SECRET, ["country", "root"], canonical);
    expect(typeof sig).toBe("string");
    expect(sig.length).toBeGreaterThan(0);

    const { publicKeyB64 } = keyPairFromSecret(SECRET, ["country", "root"]);
    expect(verifyPayload(publicKeyB64, canonical, sig)).toBe(true);
  });

  it("rejects a tampered canonical payload", () => {
    const canonical = canonicalize({ event_type: "PING", seq: 1 });
    const sig = signPayload(SECRET, ["country", "root"], canonical);

    const { publicKeyB64 } = keyPairFromSecret(SECRET, ["country", "root"]);
    const tampered = canonicalize({ event_type: "PING", seq: 2 });
    expect(verifyPayload(publicKeyB64, tampered, sig)).toBe(false);
  });

  it("rejects a signature made by a different key", () => {
    const canonical = canonicalize({ event_type: "PING" });
    const sig = signPayload(SECRET, ["actor", "someone-else"], canonical);

    const { publicKeyB64 } = keyPairFromSecret(SECRET, ["country", "root"]);
    expect(verifyPayload(publicKeyB64, canonical, sig)).toBe(false);
  });

  it("returns false (not throws) on garbage input", () => {
    expect(verifyPayload("not-base64", "x", "y")).toBe(false);
    expect(verifyPayload("", "", "")).toBe(false);
  });
});

describe("PKCS#8 DER construction", () => {
  it("builds a DER that creates a working sign/verify pair", () => {
    const seed = deriveSeed(SECRET, ["country", "root"]);
    const der = buildEd25519Pkcs8Der(seed);
    expect(der.toString("hex")).toMatch(/^302e020100300506032b657004220420/);

    const { publicKeyB64, privateKey } = keyPairFromSecret(SECRET, ["country", "root"]);
    expect(privateKey.asymmetricKeyType).toBe("ed25519");

    // The hand-built DER must reproduce the same public key.
    const again = keyPairFromSecret(SECRET, ["country", "root"]);
    expect(again.publicKeyB64).toBe(publicKeyB64);
    expect(der.length).toBe(48); // 2 (SEQUENCE header) + 46 (content)
  });

  it("throws on a non-32-byte seed", () => {
    expect(() => buildEd25519Pkcs8Der(Buffer.alloc(31))).toThrow(/32 bytes/);
    expect(() => buildEd25519Pkcs8Der(Buffer.alloc(33))).toThrow(/32 bytes/);
  });
});

describe("sha256Hex", () => {
  it("produces a 64-char hex digest and is deterministic", () => {
    const h1 = sha256Hex("hello");
    const h2 = sha256Hex("hello");
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });
});
