import { prisma } from "@/lib/prisma";
import { withTimeoutOrNull } from "@/lib/with-timeout";

/**
 * Returns whether any author the current user follows is currently live
 * (LiveStream with `status: "LIVE"`). Presence-based — unlike the feed/chat
 * "new/unread" dots this is not tied to a last-seen cursor. Fail-safe: returns
 * false on any error.
 */
export async function hasFollowedLiveStreams(userId: string): Promise<boolean> {
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

    if (!followingIds.length) {
      return false;
    }

    const count = await withTimeoutOrNull(
      prisma.liveStream.count({
        where: {
          status: "LIVE",
          authorId: { in: followingIds },
        },
      }),
      8000
    );

    return (count ?? 0) > 0;
  } catch {
    return false;
  }
}
