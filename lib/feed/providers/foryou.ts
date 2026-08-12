import { UserActionType } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
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
import {
  FOLLOWING_CANDIDATE_LIMIT,
  HOT_CANDIDATE_LIMIT,
  RECENT_CANDIDATE_LIMIT,
  getFollowingAuthorSet,
} from "./shared";
import type { FeedProvider } from "./types";

/**
 * OSP RFC-014: the "for you" provider — the algorithmic home feed.
 *
 * Behavior is byte-for-byte identical to the pre-provider implementation:
 * engagement scoring + time decay + followed-author bonus + UserAction behavior
 * boost + author quality + content personalization + diversity rerank +
 * exploration slots, all gated by RECOMMEND_FLAGS.
 */

const MAX_FEED_POST_IDS = 1000;

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

function decayScore(createdAt: Date): number {
  const hours = Math.max((Date.now() - createdAt.getTime()) / (1000 * 60 * 60), 0);
  return Math.exp(-hours / 24);
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

export const ForyouProvider: FeedProvider = {
  id: "foryou",
  name: "For you",
  description:
    "Algorithmic home feed: engagement, time-decay, followed-author bonus, behavior boost, author quality, content similarity, diversity and exploration.",
  dataSources: ["post_engagement", "follow_graph", "user_actions"],
  rankingSignals: [
    "like_count",
    "reply_count",
    "share_count",
    "time_decay",
    "behavior_boost",
    "author_quality",
    "content_similarity",
  ],
  moderation: ["customs:allow"],
  policies: ["diversity_rerank", "exploration_slots"],
  async compute(userId) {
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
  },
};
