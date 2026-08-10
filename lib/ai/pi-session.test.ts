import { createSessionBackendConformance } from "@earendil-works/pi-agent-core/session/testing";
import { afterAll, describe, expect, it } from "vitest";

import { createPrismaFileSystem } from "@/lib/ai/pi-fs";
import { createPiSessionRepo, getOrCreatePiSession, loadPiSessionMessages } from "@/lib/ai/pi-session";

/**
 * Validation for the Prisma/Supabase-Postgres session backend.
 *
 * Pi ships a conformance suite for custom SessionStorage/SessionRepo
 * implementations; running it proves our Prisma filesystem adapter behaves
 * like Pi's own backends.
 *
 * This is a DB integration test — it hits the real dev Supabase Postgres
 * (the `PiSessionFile` table must exist via `npx prisma db push`). It is
 * skipped unless `RUN_DB_TESTS=1`, so the default unit suite stays fast and
 * DB-free:
 *
 *   RUN_DB_TESTS=1 npx vitest run lib/ai/pi-session.test.ts --maxWorkers=1
 *
 * Each case gets an isolated root prefix and is removed on dispose.
 */

const CONFORMANCE_TIMEOUT_MS = 30_000;
const HOOK_TIMEOUT_MS = 60_000;

const runDbTests = process.env.RUN_DB_TESTS === "1";

const cleanupRoots: string[] = [];

/** Round-trip tests create their own repo + root and register it for cleanup. */
function createTestRepo() {
  const root = `/sessions/test-${Math.random().toString(36).slice(2)}`;
  cleanupRoots.push(root);
  return { repo: createPiSessionRepo({ root }), root };
}

/** Conformance fixtures dispose their own root; no double cleanup needed. */
async function createConformanceFixture() {
  const root = `/sessions/conformance-${Math.random().toString(36).slice(2)}`;
  return {
    repository: createPiSessionRepo({ root }),
    async [Symbol.asyncDispose]() {
      await createPrismaFileSystem().remove(root, { recursive: true, force: true });
    },
  };
}

afterAll(
  async () => {
    const fs = createPrismaFileSystem();
    for (const root of cleanupRoots) {
      await fs.remove(root, { recursive: true, force: true });
    }
  },
  HOOK_TIMEOUT_MS
);

const conformance = createSessionBackendConformance(createConformanceFixture);

describe.skipIf(!runDbTests)("pi-session Postgres backend (Pi conformance)", () => {
  for (const testCase of conformance) {
    it(`${testCase.group} › ${testCase.name}`, { timeout: CONFORMANCE_TIMEOUT_MS }, () => testCase.run());
  }
});

describe.skipIf(!runDbTests)("pi-session round-trip", () => {
  it(
    "persists a message and reloads it after reopening the session",
    { timeout: 20_000 },
    async () => {
      const { repo, root } = createTestRepo();

      const session = await getOrCreatePiSession(repo, "session-1", "user-1");
      await session.appendMessage({
        role: "user",
        content: [{ type: "text", text: "hello pi" }],
        timestamp: Date.now(),
      });

      // A second open reads the same Postgres rows (fresh repo instance too).
      const reopened = await getOrCreatePiSession(createPiSessionRepo({ root }), "session-1", "user-1");
      const messages = await loadPiSessionMessages(reopened);

      expect(messages.length).toBe(1);
      const first = messages[0] as { role: string; content: Array<{ type: string; text?: string }> };
      expect(first.role).toBe("user");
      expect(first.content[0].text).toBe("hello pi");
    }
  );

  it(
    "keeps sessions isolated per cwd (tenant)",
    { timeout: 20_000 },
    async () => {
      const { repo } = createTestRepo();
      await getOrCreatePiSession(repo, "session-1", "alice");
      await getOrCreatePiSession(repo, "session-1", "bob");

      const alice = await loadPiSessionMessages(await getOrCreatePiSession(repo, "session-1", "alice"));
      const bob = await loadPiSessionMessages(await getOrCreatePiSession(repo, "session-1", "bob"));
      expect(alice).toHaveLength(0);
      expect(bob).toHaveLength(0);
    }
  );
});
