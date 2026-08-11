import { prisma } from "@/lib/prisma";
import { withTimeoutOrNull } from "@/lib/with-timeout";

/**
 * Returns whether the current user's "for you" home feed likely contains new
 * top-level posts since `lastSeenAt` (or any, when null). Approximates the
 * feed's candidate pool (following posts + hot/recent posts): a post counts if
 * it was created by a followed author, or has any engagement (would rank in the
 * hot pool). Own posts are excluded. Fail-safe: returns false on any error.
 */
export async function hasNewHomeFeedTweets(userId: string, lastSeenAt: Date | null): Promise<boolean> {
  try {
    const follows = await withTimeoutOrNull(
      prisma.follow.findMany({
        where: {
          followerId: userId,
          status: "FOLLOWING",
        },
        select: {
          followingId: true,
        },
      }),
      8000
    );
    const followingIds = (follows ?? []).map((item) => item.followingId);

    const count = await withTimeoutOrNull(
      prisma.post.count({
        where: {
          parentId: null,
          createdAt: lastSeenAt ? { gt: lastSeenAt } : undefined,
          authorId: { not: userId },
          OR: [
            { authorId: { in: followingIds } },
            { likeCount: { gt: 0 } },
            { replyCount: { gt: 0 } },
            { shareCount: { gt: 0 } },
          ],
        },
      }),
      8000
    );

    return (count ?? 0) > 0;
  } catch {
    return false;
  }
}
