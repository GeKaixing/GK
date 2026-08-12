import { prisma } from "@/lib/prisma";
import { FOLLOWING_CANDIDATE_LIMIT, getFollowingAuthorSet } from "./shared";
import type { FeedProvider } from "./types";

/**
 * OSP RFC-014: the "following" provider — pure reverse-chronological posts from
 * authors the viewer follows (X behavior). No ranking, no personalization.
 */
export const FollowingProvider: FeedProvider = {
  id: "following",
  name: "Following",
  description: "Reverse-chronological posts from authors you follow.",
  dataSources: ["follow_graph"],
  rankingSignals: ["created_at"],
  moderation: ["customs:allow"],
  policies: ["reverse_chronological"],
  async compute(userId) {
    if (!userId) {
      return [];
    }

    const followingIds = Array.from(await getFollowingAuthorSet(userId));
    if (!followingIds.length) {
      return [];
    }

    const rows = await prisma.post.findMany({
      where: {
        parentId: null,
        authorId: { in: followingIds },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: FOLLOWING_CANDIDATE_LIMIT,
      select: { id: true },
    });

    return rows.map((row) => row.id);
  },
};
