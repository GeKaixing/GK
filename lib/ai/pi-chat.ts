import {
  type AgentMessage,
  type JsonlSessionMetadata,
  type JsonlSessionRepo,
  type MessageEntry,
  SessionError,
  type Session,
} from "@earendil-works/pi-agent-core";
import { createPiSessionRepo, getOrCreatePiSession } from "./pi-session";

/**
 * App-level chat adapter over Pi sessions (lib/ai/pi-session.ts).
 *
 * Maps Pi's session layer to the shapes the GKX chat UI expects, with each
 * user's conversations isolated under `cwd = userId`. This is the only module
 * the chat API routes (app/api/chat/*) depend on — swapping the storage back
 * would only touch this file and pi-fs.ts.
 */

export interface ChatSessionSummary {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

export interface ChatMessageRecord {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const DEFAULT_TITLE = "新对话";

/** Flatten an AgentMessage's content blocks into plain display text. */
export function flattenMessageText(message: AgentMessage): string {
  const content = "content" in message ? message.content : "";
  if (typeof content === "string") return content;
  return content
    .filter((block): block is { type: "text"; text: string } => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}

/**
 * Pi's session codec rejects `undefined` values ("Durable payload contains
 * undefined"). Agent-produced messages carry optional fields set to
 * `undefined`; drop them (JSON round-trip) before persisting.
 */
export function sanitizeMessage<T>(message: T): T {
  return JSON.parse(JSON.stringify(message)) as T;
}

/** Persist a message, stripping any `undefined` fields the codec rejects. */
export async function appendChatMessage(
  session: Session<JsonlSessionMetadata>,
  message: AgentMessage
): Promise<void> {
  await session.appendMessage(sanitizeMessage(message));
}

/** Open (or create) a chat session for a user. */
export function getOrCreateChatSession(
  repo: JsonlSessionRepo,
  sessionId: string,
  userId: string
): Promise<Session<JsonlSessionMetadata>> {
  return getOrCreatePiSession(repo, sessionId, userId);
}

/**
 * Open a chat session, self-healing if the stored file is corrupt (e.g. a
 * failed write left a non-consecutive seq). Drops the broken session and
 * starts fresh instead of throwing a 500.
 */
export async function openOrResetChatSession(
  repo: JsonlSessionRepo,
  sessionId: string,
  userId: string
): Promise<Session<JsonlSessionMetadata>> {
  try {
    return await getOrCreateChatSession(repo, sessionId, userId);
  } catch (error) {
    if (error instanceof SessionError) {
      console.error(`Pi session ${sessionId} is corrupt; resetting: ${error.message}`);
      await deleteChatSession(sessionId, userId, repo).catch(() => {});
      return getOrCreateChatSession(repo, sessionId, userId);
    }
    throw error;
  }
}

/** List a user's chat sessions, newest first. Corrupt sessions are dropped. */
export async function listChatSessions(
  userId: string,
  repo: JsonlSessionRepo = createPiSessionRepo()
): Promise<ChatSessionSummary[]> {
  const metadataList = await repo.list({ cwd: userId });
  const summaries: ChatSessionSummary[] = [];
  for (const metadata of metadataList) {
    try {
      const session = await repo.open(metadata);
      const title = (await session.getName()) ?? DEFAULT_TITLE;
      summaries.push({
        id: metadata.id,
        title,
        createdAt: metadata.createdAt,
        updatedAt: metadata.modifiedAt,
      });
    } catch (error) {
      if (error instanceof SessionError) {
        console.error(`Dropping corrupt Pi session ${metadata.id}: ${error.message}`);
        await repo.delete(metadata).catch(() => {});
        continue;
      }
      throw error;
    }
  }
  return summaries;
}

/** Load a session's user/assistant messages for display, oldest first. */
export async function getChatMessages(
  sessionId: string,
  userId: string,
  repo: JsonlSessionRepo = createPiSessionRepo()
): Promise<ChatMessageRecord[]> {
  const existing = (await repo.list({ cwd: userId })).find((session) => session.id === sessionId);
  if (!existing) return [];
  let session: Session<JsonlSessionMetadata>;
  try {
    session = await repo.open(existing);
  } catch (error) {
    if (error instanceof SessionError) {
      console.error(`Dropping corrupt Pi session ${sessionId}: ${error.message}`);
      await repo.delete(existing).catch(() => {});
      return [];
    }
    throw error;
  }
  const entries = await session.findEntries({ type: "message" });
  const records: ChatMessageRecord[] = [];
  for (const entry of [...entries].sort((a, b) => a.seq - b.seq)) {
    const message = (entry as MessageEntry).message;
    if (message.role === "toolResult") continue; // tool results are context, not display
    records.push({
      id: (entry as MessageEntry).id,
      role: message.role === "assistant" ? "assistant" : "user",
      content: flattenMessageText(message),
    });
  }
  return records;
}

/** Set a chat session's title. Returns false if the session is not found. */
export async function setChatTitle(
  sessionId: string,
  userId: string,
  title: string,
  repo: JsonlSessionRepo = createPiSessionRepo()
): Promise<boolean> {
  const existing = (await repo.list({ cwd: userId })).find((session) => session.id === sessionId);
  if (!existing) return false;
  try {
    const session = await repo.open(existing);
    await session.setName(title);
    return true;
  } catch (error) {
    if (error instanceof SessionError) {
      console.error(`Dropping corrupt Pi session ${sessionId}: ${error.message}`);
      await repo.delete(existing).catch(() => {});
      return false;
    }
    throw error;
  }
}

/** Delete a chat session for a user. */
export async function deleteChatSession(
  sessionId: string,
  userId: string,
  repo: JsonlSessionRepo = createPiSessionRepo()
): Promise<void> {
  const existing = (await repo.list({ cwd: userId })).find((session) => session.id === sessionId);
  if (!existing) return;
  await repo.delete(existing);
}
