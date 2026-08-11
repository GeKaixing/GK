import { UserActionType } from "@/generated/prisma/enums";
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
import { prisma } from "@/lib/prisma";
import type { FeedPage, FeedPostItem, FeedTab } from "@/lib/feed/types";
import {
  RECOMMEND_FLAGS,
  addExplorationSlots,
  contentSimilarity,
  getAuthorQualityScores,
  getContentProfile,
  getNetworkEngagementCandidates,
  getSimilarUserCandidates,
  rerankWithDiversity,
  type RankedCandidate,
} from "@/lib/feed/recommend";

const FOLLOWING_CANDIDATE_LIMIT = 400;
const HOT_CANDIDATE_LIMIT = 300;
const RECENT_CANDIDATE_LIMIT = 300;
const MAX_FEED_POST_IDS = 1000;

interface FeedQueryOptions {
  userId: string | null;
  cursor: string | null;
  limit: number;
  tab?: FeedTab;
}

interface FeedCandidate {
  id: string;
  createdAt: Date;
  likeCount: number;
  replyCount: number;
  shareCount: number;
  authorId: string;
  /** Author is followed by the viewer (in-network candidates). */
  isInNetwork: boolean;
}

function normalizeLimit(rawLimit: number): number {
  if (!Number.isFinite(rawLimit)) {
    return 20;
  }

  return Math.min(Math.max(rawLimit, 1), 40);
}

function decayScore(createdAt: Date): number {
  const hours = Math.max((Date.now() - createdAt.getTime()) / (1000 * 60 * 60), 0);
  return Math.exp(-hours / 24);
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

function sortByScore(a: RankedCandidate, b: RankedCandidate): number {
  if (b.score !== a.score) return b.score - a.score;
  if (b.createdAt.getTime() !== a.createdAt.getTime()) return b.createdAt.getTime() - a.createdAt.getTime();
  return b.id.localeCompare(a.id);
}

function rankCandidates(
  candidates: FeedCandidate[],
  followingAuthorSet: Set<string>,
  behaviorBoostMap: Map<string, number>,
  authorQualityMap: Map<string, number>
): RankedCandidate[] {
  const scored: RankedCandidate[] = candidates.map((candidate) => {
    const engagement =
      Math.log1p(candidate.likeCount) * 1.5 +
      Math.log1p(candidate.replyCount) * 1.3 +
      Math.log1p(candidate.shareCount) * 2.0;
    const socialBonus = followingAuthorSet.has(candidate.authorId) ? 10 : 0;
    const behaviorBonus = behaviorBoostMap.get(candidate.authorId) ?? 0;
    const qualityBonus = authorQualityMap.get(candidate.authorId) ?? 0;
    const score =
      engagement +
      decayScore(candidate.createdAt) * 8 +
      socialBonus +
      behaviorBonus +
      qualityBonus;

    return { ...candidate, score };
  });

  scored.sort(sortByScore);
  return scored;
}

function getActionWeight(actionType: UserActionType, dwellMs: number | null): number {
  switch (actionType) {
    case UserActionType.POST_LIKE:
      return 3;
    case UserActionType.POST_BOOKMARK:
      return 4;
    case UserActionType.POST_SHARE:
      return 5;
    case UserActionType.REPLY_CREATE:
      return 4;
    case UserActionType.POST_CLICK:
      return 1.5;
    case UserActionType.DWELL:
      return Math.min((dwellMs ?? 0) / 4000, 3);
    case UserActionType.POST_UNLIKE:
    case UserActionType.POST_UNBOOKMARK:
      return -2;
    default:
      return 0.2;
  }
}

async function getBehaviorAuthorBoostMap(userId: string): Promise<Map<string, number>> {
  const actions = await prisma.userAction.findMany({
    where: {
      userId,
      targetAuthorId: { not: null },
    },
    orderBy: { createdAt: "desc" },
    take: 600,
    select: {
      targetAuthorId: true,
      actionType: true,
      dwellMs: true,
    },
  });

  const boostMap = new Map<string, number>();
  actions.forEach((action) => {
    if (!action.targetAuthorId) {
      return;
    }

    const current = boostMap.get(action.targetAuthorId) ?? 0;
    boostMap.set(
      action.targetAuthorId,
      Math.min(current + getActionWeight(action.actionType, action.dwellMs), 15)
    );
  });

  return boostMap;
}

async function getFollowingAuthorSet(userId: string): Promise<Set<string>> {
  const follows = await prisma.follow.findMany({
    where: {
      followerId: userId,
      status: "FOLLOWING",
    },
    select: {
      followingId: true,
    },
  });

  return new Set<string>(follows.map((item) => item.followingId));
}

async function buildCandidatePool(userId: string | null, tab: FeedTab = "foryou"): Promise<string[]> {
  // Following tab: pure reverse-chronological posts from followed authors (X behavior).
  if (tab === "following") {
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
  }

  const followingAuthorSet = userId ? await getFollowingAuthorSet(userId) : new Set<string>();
  const followingIds = Array.from(followingAuthorSet);
  const behaviorBoostMap = userId ? await getBehaviorAuthorBoostMap(userId) : new Map<string, number>();

  const [followingPosts, hotPosts, recentPosts] = await Promise.all([
    followingIds.length
      ? prisma.post.findMany({
          where: {
            parentId: null,
            authorId: { in: followingIds },
          },
          orderBy: [{ createdAt: "desc" }],
          take: FOLLOWING_CANDIDATE_LIMIT,
          select: {
            id: true,
            createdAt: true,
            likeCount: true,
            replyCount: true,
            shareCount: true,
            authorId: true,
          },
        })
      : Promise.resolve([]),
    prisma.post.findMany({
      where: { parentId: null },
      orderBy: [{ likeCount: "desc" }, { replyCount: "desc" }, { shareCount: "desc" }, { createdAt: "desc" }],
      take: HOT_CANDIDATE_LIMIT,
      select: {
        id: true,
        createdAt: true,
        likeCount: true,
        replyCount: true,
        shareCount: true,
        authorId: true,
      },
    }),
    prisma.post.findMany({
      where: { parentId: null },
      orderBy: [{ createdAt: "desc" }],
      take: RECENT_CANDIDATE_LIMIT,
      select: {
        id: true,
        createdAt: true,
        likeCount: true,
        replyCount: true,
        shareCount: true,
        authorId: true,
      },
    }),
  ]);

  const deduped = new Map<string, FeedCandidate>();
  const addCandidate = (
    rows: Array<Pick<FeedCandidate, "id" | "createdAt" | "likeCount" | "replyCount" | "shareCount" | "authorId">>,
    isInNetwork: boolean | ((row: Pick<FeedCandidate, "id" | "authorId">) => boolean)
  ) => {
    for (const row of rows) {
      deduped.set(row.id, {
        ...row,
        isInNetwork: typeof isInNetwork === "function" ? isInNetwork(row) : isInNetwork,
      });
    }
  };

  addCandidate(followingPosts, true);
  addCandidate(hotPosts, (row) => followingAuthorSet.has(row.authorId));
  addCandidate(recentPosts, (row) => followingAuthorSet.has(row.authorId));

  // Stage 1 — out-of-network candidates (only meaningful for an authed user)
  if (userId && followingIds.length) {
    if (RECOMMEND_FLAGS.networkEngagement) {
      addCandidate(
        await getNetworkEngagementCandidates(followingIds, followingAuthorSet),
        false
      );
    }
    if (RECOMMEND_FLAGS.similarUsers) {
      addCandidate(
        await getSimilarUserCandidates(userId, followingIds, followingAuthorSet),
        false
      );
    }
  }

  const candidates = Array.from(deduped.values());

  // Stage 3 — author quality (tweepcred analog)
  const authorQualityMap = RECOMMEND_FLAGS.authorQuality
    ? await getAuthorQualityScores(Array.from(new Set(candidates.map((c) => c.authorId))))
    : new Map<string, number>();

  let ranked = rankCandidates(candidates, followingAuthorSet, behaviorBoostMap, authorQualityMap);

  // Stage 2 — content personalization (representation-scorer analog)
  let contentProfile: Map<string, number> | null = null;
  if (RECOMMEND_FLAGS.contentPersonalization && userId) {
    contentProfile = await getContentProfile(userId);
  }
  if (contentProfile && contentProfile.size > 0 && ranked.length > 0) {
    const top = ranked.slice(0, 400);
    const rest = ranked.slice(400);
    const contentRows = await prisma.post.findMany({
      where: { id: { in: top.map((c) => c.id) } },
      select: { id: true, content: true },
    });
    const contentById = new Map(contentRows.map((row) => [row.id, row.content]));
    for (const candidate of top) {
      candidate.score += contentSimilarity(contentProfile, contentById.get(candidate.id) ?? "");
    }
    top.sort(sortByScore);
    ranked = [...top, ...rest];
  }

  // Stage 4 — diversity re-ranking (visibility-filters analog)
  if (RECOMMEND_FLAGS.diversityRerank) {
    ranked = rerankWithDiversity(ranked);
  }

  // Stage 5 — exploration slots
  if (RECOMMEND_FLAGS.exploration && userId) {
    const engagedAuthorIds = new Set<string>([
      ...followingAuthorSet,
      ...Array.from(behaviorBoostMap.keys()),
    ]);
    ranked = await addExplorationSlots(ranked, engagedAuthorIds);
  }

  return ranked.slice(0, MAX_FEED_POST_IDS).map((item) => item.id);
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
    return buildCandidatePool(userId, tab);
  }

  try {
    const rankedPostIds = await buildCandidatePool(userId, tab);
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
      data: posts,
      page: {
        nextCursor: refreshedNextCursor,
        hasMore: refreshedHasMore,
      },
    };
  }

  return {
    data: posts,
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
