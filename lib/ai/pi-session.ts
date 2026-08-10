import { JsonlSessionRepo, type AgentMessage, type MessageEntry } from "@earendil-works/pi-agent-core";
import type { PrismaClient } from "@/generated/prisma/client";
import { createPrismaFileSystem } from "./pi-fs";

/**
 * Pi session persistence on Supabase Postgres.
 *
 * `createPiSessionRepo` returns a fully functional Pi `SessionRepo` whose
 * storage lives in the `PiSessionFile` table (via the Prisma filesystem
 * adapter in lib/ai/pi-fs.ts). Sessions are namespaced by `cwd` so each
 * user's conversations live under their own virtual directory.
 */

export const PI_SESSIONS_ROOT = "/sessions";

export function createPiSessionRepo(
  options: { root?: string; prisma?: PrismaClient } = {}
): JsonlSessionRepo {
  return new JsonlSessionRepo({
    fs: createPrismaFileSystem(options.prisma),
    sessionsRoot: options.root ?? PI_SESSIONS_ROOT,
  });
}

/** Open an existing Pi session for a tenant, or create it. */
export async function getOrCreatePiSession(
  repo: JsonlSessionRepo,
  sessionId: string,
  cwd: string
) {
  const existing = (await repo.list({ cwd })).find((session) => session.id === sessionId);
  if (existing) return repo.open(existing);
  return repo.create({ id: sessionId, cwd });
}

/** Read the stored transcript as AgentMessages, oldest first, for seeding an Agent. */
export async function loadPiSessionMessages(session: Awaited<ReturnType<typeof getOrCreatePiSession>>): Promise<AgentMessage[]> {
  const entries = await session.findEntries({ type: "message" });
  return [...entries]
    .sort((a, b) => a.seq - b.seq)
    .map((entry) => (entry as MessageEntry).message);
}
