import { UserActionType } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";

/**
 * Heuristic approximations of Twitter's recommendation stages
 * (github.com/twitter/the-algorithm), all Prisma-query based — no ML.
 *
 *   Stage 1  out-of-network candidates: network engagement (UTEG) + similar users (Real Graph)
 *   Stage 2  content personalization (representation-scorer / SimClusters)
 *   Stage 3  author quality (tweepcred)
 *   Stage 4  re-ranking heuristics: diversity, mix control, quality downrank (visibility-filters)
 *   Stage 5  exploration slots (fresh content)
 *
 * Each stage is behind a flag so it can be tuned or disabled.
 */

export const RECOMMEND_FLAGS = {
  networkEngagement: true,
  similarUsers: true,
  contentPersonalization: true,
  authorQuality: true,
  diversityRerank: true,
  exploration: true,
};

export interface RecommendCandidate {
  id: string;
  authorId: string;
  createdAt: Date;
  likeCount: number;
  replyCount: number;
  shareCount: number;
  /** Author is followed by the viewer → in-network (Twitter's "about half"). */
  isInNetwork: boolean;
}

export interface RankedCandidate extends RecommendCandidate {
  score: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

// =====================
// Stage 1a — network engagement (UTEG/GraphJet analog)
// Posts that the viewer's followed accounts liked/shared/bookmarked, from
// authors the viewer does NOT follow. Weighted by distinct network users.
// =====================
export async function getNetworkEngagementCandidates(
  followingIds: string[],
  followingSet: Set<string>,
  opts: { sinceMs?: number; take?: number } = {}
): Promise<RecommendCandidate[]> {
  const { sinceMs = 7 * DAY_MS, take = 150 } = opts;
  if (!followingIds.length) return [];

  const since = new Date(Date.now() - sinceMs);
  const [likes, shares, bookmarks] = await Promise.all([
    prisma.like.groupBy({
      by: ["postId"],
      where: { userId: { in: followingIds }, createdAt: { gte: since } },
      _count: { _all: true },
    }),
    prisma.share.groupBy({
      by: ["postId"],
      where: { userId: { in: followingIds }, createdAt: { gte: since } },
      _count: { _all: true },
    }),
    prisma.bookmark.groupBy({
      by: ["postId"],
      where: { userId: { in: followingIds }, createdAt: { gte: since } },
      _count: { _all: true },
    }),
  ]);

  const networkCount = new Map<string, number>();
  for (const row of [...likes, ...shares, ...bookmarks]) {
    networkCount.set(row.postId, (networkCount.get(row.postId) ?? 0) + row._count._all);
  }
  if (!networkCount.size) return [];

  const rows = await prisma.post.findMany({
    where: {
      id: { in: Array.from(networkCount.keys()) },
      parentId: null,
      ...(followingSet.size > 0 ? { authorId: { notIn: Array.from(followingSet) } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take,
    select: { id: true, authorId: true, createdAt: true, likeCount: true, replyCount: true, shareCount: true },
  });

  return rows.map((row) => ({ ...row, isInNetwork: false }));
}

// =====================
// Stage 1b — similar users (real-graph analog)
// Users who follow several of the same accounts as the viewer; surface their
// recent top posts.
// =====================
export async function getSimilarUserCandidates(
  userId: string,
  followingIds: string[],
  followingSet: Set<string>,
  opts: { minSharedFollows?: number; sinceMs?: number; take?: number } = {}
): Promise<RecommendCandidate[]> {
  const { minSharedFollows = 2, sinceMs = 7 * DAY_MS, take = 120 } = opts;
  if (!followingIds.length) return [];

  const follows = await prisma.follow.findMany({
    where: {
      followingId: { in: followingIds },
      status: "FOLLOWING",
      followerId: { not: userId },
    },
    select: { followerId: true },
  });

  const shared = new Map<string, number>();
  for (const f of follows) shared.set(f.followerId, (shared.get(f.followerId) ?? 0) + 1);
  const similarUserIds = Array.from(shared.entries())
    .filter(([, count]) => count >= minSharedFollows)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 200)
    .map(([id]) => id);

  if (!similarUserIds.length) return [];

  const rows = await prisma.post.findMany({
    where: {
      parentId: null,
      authorId: { in: similarUserIds, ...(followingSet.size > 0 ? { notIn: Array.from(followingSet) } : {}) },
      createdAt: { gte: new Date(Date.now() - sinceMs) },
    },
    orderBy: [{ likeCount: "desc" }, { createdAt: "desc" }],
    take,
    select: { id: true, authorId: true, createdAt: true, likeCount: true, replyCount: true, shareCount: true },
  });

  return rows.map((row) => ({ ...row, isInNetwork: false }));
}

// =====================
// Stage 2 — content personalization (representation-scorer / SimClusters analog)
// Tokenize post HTML into CJK bigrams + latin word n-grams (no heavy NLP),
// build a profile from the viewer's recently-engaged posts, score candidates
// by weighted overlap.
// =====================
export function tokenizeContent(html: string): Map<string, number> {
  const text = html
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z0-9#]+;/gi, " ")
    .toLowerCase();
  const tokens = new Map<string, number>();

  const cjk = text.match(/[一-鿿]/g) ?? [];
  for (let i = 0; i < cjk.length - 1; i++) {
    const bigram = cjk[i] + cjk[i + 1];
    tokens.set(bigram, (tokens.get(bigram) ?? 0) + 1);
  }

  for (const word of text.match(/[a-z0-9]{2,}/g) ?? []) {
    tokens.set(word, (tokens.get(word) ?? 0) + 1);
  }
  return tokens;
}

export async function getContentProfile(userId: string): Promise<Map<string, number>> {
  const actions = await prisma.userAction.findMany({
    where: {
      userId,
      actionType: { in: [UserActionType.POST_LIKE, UserActionType.POST_BOOKMARK, UserActionType.POST_SHARE, UserActionType.REPLY_CREATE] },
      targetPostId: { not: null },
      createdAt: { gte: new Date(Date.now() - 30 * DAY_MS) },
    },
    orderBy: { createdAt: "desc" },
    take: 60,
    select: { targetPostId: true },
  });

  const postIds = actions.map((a) => a.targetPostId).filter((id): id is string => !!id);
  if (!postIds.length) return new Map();

  const posts = await prisma.post.findMany({ where: { id: { in: postIds } }, select: { content: true } });
  const profile = new Map<string, number>();
  for (const post of posts) {
    for (const [token, count] of tokenizeContent(post.content)) {
      profile.set(token, (profile.get(token) ?? 0) + Math.min(count, 2));
    }
  }
  return profile;
}

export function contentSimilarity(profile: Map<string, number>, content: string): number {
  if (profile.size === 0) return 0;
  const tokens = tokenizeContent(content);
  let overlap = 0;
  for (const [token, count] of tokens) {
    const weight = profile.get(token) ?? 0;
    if (weight > 0) overlap += weight * Math.min(count, 2);
  }
  const norm = Math.sqrt(tokens.size);
  return norm > 0 ? Math.min(overlap / norm / 3, 6) : 0;
}

// =====================
// Stage 3 — author quality (tweepcred analog)
// log1p(followers) + log1p(avg engagement per post), clamped to [0, 4].
// =====================
export async function getAuthorQualityScores(authorIds: string[]): Promise<Map<string, number>> {
  if (!authorIds.length) return new Map();

  const users = await prisma.user.findMany({
    where: { id: { in: authorIds } },
    select: { id: true, _count: { select: { followers: { where: { status: "FOLLOWING" } } } } },
  });
  const postAgg = await prisma.post.groupBy({
    by: ["authorId"],
    where: { authorId: { in: authorIds }, parentId: null },
    _count: { _all: true },
    _sum: { likeCount: true, replyCount: true, shareCount: true },
  });
  const aggByAuthor = new Map(postAgg.map((row) => [row.authorId, row]));

  const scores = new Map<string, number>();
  for (const user of users) {
    const agg = aggByAuthor.get(user.id);
    const postCount = agg?._count._all ?? 0;
    const totalEng = (agg?._sum.likeCount ?? 0) + (agg?._sum.replyCount ?? 0) + (agg?._sum.shareCount ?? 0);
    const avgEng = postCount > 0 ? totalEng / postCount : 0;
    const score = Math.log1p(user._count.followers) * 0.5 + Math.log1p(avgEng + 1) * 1.0;
    scores.set(user.id, Math.min(score, 4));
  }
  return scores;
}

// =====================
// Stage 4 — re-ranking (visibility-filters analog)
// Interleave in-network / out-of-network ~50/50 (preserving score order within
// each pool) and cap CONSECUTIVE same-author posts (break long runs without
// gutting the feed when few authors exist).
// =====================
export function rerankWithDiversity(
  scored: RankedCandidate[],
  opts: { maxConsecutiveSameAuthor?: number } = {}
): RankedCandidate[] {
  const { maxConsecutiveSameAuthor = 3 } = opts;
  const inNetwork = scored.filter((c) => c.isInNetwork);
  const outNetwork = scored.filter((c) => !c.isInNetwork);

  const result: RankedCandidate[] = [];
  const allowed = (authorId: string): boolean => {
    // count the trailing run of this author; reject if it already hits the cap
    for (let back = result.length - 1; back >= 0; back--) {
      if (result[back].authorId !== authorId) break;
      if (result.length - back >= maxConsecutiveSameAuthor) return false;
    }
    return true;
  };

  let i = 0;
  let o = 0;
  let takeIn = true;
  while ((i < inNetwork.length || o < outNetwork.length) && result.length < scored.length) {
    let candidate: RankedCandidate | null = null;
    if (takeIn && i < inNetwork.length) candidate = inNetwork[i++];
    else if (o < outNetwork.length) candidate = outNetwork[o++];
    else if (i < inNetwork.length) candidate = inNetwork[i++];

    if (!candidate) break;
    if (!allowed(candidate.authorId)) continue;

    result.push(candidate);
    takeIn = !takeIn;
  }
  return result;
}

// =====================
// Stage 5 — exploration slots
// Interleave a few recent posts from authors the viewer hasn't engaged with
// every `every` slots, so the feed isn't a filter bubble.
// =====================
export async function addExplorationSlots(
  ranked: RankedCandidate[],
  engagedAuthorIds: Set<string>,
  opts: { every?: number; count?: number; sinceMs?: number } = {}
): Promise<RankedCandidate[]> {
  const { every = 7, count = 3, sinceMs = 3 * DAY_MS } = opts;
  if (!ranked.length) return ranked;

  const excluded = new Set(engagedAuthorIds);
  for (const c of ranked) excluded.add(c.authorId);

  const fresh = await prisma.post.findMany({
    where: {
      parentId: null,
      ...(excluded.size > 0 ? { authorId: { notIn: Array.from(excluded) } } : {}),
      createdAt: { gte: new Date(Date.now() - sinceMs) },
    },
    orderBy: { createdAt: "desc" },
    take: count * 2,
    select: { id: true, authorId: true, createdAt: true, likeCount: true, replyCount: true, shareCount: true },
  });
  const freshCandidates: RecommendCandidate[] = fresh.map((row) => ({ ...row, isInNetwork: false }));

  const result: RankedCandidate[] = [];
  let freshIndex = 0;
  ranked.forEach((candidate, index) => {
    if (
      freshIndex < freshCandidates.length &&
      index > 0 &&
      (index + 1) % every === 0
    ) {
      const fresh = freshCandidates[freshIndex++];
      result.push({ ...fresh, score: candidate.score });
    }
    result.push(candidate);
  });

  return result;
}
