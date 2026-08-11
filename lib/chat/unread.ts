import { prisma } from "@/lib/prisma";
import { withTimeoutOrNull } from "@/lib/with-timeout";

/**
 * Returns whether the current user has any unread conversation message.
 *
 * Mirrors the per-conversation unread math used by `/api/chat/conversations`
 * (`messageCount - lastReadMessageCount`) but refines it for a nav-level dot: a
 * conversation counts as unread only when the latest message was sent by someone
 * else — i.e. the "ball is in the user's court". This avoids lighting the dot for
 * messages the user just sent themselves (sending increments `messageCount` but
 * does not advance the sender's `ConversationRead`). Muted participants are not
 * excluded, matching the conversations list. Fail-safe: returns false on error.
 */
export async function hasUnreadChatMessages(userId: string): Promise<boolean> {
  try {
    const conversations = await withTimeoutOrNull(
      prisma.conversation.findMany({
        where: {
          participants: {
            some: {
              userId,
            },
          },
        },
        select: {
          id: true,
          messageCount: true,
          readStates: {
            where: { userId },
            select: { lastReadMessageCount: true },
          },
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { senderId: true },
          },
        },
      }),
      8000
    );

    if (!conversations) {
      return false;
    }

    return conversations.some(
      (conversation) =>
        conversation.messageCount >
          (conversation.readStates[0]?.lastReadMessageCount ?? 0) &&
        conversation.messages[0]?.senderId !== userId
    );
  } catch {
    return false;
  }
}
