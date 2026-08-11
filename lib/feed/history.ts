import { prisma } from "@/lib/prisma";
import { UserActionType } from "@/generated/prisma/enums";
import type { FeedPage } from "@/lib/feed/types";

/**
 * Browsing-history helpers.
 *
 * History is derived from existing `UserAction` rows of type `POST_CLICK`
 * (logged by `components/gekaixing/PostCard.tsx` -> `/api/post/interaction`).
 * Posts are deduplicated by id (a user can click the same post many times) and
 * ordered by the most recent click.
 */

const HISTORY_DEFAULT_LIMIT = 20;

interface HistoryPage {
  ids: string[];
  hasMore: boolean;
}

export async function getHistoryPostIds(
  userId: string,
  offset: number,
  limit: number = HISTORY_DEFAULT_LIMIT
): Promise<HistoryPage> {
  const groups = await prisma.userAction.groupBy({
    by: ["targetPostId"],
    where: {
      userId,
      actionType: UserActionType.POST_CLICK,
      targetPostId: { not: null },
    },
    _max: { createdAt: true },
    orderBy: [{ _max: { createdAt: "desc" } }, { targetPostId: "desc" }],
    take: limit + 1,
    skip: offset,
  });

  const ids = groups
    .map((group) => group.targetPostId)
    .filter((id): id is string => id !== null);

  const hasMore = ids.length > limit;
  return { ids: hasMore ? ids.slice(0, limit) : ids, hasMore };
}

export async function getHistoryFeed(
  userId: string,
  offset: number,
  limit: number = HISTORY_DEFAULT_LIMIT
): Promise<FeedPage> {
  const { ids, hasMore } = await getHistoryPostIds(userId, offset, limit);

  if (ids.length === 0) {
    return { data: [], page: { nextCursor: null, hasMore: false } };
  }

  const posts = await prisma.post.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      content: true,
      createdAt: true,
      videoUrl: true,
      author: {
        select: {
          id: true,
          userid: true,
          name: true,
          avatar: true,
          isPremium: true,
        },
      },
      _count: {
        select: {
          likes: true,
          bookmarks: true,
          shares: true,
          replies: true,
        },
      },
      likes: {
        where: { userId },
        select: { id: true },
      },
      bookmarks: {
        where: { userId },
        select: { id: true },
      },
      shares: {
        where: { userId },
        select: { id: true },
      },
    },
  });

  const byId = new Map(posts.map((post) => [post.id, post]));

  const data = ids
    .map((id) => byId.get(id))
    .filter((post): post is NonNullable<typeof post> => post !== undefined)
    .map((post) => ({
      id: post.id,
      content: post.content,
      videoUrl: post.videoUrl ?? null,
      audioUrl: null,
      createdAt: post.createdAt,
      user_id: post.author.id,
      user_name: post.author.name,
      user_avatar: post.author.avatar,
      user_userid: post.author.userid,
      isPremium: post.author.isPremium,
      like: post._count.likes,
      star: post._count.bookmarks,
      share: post._count.shares,
      reply: post._count.replies,
      likedByMe: post.likes?.length > 0,
      bookmarkedByMe: post.bookmarks?.length > 0,
      sharedByMe: post.shares?.length > 0,
    }));

  return {
    data,
    page: {
      nextCursor: hasMore ? String(offset + limit) : null,
      hasMore,
    },
  };
}
