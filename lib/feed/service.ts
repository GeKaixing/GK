import {
  getActiveSponsoredAds,
  interleaveSponsoredPosts,
} from "@/lib/ads/service";
import {
  deleteFeedCache,
  getFeedCache,
  getFeedPageCache,
  isFeedCacheStale,
  releaseFeedRecomputeLock,
  setFeedCache,
  setFeedPageCache,
  tryAcquireFeedRecomputeLock,
} from "@/lib/feed/cache";
import { getFeedProvider } from "@/lib/feed/providers/registry";
import { prisma } from "@/lib/prisma";
import type { FeedPage, FeedPostItem, FeedTab } from "@/lib/feed/types";

interface FeedQueryOptions {
  userId: string | null;
  cursor: string | null;
  limit: number;
  tab?: FeedTab;
}

function normalizeLimit(rawLimit: number): number {
  if (!Number.isFinite(rawLimit)) {
    return 20;
  }

  return Math.min(Math.max(rawLimit, 1), 40);
}

function getStartIndex(postIds: string[], cursor: string | null): number {
  if (!cursor) {
    return 0;
  }

  const index = postIds.findIndex((id) => id === cursor);
  if (index === -1) {
    return 0;
  }

  return index + 1;
}

function getPageNumber(startIndex: number, limit: number): number {
  return Math.floor(startIndex / limit) + 1;
}

async function hydratePostsForPage(userId: string | null, pagePostIds: string[]): Promise<FeedPostItem[]> {
  if (!pagePostIds.length) {
    return [];
  }

  const rows = await prisma.post.findMany({
    where: {
      id: { in: pagePostIds },
      parentId: null,
    },
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
      likes: userId
        ? {
            where: { userId },
            select: { id: true },
          }
        : false,
      bookmarks: userId
        ? {
            where: { userId },
            select: { id: true },
          }
        : false,
      shares: userId
        ? {
            where: { userId },
            select: { id: true },
          }
        : false,
    },
  });

  const byId = new Map<string, FeedPostItem>(
    rows.map((post) => [
      post.id,
      {
        id: post.id,
        content: post.content,
        videoUrl: post.videoUrl ?? null,
        audioUrl: null,
        createdAt: post.createdAt,
        user_id: post.author.id,
        user_name: post.author.name,
        user_email: null,
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
      },
    ])
  );

  return pagePostIds.map((id) => byId.get(id)).filter((item): item is FeedPostItem => item !== undefined);
}

export async function recomputeAndCacheHomeFeed(userId: string | null, tab: FeedTab = "foryou"): Promise<string[]> {
  const lock = await tryAcquireFeedRecomputeLock(userId, tab);
  if (!lock) {
    const existing = await getFeedCache(userId, tab);
    // If Redis (lock/cache) is unavailable and nothing is cached, compute the
    // feed directly instead of returning an empty list.
    if (existing) {
      return existing.postIds;
    }
    // OSP RFC-014: ranking is delegated to the registered feed provider.
    return getFeedProvider(tab).compute(userId);
  }

  try {
    const rankedPostIds = await getFeedProvider(tab).compute(userId);
    await setFeedCache(
      userId,
      {
        postIds: rankedPostIds,
        computedAt: Date.now(),
      },
      tab
    );
    return rankedPostIds;
  } finally {
    await releaseFeedRecomputeLock(lock);
  }
}

export async function getHomeFeed(options: FeedQueryOptions): Promise<FeedPage> {
  const limit = normalizeLimit(options.limit);
  const tab: FeedTab = options.tab ?? "foryou";
  let cached = await getFeedCache(options.userId, tab);

  if (!cached) {
    const postIds = await recomputeAndCacheHomeFeed(options.userId, tab);
    cached = {
      postIds,
      computedAt: Date.now(),
    };
  } else if (isFeedCacheStale(cached)) {
    void recomputeAndCacheHomeFeed(options.userId, tab).catch((error) => {
      console.error("Async feed recompute failed:", error);
    });
  }

  const startIndex = getStartIndex(cached.postIds, options.cursor);
  const pageNumber = getPageNumber(startIndex, limit);
  const isPageAligned = startIndex % limit === 0;
  let pageCache = isPageAligned ? await getFeedPageCache(options.userId, pageNumber, tab) : null;
  if (pageCache && pageCache.limit !== limit) {
    pageCache = null;
  }

  if (!pageCache) {
    const pagePostIds = cached.postIds.slice(startIndex, startIndex + limit);
    const hasMore = startIndex + limit < cached.postIds.length;
    const nextCursor = hasMore ? pagePostIds[pagePostIds.length - 1] ?? null : null;

    pageCache = {
      postIds: pagePostIds,
      hasMore,
      nextCursor,
      limit,
      computedAt: Date.now(),
    };

    if (isPageAligned) {
      await setFeedPageCache(options.userId, pageNumber, pageCache, tab);
    }
  }

  let posts = await hydratePostsForPage(options.userId, pageCache.postIds);
  // 广告在分页后插入（渲染时实时查询），不影响游标与页面缓存。
  const sponsoredAds = await getActiveSponsoredAds();

  // If cached IDs no longer exist (deleted/filtered), recompute once to avoid blank feed pages.
  if (posts.length === 0 && pageCache.postIds.length > 0) {
    const refreshedPostIds = await recomputeAndCacheHomeFeed(options.userId, tab);
    const refreshedStartIndex = getStartIndex(refreshedPostIds, options.cursor);
    const refreshedPagePostIds = refreshedPostIds.slice(refreshedStartIndex, refreshedStartIndex + limit);
    const refreshedHasMore = refreshedStartIndex + limit < refreshedPostIds.length;
    const refreshedNextCursor = refreshedHasMore
      ? refreshedPagePostIds[refreshedPagePostIds.length - 1] ?? null
      : null;

    posts = await hydratePostsForPage(options.userId, refreshedPagePostIds);

    return {
      data: interleaveSponsoredPosts(posts, sponsoredAds),
      page: {
        nextCursor: refreshedNextCursor,
        hasMore: refreshedHasMore,
      },
    };
  }

  return {
    data: interleaveSponsoredPosts(posts, sponsoredAds),
    page: {
      nextCursor: pageCache.nextCursor,
      hasMore: pageCache.hasMore,
    },
  };
}

export async function invalidateUserHomeFeed(userId: string | null): Promise<void> {
  await deleteFeedCache(userId);
}

export async function invalidateAuthorAudienceFeed(authorId: string): Promise<void> {
  const followers = await prisma.follow.findMany({
    where: {
      followingId: authorId,
      status: "FOLLOWING",
    },
    select: {
      followerId: true,
    },
    take: 2000,
  });

  const userIds = new Set<string>([authorId, ...followers.map((item) => item.followerId)]);
  await Promise.all(Array.from(userIds).map((userId) => invalidateUserHomeFeed(userId)));
}
