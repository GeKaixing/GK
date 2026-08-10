/**
 * One-off migration: copy existing ChatAISession + ChatAIMessage rows into
 * Pi sessions (PiSessionFile → Supabase Postgres), so chat history survives
 * the switch of /gekaixing/gkx to the Pi agent.
 *
 * Run BEFORE deploying the Pi-based chat:
 *   npx tsx scripts/migrate-chat-sessions.ts
 *
 * Idempotent per session: sessions already present in PiSessionFile are
 * reopened and appended to. Run once.
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.development.local" });

const EMPTY_USAGE = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

async function main() {
  // Dynamic imports so the env above is loaded before Prisma constructs.
  const { prisma } = await import("@/lib/prisma");
  const { createPiSessionRepo, getOrCreatePiSession } = await import("@/lib/ai/pi-session");

  const chatSessions = await prisma.chatAISession.findMany({
    orderBy: { createdAt: "asc" },
  });
  const repo = createPiSessionRepo();
  let migrated = 0;
  let messagesCopied = 0;

  for (const chatSession of chatSessions) {
    const chatMessages = await prisma.chatAIMessage.findMany({
      where: { sessionId: chatSession.id },
      orderBy: { createdAt: "asc" },
    });

    const session = await getOrCreatePiSession(repo, chatSession.id, chatSession.userId);
    await session.setName(chatSession.title || "新对话");

    for (const chatMessage of chatMessages) {
      const timestamp = chatMessage.createdAt.getTime();
      const content = [{ type: "text" as const, text: chatMessage.content }];

      if (chatMessage.role === "user") {
        await session.appendMessage({ role: "user", content, timestamp });
      } else if (chatMessage.role === "assistant") {
        await session.appendMessage({
          role: "assistant",
          content,
          api: "pi-messages",
          provider: "openai",
          model: "unknown",
          usage: EMPTY_USAGE,
          stopReason: "stop",
          timestamp,
        });
      }
      messagesCopied++;
    }

    migrated++;
    console.log(`✔ ${chatSession.id} (${chatSession.userId}) — ${chatMessages.length} messages`);
  }

  console.log(`\nMigrated ${migrated} sessions, ${messagesCopied} messages.`);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
