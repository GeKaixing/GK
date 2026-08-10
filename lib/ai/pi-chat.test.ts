import { afterAll, describe, expect, it } from "vitest";

import {
  appendChatMessage,
  deleteChatSession,
  getChatMessages,
  getOrCreateChatSession,
  listChatSessions,
  setChatTitle,
} from "@/lib/ai/pi-chat";
import { createPrismaFileSystem } from "@/lib/ai/pi-fs";
import { createPiSessionRepo } from "@/lib/ai/pi-session";

/**
 * App-level chat adapter over Pi sessions. DB integration test — skipped
 * unless RUN_DB_TESTS=1 (see lib/ai/pi-session.test.ts for why).
 */

const runDbTests = process.env.RUN_DB_TESTS === "1";
const cleanupRoots: string[] = [];

function testRepo() {
  const root = `/sessions/chat-${Math.random().toString(36).slice(2)}`;
  cleanupRoots.push(root);
  return createPiSessionRepo({ root });
}

afterAll(
  async () => {
    const fs = createPrismaFileSystem();
    for (const root of cleanupRoots) {
      await fs.remove(root, { recursive: true, force: true });
    }
  },
  60_000
);

const userText = (text: string) => ({
  role: "user" as const,
  content: [{ type: "text" as const, text }],
  timestamp: Date.now(),
});

const assistantText = (text: string) => ({
  role: "assistant" as const,
  content: [{ type: "text" as const, text }],
  api: "openai-responses" as const,
  provider: "openai" as const,
  model: "gpt-4o" as const,
  usage: {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  },
  stopReason: "stop" as const,
  timestamp: Date.now(),
});

describe.skipIf(!runDbTests)("pi-chat adapter", () => {
  it(
    "round-trips messages, title, and deletion",
    { timeout: 30_000 },
    async () => {
      const repo = testRepo();
      const session = await getOrCreateChatSession(repo, "s1", "u1");
      await session.appendMessage(userText("hi"));
      await session.appendMessage(assistantText("hello there"));

      const messages = await getChatMessages("s1", "u1", repo);
      expect(messages.map((m) => m.content)).toEqual(["hi", "hello there"]);

      await setChatTitle("s1", "u1", "我的标题", repo);
      const sessions = await listChatSessions("u1", repo);
      expect(sessions[0]).toMatchObject({ id: "s1", title: "我的标题" });

      await deleteChatSession("s1", "u1", repo);
      expect(await getChatMessages("s1", "u1", repo)).toHaveLength(0);
    }
  );

  it(
    "persists agent-produced messages with undefined optional fields",
    { timeout: 30_000 },
    async () => {
      const repo = testRepo();
      const session = await getOrCreateChatSession(repo, "s1", "u1");
      // Pi agent messages carry optional fields set to undefined, which the
      // JSONL codec rejects; appendChatMessage must strip them.
      const agentMessage = {
        ...assistantText("hi"),
        responseId: undefined,
        diagnostics: undefined,
      };
      await appendChatMessage(session, agentMessage);

      const messages = await getChatMessages("s1", "u1", repo);
      expect(messages[0].content).toBe("hi");
    }
  );

  it(
    "keeps sessions isolated per user (cwd)",
    { timeout: 30_000 },
    async () => {
      const repo = testRepo();
      await getOrCreateChatSession(repo, "s1", "alice");
      await getOrCreateChatSession(repo, "s1", "bob");

      expect(await listChatSessions("alice", repo)).toHaveLength(1);
      expect(await listChatSessions("bob", repo)).toHaveLength(1);
      expect(await getChatMessages("s1", "alice", repo)).toHaveLength(0);
    }
  );
});
