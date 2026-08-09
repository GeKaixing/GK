import { cache } from "react";

import { UserActionType } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import type {
  DashboardAcquireHandlesData,
  DashboardActionLogItem,
  DashboardAffiliationItem,
  DashboardAffiliationsData,
  DashboardAudienceSegmentItem,
  DashboardBillingData,
  DashboardContentSegmentItem,
  DashboardConversationItem,
  DashboardFunnelItem,
  DashboardHandleItem,
  DashboardHireTalentData,
  DashboardJobPostItem,
  DashboardHomeData,
  DashboardPremiumUserItem,
  DashboardRadarData,
  DashboardSettingsData,
  DashboardSupportData,
  DashboardTalentItem,
  DashboardTrafficSourceItem,
  DashboardTrendPoint,
  DashboardUserActionItem,
} from "@/lib/dashboard/types";

const DEFAULT_HOME_DATA: DashboardHomeData = {
  summary: {
    totalUsers: 0,
    totalPremiumUsers: 0,
    totalPosts: 0,
    totalReplies: 0,
    totalMessages: 0,
    weeklyNewUsers: 0,
    weeklyNewPosts: 0,
  },
  coreMetrics: {
    dau: 0,
    wau: 0,
    mau: 0,
    newUsersToday: 0,
    d1Retention: 0,
    d7Retention: 0,
    avgInteractionsPerActiveUser7d: 0,
    interactions7d: 0,
    activeUsers7d: 0,
  },
  dauTrend: [],
  retentionCohorts: [],
  retentionWeeklyCohorts: [],
  rates: {
    impressions: 0,
    postClicks: 0,
    repliesReceived: 0,
    profileEnters: 0,
    impressionsPv: 0,
    postClicksPv: 0,
    repliesReceivedPv: 0,
    profileEntersPv: 0,
    postClickRate: 0,
    replyRate: 0,
    profileEnterRate: 0,
  },
  trend: [],
  recentPosts: [],
  trafficSources: [],
  funnel: [],
  audienceSegments: [],
  contentSegments: [],
};

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatLocalDayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getWeekStartKey(dateKey: string): string {
  const date = new Date(`${dateKey}T00:00:00`);
  const day = date.getDay();
  const offset = day === 0 ? 6 : day - 1;
  date.setDate(date.getDate() - offset);
  return formatLocalDayKey(date);
}

function getRecentDayKeys(days: number): string[] {
  const today = new Date();
  const keys: string[] = [];

  for (let index = days - 1; index >= 0; index -= 1) {
    const current = new Date(today);
    current.setDate(today.getDate() - index);
    keys.push(formatDayKey(current));
  }

  return keys;
}

function toTrendMap(keys: string[]): Map<string, DashboardTrendPoint> {
  return new Map<string, DashboardTrendPoint>(
    keys.map((key) => [
      key,
      {
        date: key,
        posts: 0,
        replies: 0,
      },
    ])
  );
}

function toRate(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    return 0;
  }

  return (numerator / denominator) * 100;
}

function countUniqueUsersByPost(rows: Array<{ targetPostId: string | null; userId: string }>): Map<string, number> {
  const postMap = new Map<string, number>();

  rows.forEach((item) => {
    if (!item.targetPostId) {
      return;
    }

    const current = postMap.get(item.targetPostId) ?? 0;
    postMap.set(item.targetPostId, current + 1);
  });

  return postMap;
}

function countEventsByPost(rows: Array<{ targetPostId: string | null; _count: { _all: number } }>): Map<string, number> {
  return new Map(
    rows
      .filter((item): item is { targetPostId: string; _count: { _all: number } } => !!item.targetPostId)
      .map((item) => [item.targetPostId, item._count._all])
  );
}

type ActionKind = "feed_impression" | "post_click" | "profile_enter" | "reply_create" | "follow" | "unknown";

type ParsedActionMetadata = {
  source: string;
  kind: ActionKind;
};

type ActionMetricBucket = {
  impressionsUsers: Set<string>;
  postClickUsers: Set<string>;
  repliesUsers: Set<string>;
  profileEnterUsers: Set<string>;
  impressionsPv: number;
  postClicksPv: number;
  repliesPv: number;
  profileEntersPv: number;
};

function createActionMetricBucket(): ActionMetricBucket {
  return {
    impressionsUsers: new Set<string>(),
    postClickUsers: new Set<string>(),
    repliesUsers: new Set<string>(),
    profileEnterUsers: new Set<string>(),
    impressionsPv: 0,
    postClicksPv: 0,
    repliesPv: 0,
    profileEntersPv: 0,
  };
}

function parseActionMetadata(metadata: string | null): ParsedActionMetadata {
  if (!metadata) {
    return { source: "unknown", kind: "unknown" };
  }

  try {
    const parsed = JSON.parse(metadata) as {
      source?: unknown;
      kind?: unknown;
    };
    const source = typeof parsed.source === "string" && parsed.source.trim() ? parsed.source.trim() : "unknown";
    const rawKind = typeof parsed.kind === "string" ? parsed.kind : "";
    if (rawKind === "profile_enter") {
      return { source, kind: "profile_enter" };
    }
    if (rawKind === "post_click") {
      return { source, kind: "post_click" };
    }
    if (rawKind === "feed_impression") {
      return { source, kind: "feed_impression" };
    }
    if (rawKind === "reply_create") {
      return { source, kind: "reply_create" };
    }
    if (rawKind === "follow") {
      return { source, kind: "follow" };
    }

    return { source, kind: "unknown" };
  } catch {
    return { source: "unknown", kind: "unknown" };
  }
}

function applyActionToBucket(
  bucket: ActionMetricBucket,
  action: { actionType: string; userId: string; metadata: string | null }
): void {
  const parsed = parseActionMetadata(action.metadata);

  if (action.actionType === "FEED_IMPRESSION") {
    bucket.impressionsUsers.add(action.userId);
    bucket.impressionsPv += 1;
    return;
  }

  if (action.actionType === "REPLY_CREATE") {
    bucket.repliesUsers.add(action.userId);
    bucket.repliesPv += 1;
    return;
  }

  if (action.actionType === "POST_CLICK") {
    if (parsed.kind === "profile_enter") {
      bucket.profileEnterUsers.add(action.userId);
      bucket.profileEntersPv += 1;
      return;
    }

    bucket.postClickUsers.add(action.userId);
    bucket.postClicksPv += 1;
  }
}

function bucketToTrafficItem(source: string, bucket: ActionMetricBucket): DashboardTrafficSourceItem {
  return {
    source,
    impressions: bucket.impressionsUsers.size,
    postClicks: bucket.postClickUsers.size,
    repliesReceived: bucket.repliesUsers.size,
    profileEnters: bucket.profileEnterUsers.size,
    impressionsPv: bucket.impressionsPv,
    postClicksPv: bucket.postClicksPv,
    repliesReceivedPv: bucket.repliesPv,
    profileEntersPv: bucket.profileEntersPv,
  };
}

function normalizeSourceLabel(source: string): string {
  if (!source || source === "unknown") {
    return "unknown";
  }

  if (source === "post_card") {
    return "feed_card";
  }

  if (source === "status_detail") {
    return "status_page";
  }

  return source;
}

function getContentSegment(post: { content: string; videoUrl: string | null; audioUrl: string | null }): string {
  const hasVideo = !!post.videoUrl || post.content.includes("data-youtube-embed") || post.content.includes("data-video-embed");
  const hasAudio = !!post.audioUrl || post.content.includes("data-audio-embed");
  const textLength = post.content.replace(/<[^>]*>/g, "").trim().length;

  if (hasVideo && hasAudio) {
    return "mixed_media";
  }

  if (hasVideo) {
    return "video_post";
  }

  if (hasAudio) {
    return "audio_post";
  }

  if (textLength > 140) {
    return "long_text";
  }

  return "short_text";
}

export const getDashboardHomeData = cache(async (userId: string | null): Promise<DashboardHomeData> => {
  if (!userId) {
    return DEFAULT_HOME_DATA;
  }

  try {
    const now = new Date();
    const todayStart = startOfDay(now);
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(todayStart.getDate() + 1);
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const monthAgo = new Date(now);
    monthAgo.setDate(monthAgo.getDate() - 30);
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(todayStart.getDate() - 1);
    const twoDaysAgoStart = new Date(todayStart);
    twoDaysAgoStart.setDate(todayStart.getDate() - 2);
    const sevenDaysAgoStart = new Date(todayStart);
    sevenDaysAgoStart.setDate(todayStart.getDate() - 7);
    const eightDaysAgoStart = new Date(todayStart);
    eightDaysAgoStart.setDate(todayStart.getDate() - 8);
    const sixDaysAgoStart = new Date(todayStart);
    sixDaysAgoStart.setDate(todayStart.getDate() - 6);
    const thirteenDaysAgo = new Date(now);
    thirteenDaysAgo.setDate(now.getDate() - 13);
    const twentyDaysAgo = new Date(todayStart);
    twentyDaysAgo.setDate(todayStart.getDate() - 20);
    const twentyOneDaysAgo = new Date(todayStart);
    twentyOneDaysAgo.setDate(todayStart.getDate() - 21);
    const nonSelfActionWhere = {
      userId: {
        not: userId,
      },
    } as const;
    const INTERACTION_ACTION_TYPES: UserActionType[] = [
      UserActionType.POST_CLICK,
      UserActionType.POST_LIKE,
      UserActionType.POST_SHARE,
      UserActionType.POST_BOOKMARK,
      UserActionType.REPLY_CREATE,
      UserActionType.FOLLOW,
      UserActionType.POST_CREATE,
    ];

    const [
      followingCount,
      followerCount,
      myPosts,
      myReplies,
      myMessages,
      weeklyReplies,
      weeklyPosts,
      interactionRows,
      recentPostRows,
      mauRows,
      interactionCountRows,
      trendActionRows,
      cohortUserRows,
    ] = await Promise.all([
      prisma.follow.count({ where: { followerId: userId, status: "FOLLOWING" } }),
      prisma.follow.count({ where: { followingId: userId, status: "FOLLOWING" } }),
      prisma.post.count({ where: { authorId: userId, parentId: null } }),
      prisma.post.count({ where: { authorId: userId, parentId: { not: null } } }),
      prisma.message.count({ where: { senderId: userId } }),
      prisma.post.count({ where: { authorId: userId, parentId: { not: null }, createdAt: { gte: weekAgo } } }),
      prisma.post.count({ where: { authorId: userId, parentId: null, createdAt: { gte: weekAgo } } }),
      prisma.userAction.findMany({
        where: {
          ...nonSelfActionWhere,
          targetAuthorId: userId,
          createdAt: { gte: weekAgo },
          actionType: {
            in: ["FEED_IMPRESSION", "POST_CLICK", "REPLY_CREATE", "FOLLOW"],
          },
        },
        select: {
          actionType: true,
          userId: true,
          targetPostId: true,
          metadata: true,
        },
      }),
      prisma.post.findMany({
        where: {
          authorId: userId,
          createdAt: { gte: thirteenDaysAgo },
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          content: true,
          createdAt: true,
          parentId: true,
          likeCount: true,
          replyCount: true,
          shareCount: true,
          videoUrl: true,
          audioUrl: true,
          author: {
            select: {
              name: true,
              userid: true,
            },
          },
        },
      }),
      prisma.userAction.groupBy({
        by: ["userId"],
        where: {
          createdAt: { gte: monthAgo },
        },
      }),
      prisma.userAction.groupBy({
        by: ["userId"],
        where: {
          createdAt: { gte: weekAgo },
          actionType: {
            in: INTERACTION_ACTION_TYPES,
          },
        },
        _count: {
          _all: true,
        },
      }),
      prisma.userAction.findMany({
        where: {
          createdAt: { gte: twentyDaysAgo },
        },
        select: {
          userId: true,
          createdAt: true,
        },
      }),
      prisma.user.findMany({
        where: {
          createdAt: {
            gte: twentyOneDaysAgo,
            lt: tomorrowStart,
          },
        },
        select: {
          id: true,
          createdAt: true,
        },
      }),
    ]);

    const keys = getRecentDayKeys(14);
    const trendMap = toTrendMap(keys);

    recentPostRows.forEach((item) => {
      const dayKey = formatDayKey(item.createdAt);
      const target = trendMap.get(dayKey);

      if (!target) {
        return;
      }

      if (item.parentId) {
        target.replies += 1;
      } else {
        target.posts += 1;
      }
    });

    const contentSegmentPosts = recentPostRows.filter(
      (item) => item.parentId === null && item.createdAt >= weekAgo
    );
    const recentPosts = recentPostRows
      .filter((item) => item.parentId === null)
      .slice(0, 8)
      .map((item) => ({
        id: item.id,
        content: item.content,
        createdAt: item.createdAt,
        likeCount: item.likeCount,
        replyCount: item.replyCount,
        shareCount: item.shareCount,
        author: item.author,
      }));

    const metricPostIds = Array.from(
      new Set([...recentPosts.map((item) => item.id), ...contentSegmentPosts.map((item) => item.id)])
    );

    const [
      impressionByPostRows,
      postClickByPostRows,
      profileEnterByPostRows,
      replyByPostRows,
      impressionPvByPostRows,
      postClickPvByPostRows,
      profileEnterPvByPostRows,
      replyPvByPostRows,
    ] = metricPostIds.length
      ? await Promise.all([
          prisma.userAction.groupBy({
            by: ["targetPostId", "userId"],
            where: {
              ...nonSelfActionWhere,
              actionType: "FEED_IMPRESSION",
              targetAuthorId: userId,
              targetPostId: { in: metricPostIds },
              createdAt: { gte: weekAgo },
            },
          }),
          prisma.userAction.groupBy({
            by: ["targetPostId", "userId"],
            where: {
              ...nonSelfActionWhere,
              actionType: "POST_CLICK",
              targetAuthorId: userId,
              targetPostId: { in: metricPostIds },
              createdAt: { gte: weekAgo },
              NOT: {
                metadata: {
                  contains: "\"kind\":\"profile_enter\"",
                },
              },
            },
          }),
          prisma.userAction.groupBy({
            by: ["targetPostId", "userId"],
            where: {
              ...nonSelfActionWhere,
              actionType: "POST_CLICK",
              targetAuthorId: userId,
              targetPostId: { in: metricPostIds },
              createdAt: { gte: weekAgo },
              metadata: {
                contains: "\"kind\":\"profile_enter\"",
              },
            },
          }),
          prisma.userAction.groupBy({
            by: ["targetPostId", "userId"],
            where: {
              ...nonSelfActionWhere,
              actionType: "REPLY_CREATE",
              targetAuthorId: userId,
              targetPostId: { in: metricPostIds },
              createdAt: { gte: weekAgo },
            },
          }),
          prisma.userAction.groupBy({
            by: ["targetPostId"],
            where: {
              ...nonSelfActionWhere,
              actionType: "FEED_IMPRESSION",
              targetAuthorId: userId,
              targetPostId: { in: metricPostIds },
              createdAt: { gte: weekAgo },
            },
            _count: {
              _all: true,
            },
          }),
          prisma.userAction.groupBy({
            by: ["targetPostId"],
            where: {
              ...nonSelfActionWhere,
              actionType: "POST_CLICK",
              targetAuthorId: userId,
              targetPostId: { in: metricPostIds },
              createdAt: { gte: weekAgo },
              NOT: {
                metadata: {
                  contains: "\"kind\":\"profile_enter\"",
                },
              },
            },
            _count: {
              _all: true,
            },
          }),
          prisma.userAction.groupBy({
            by: ["targetPostId"],
            where: {
              ...nonSelfActionWhere,
              actionType: "POST_CLICK",
              targetAuthorId: userId,
              targetPostId: { in: metricPostIds },
              createdAt: { gte: weekAgo },
              metadata: {
                contains: "\"kind\":\"profile_enter\"",
              },
            },
            _count: {
              _all: true,
            },
          }),
          prisma.userAction.groupBy({
            by: ["targetPostId"],
            where: {
              ...nonSelfActionWhere,
              actionType: "REPLY_CREATE",
              targetAuthorId: userId,
              targetPostId: { in: metricPostIds },
              createdAt: { gte: weekAgo },
            },
            _count: {
              _all: true,
            },
          }),
        ])
      : [[], [], [], [], [], [], [], []];

    const impressionsByPost = countUniqueUsersByPost(impressionByPostRows);
    const postClicksByPost = countUniqueUsersByPost(postClickByPostRows);
    const profileEntersByPost = countUniqueUsersByPost(profileEnterByPostRows);
    const repliesByPost = countUniqueUsersByPost(replyByPostRows);
    const impressionsPvByPost = countEventsByPost(impressionPvByPostRows);
    const postClicksPvByPost = countEventsByPost(postClickPvByPostRows);
    const profileEntersPvByPost = countEventsByPost(profileEnterPvByPostRows);
    const repliesPvByPost = countEventsByPost(replyPvByPostRows);

    const recentPostsWithMetrics = recentPosts.map((item) => {
      const itemImpressions = impressionsByPost.get(item.id) ?? 0;
      const itemPostClicks = postClicksByPost.get(item.id) ?? 0;
      const itemReplies = repliesByPost.get(item.id) ?? 0;
      const itemProfileEnters = profileEntersByPost.get(item.id) ?? 0;
      const itemImpressionsPv = impressionsPvByPost.get(item.id) ?? 0;
      const itemPostClicksPv = postClicksPvByPost.get(item.id) ?? 0;
      const itemRepliesPv = repliesPvByPost.get(item.id) ?? 0;
      const itemProfileEntersPv = profileEntersPvByPost.get(item.id) ?? 0;

      return {
        ...item,
        metrics: {
          impressions: itemImpressions,
          postClicks: itemPostClicks,
          repliesReceived: itemReplies,
          profileEnters: itemProfileEnters,
          impressionsPv: itemImpressionsPv,
          postClicksPv: itemPostClicksPv,
          repliesReceivedPv: itemRepliesPv,
          profileEntersPv: itemProfileEntersPv,
          postClickRate: toRate(itemPostClicks, itemImpressions),
          replyRate: toRate(itemReplies, itemImpressions),
          profileEnterRate: toRate(itemProfileEnters, itemImpressions),
        },
      };
    });

    // Engagement metrics (UV + PV) come from the same interaction rows already
    // fetched for traffic sources / funnel / audience, so no extra queries.
    const metricBucket = createActionMetricBucket();
    const trafficMap = new Map<string, ActionMetricBucket>();
    const funnelSets = {
      impressionsUsers: new Set<string>(),
      postClicksUsers: new Set<string>(),
      profileEnterUsers: new Set<string>(),
      followUsers: new Set<string>(),
      repliesUsers: new Set<string>(),
      impressionsPv: 0,
      postClicksPv: 0,
      profileEnterPv: 0,
      followPv: 0,
      repliesPv: 0,
    };

    interactionRows.forEach((action) => {
      const parsed = parseActionMetadata(action.metadata);
      if (action.actionType === "FOLLOW") {
        funnelSets.followUsers.add(action.userId);
        funnelSets.followPv += 1;
        return;
      }

      const sourceKey = normalizeSourceLabel(parsed.source);
      const existingBucket = trafficMap.get(sourceKey) ?? createActionMetricBucket();
      applyActionToBucket(existingBucket, action);
      trafficMap.set(sourceKey, existingBucket);
      applyActionToBucket(metricBucket, action);

      if (action.actionType === "FEED_IMPRESSION") {
        funnelSets.impressionsUsers.add(action.userId);
        funnelSets.impressionsPv += 1;
      } else if (action.actionType === "REPLY_CREATE") {
        funnelSets.repliesUsers.add(action.userId);
        funnelSets.repliesPv += 1;
      } else if (action.actionType === "POST_CLICK" && parsed.kind === "profile_enter") {
        funnelSets.profileEnterUsers.add(action.userId);
        funnelSets.profileEnterPv += 1;
      } else if (action.actionType === "POST_CLICK") {
        funnelSets.postClicksUsers.add(action.userId);
        funnelSets.postClicksPv += 1;
      }
    });

    const impressions = metricBucket.impressionsUsers.size;
    const postClicks = metricBucket.postClickUsers.size;
    const repliesReceived = metricBucket.repliesUsers.size;
    const profileEnters = metricBucket.profileEnterUsers.size;
    const impressionsPv = metricBucket.impressionsPv;
    const postClicksPv = metricBucket.postClicksPv;
    const repliesReceivedPv = metricBucket.repliesPv;
    const profileEntersPv = metricBucket.profileEntersPv;

    const trafficSources: DashboardTrafficSourceItem[] = Array.from(trafficMap.entries())
      .map(([source, bucket]) => bucketToTrafficItem(source, bucket))
      .sort((left, right) => right.impressionsPv - left.impressionsPv)
      .slice(0, 12);

    const funnel: DashboardFunnelItem[] = [
      {
        step: "impression",
        users: funnelSets.impressionsUsers.size,
        events: funnelSets.impressionsPv,
        conversionFromPrev: 100,
      },
      {
        step: "post_click",
        users: funnelSets.postClicksUsers.size,
        events: funnelSets.postClicksPv,
        conversionFromPrev: toRate(funnelSets.postClicksUsers.size, funnelSets.impressionsUsers.size),
      },
      {
        step: "profile_enter",
        users: funnelSets.profileEnterUsers.size,
        events: funnelSets.profileEnterPv,
        conversionFromPrev: toRate(funnelSets.profileEnterUsers.size, funnelSets.postClicksUsers.size),
      },
      {
        step: "follow",
        users: funnelSets.followUsers.size,
        events: funnelSets.followPv,
        conversionFromPrev: toRate(funnelSets.followUsers.size, funnelSets.profileEnterUsers.size),
      },
      {
        step: "reply",
        users: funnelSets.repliesUsers.size,
        events: funnelSets.repliesPv,
        conversionFromPrev: toRate(funnelSets.repliesUsers.size, funnelSets.impressionsUsers.size),
      },
    ];

    const actorIds = Array.from(new Set(interactionRows.map((item) => item.userId)));
    const [actorProfiles, followingRows] = actorIds.length
      ? await Promise.all([
          prisma.user.findMany({
            where: { id: { in: actorIds } },
            select: { id: true, createdAt: true, isPremium: true },
          }),
          prisma.follow.findMany({
            where: {
              followerId: { in: actorIds },
              followingId: userId,
              status: "FOLLOWING",
            },
            select: { followerId: true },
          }),
        ])
      : [[], []];

    const actorProfileMap = new Map(actorProfiles.map((item) => [item.id, item]));
    const followerIdSet = new Set(followingRows.map((item) => item.followerId));

    const audienceBucketMap = new Map<string, ActionMetricBucket>();
    const audienceUserSets = new Map<string, Set<string>>();
    const ensureAudienceBucket = (key: string): ActionMetricBucket => {
      const existing = audienceBucketMap.get(key);
      if (existing) {
        return existing;
      }

      const created = createActionMetricBucket();
      audienceBucketMap.set(key, created);
      audienceUserSets.set(key, new Set<string>());
      return created;
    };

    interactionRows.forEach((action) => {
      if (action.actionType !== "FEED_IMPRESSION" && action.actionType !== "POST_CLICK" && action.actionType !== "REPLY_CREATE") {
        return;
      }

      const profile = actorProfileMap.get(action.userId);
      const segmentKeys: string[] = [];

      if (profile) {
        segmentKeys.push(profile.createdAt >= weekAgo ? "new_users" : "returning_users");
        segmentKeys.push(profile.isPremium ? "premium_users" : "standard_users");
      }

      segmentKeys.push(followerIdSet.has(action.userId) ? "followers" : "non_followers");

      segmentKeys.forEach((segmentKey) => {
        const bucket = ensureAudienceBucket(segmentKey);
        applyActionToBucket(bucket, action);
        audienceUserSets.get(segmentKey)?.add(action.userId);
      });
    });

    const audienceSegmentOrder = [
      "new_users",
      "returning_users",
      "followers",
      "non_followers",
      "premium_users",
      "standard_users",
    ];

    const audienceSegments: DashboardAudienceSegmentItem[] = audienceSegmentOrder.map((segment) => {
      const bucket = audienceBucketMap.get(segment) ?? createActionMetricBucket();
      const users = audienceUserSets.get(segment)?.size ?? 0;

      return {
        segment,
        users,
        impressions: bucket.impressionsUsers.size,
        postClicks: bucket.postClickUsers.size,
        repliesReceived: bucket.repliesUsers.size,
        profileEnters: bucket.profileEnterUsers.size,
        impressionsPv: bucket.impressionsPv,
        postClicksPv: bucket.postClicksPv,
        repliesReceivedPv: bucket.repliesPv,
        profileEntersPv: bucket.profileEntersPv,
      };
    });

    const contentSegmentBucket = new Map<
      string,
      {
        posts: number;
        impressions: number;
        postClicks: number;
        replies: number;
        profileEnters: number;
        impressionsPv: number;
        postClicksPv: number;
        repliesPv: number;
        profileEntersPv: number;
      }
    >();

    contentSegmentPosts.forEach((post) => {
      const segment = getContentSegment(post);
      const current = contentSegmentBucket.get(segment) ?? {
        posts: 0,
        impressions: 0,
        postClicks: 0,
        replies: 0,
        profileEnters: 0,
        impressionsPv: 0,
        postClicksPv: 0,
        repliesPv: 0,
        profileEntersPv: 0,
      };
      current.posts += 1;
      current.impressions += impressionsByPost.get(post.id) ?? 0;
      current.postClicks += postClicksByPost.get(post.id) ?? 0;
      current.replies += repliesByPost.get(post.id) ?? 0;
      current.profileEnters += profileEntersByPost.get(post.id) ?? 0;
      current.impressionsPv += impressionsPvByPost.get(post.id) ?? 0;
      current.postClicksPv += postClicksPvByPost.get(post.id) ?? 0;
      current.repliesPv += repliesPvByPost.get(post.id) ?? 0;
      current.profileEntersPv += profileEntersPvByPost.get(post.id) ?? 0;
      contentSegmentBucket.set(segment, current);
    });

    const contentSegmentOrder = ["video_post", "audio_post", "mixed_media", "short_text", "long_text"];
    const contentSegments: DashboardContentSegmentItem[] = contentSegmentOrder
      .map((segment) => {
        const item = contentSegmentBucket.get(segment);
        if (!item) {
          return null;
        }

        return {
          segment,
          posts: item.posts,
          impressions: item.impressions,
          postClicks: item.postClicks,
          repliesReceived: item.replies,
          profileEnters: item.profileEnters,
          impressionsPv: item.impressionsPv,
          postClicksPv: item.postClicksPv,
          repliesReceivedPv: item.repliesPv,
          profileEntersPv: item.profileEntersPv,
          postClickRate: toRate(item.postClicks, item.impressions),
          replyRate: toRate(item.replies, item.impressions),
          profileEnterRate: toRate(item.profileEnters, item.impressions),
        };
      })
      .filter((item): item is DashboardContentSegmentItem => !!item);

    // Core activity metrics.
    const activeUsers7d = interactionCountRows.length;
    const interactions7d = interactionCountRows.reduce((sum, row) => sum + row._count._all, 0);
    const avgInteractionsPerActiveUser7d = activeUsers7d > 0 ? interactions7d / activeUsers7d : 0;
    const mau = mauRows.length;

    const dauDayKeys = getRecentDayKeys(14);
    const dauSetsByDay = new Map<string, Set<string>>(dauDayKeys.map((key) => [key, new Set<string>()]));
    trendActionRows.forEach((row) => {
      const key = formatLocalDayKey(row.createdAt);
      const bucket = dauSetsByDay.get(key);
      if (bucket) {
        bucket.add(row.userId);
      }
    });
    const dauTrend = dauDayKeys.map((date) => ({
      date,
      dau: dauSetsByDay.get(date)?.size ?? 0,
    }));

    const dauUsers = new Set<string>();
    const wauUsers = new Set<string>();
    trendActionRows.forEach((row) => {
      if (row.createdAt >= todayStart) {
        dauUsers.add(row.userId);
      }
      if (row.createdAt >= weekAgo) {
        wauUsers.add(row.userId);
      }
    });
    const dau = dauUsers.size;
    const wau = wauUsers.size;

    // Retention cohorts.
    const cohortUsersByDay = new Map<string, string[]>();
    cohortUserRows.forEach((user) => {
      const dayKey = formatLocalDayKey(user.createdAt);
      const current = cohortUsersByDay.get(dayKey) ?? [];
      current.push(user.id);
      cohortUsersByDay.set(dayKey, current);
    });
    const actionDaysByUser = new Map<string, Set<string>>();
    const d1RetainedSet = new Set<string>();
    const d7RetainedSet = new Set<string>();
    trendActionRows.forEach((row) => {
      if (row.createdAt >= yesterdayStart && row.createdAt < todayStart) {
        d1RetainedSet.add(row.userId);
      }
      if (row.createdAt >= sixDaysAgoStart && row.createdAt < yesterdayStart) {
        d7RetainedSet.add(row.userId);
      }
      const current = actionDaysByUser.get(row.userId) ?? new Set<string>();
      current.add(formatLocalDayKey(row.createdAt));
      actionDaysByUser.set(row.userId, current);
    });

    const d1CohortSet = new Set(
      cohortUserRows
        .filter((user) => user.createdAt >= twoDaysAgoStart && user.createdAt < yesterdayStart)
        .map((user) => user.id)
    );
    const d7CohortSet = new Set(
      cohortUserRows
        .filter((user) => user.createdAt >= eightDaysAgoStart && user.createdAt < sevenDaysAgoStart)
        .map((user) => user.id)
    );
    const d1RetainedUsers = Array.from(d1CohortSet).filter((id) => d1RetainedSet.has(id)).length;
    const d7RetainedUsers = Array.from(d7CohortSet).filter((id) => d7RetainedSet.has(id)).length;
    const newUsersToday = cohortUserRows.filter(
      (user) => user.createdAt >= todayStart && user.createdAt < tomorrowStart
    ).length;

    const retentionCohortKeys: string[] = [];
    for (let offset = 21; offset >= 8; offset -= 1) {
      const date = new Date(todayStart);
      date.setDate(todayStart.getDate() - offset);
      retentionCohortKeys.push(formatLocalDayKey(date));
    }
    const retentionCohorts = retentionCohortKeys.map((cohortDate) => {
      const cohortUsers = cohortUsersByDay.get(cohortDate) ?? [];
      const cohortStart = new Date(`${cohortDate}T00:00:00`);
      const d1Date = new Date(cohortStart);
      d1Date.setDate(cohortStart.getDate() + 1);
      const d7Date = new Date(cohortStart);
      d7Date.setDate(cohortStart.getDate() + 7);
      const d1Key = formatLocalDayKey(d1Date);
      const d7Key = formatLocalDayKey(d7Date);
      const d1Retained = cohortUsers.filter((id) => actionDaysByUser.get(id)?.has(d1Key)).length;
      const d7Retained = cohortUsers.filter((id) => actionDaysByUser.get(id)?.has(d7Key)).length;

      return {
        cohortDate,
        users: cohortUsers.length,
        d1Retention: toRate(d1Retained, cohortUsers.length),
        d7Retention: toRate(d7Retained, cohortUsers.length),
      };
    });
    const weeklyRetentionMap = new Map<
      string,
      { users: number; d1Weighted: number; d7Weighted: number }
    >();
    retentionCohorts.forEach((item) => {
      const weekKey = getWeekStartKey(item.cohortDate);
      const current = weeklyRetentionMap.get(weekKey) ?? {
        users: 0,
        d1Weighted: 0,
        d7Weighted: 0,
      };
      current.users += item.users;
      current.d1Weighted += item.d1Retention * item.users;
      current.d7Weighted += item.d7Retention * item.users;
      weeklyRetentionMap.set(weekKey, current);
    });
    const retentionWeeklyCohorts = Array.from(weeklyRetentionMap.entries())
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([cohortDate, value]) => ({
        cohortDate,
        users: value.users,
        d1Retention: value.users > 0 ? value.d1Weighted / value.users : 0,
        d7Retention: value.users > 0 ? value.d7Weighted / value.users : 0,
      }));

    return {
      summary: {
        totalUsers: followingCount,
        totalPremiumUsers: followerCount,
        totalPosts: myPosts,
        totalReplies: myReplies,
        totalMessages: myMessages,
        weeklyNewUsers: weeklyReplies,
        weeklyNewPosts: weeklyPosts,
      },
      coreMetrics: {
        dau,
        wau,
        mau,
        newUsersToday,
        d1Retention: toRate(d1RetainedUsers, d1CohortSet.size),
        d7Retention: toRate(d7RetainedUsers, d7CohortSet.size),
        avgInteractionsPerActiveUser7d,
        interactions7d,
        activeUsers7d,
      },
      dauTrend,
      retentionCohorts,
      retentionWeeklyCohorts,
      rates: {
        impressions,
        postClicks,
        repliesReceived,
        profileEnters,
        impressionsPv,
        postClicksPv,
        repliesReceivedPv,
        profileEntersPv,
        postClickRate: toRate(postClicks, impressions),
        replyRate: toRate(repliesReceived, impressions),
        profileEnterRate: toRate(profileEnters, impressions),
      },
      trend: keys.map((key) => trendMap.get(key) as DashboardTrendPoint),
      recentPosts: recentPostsWithMetrics,
      trafficSources,
      funnel,
      audienceSegments,
      contentSegments,
    };
  } catch (error) {
    console.error("Failed to get dashboard home data:", error);
    return DEFAULT_HOME_DATA;
  }
});

export const getDashboardAffiliationsData = cache(async (userId: string | null): Promise<DashboardAffiliationsData> => {
  if (!userId) {
    return {
      summary: {
        totalLinks: 0,
        followingLinks: 0,
        blockedLinks: 0,
        requestedLinks: 0,
      },
      links: [],
    };
  }

  try {
    const baseWhere = {
      OR: [{ followerId: userId }, { followingId: userId }],
    };

    const [totalLinks, followingLinks, blockedLinks, requestedLinks, links] = await Promise.all([
      prisma.follow.count({ where: baseWhere }),
      prisma.follow.count({ where: { ...baseWhere, status: "FOLLOWING" } }),
      prisma.follow.count({ where: { ...baseWhere, status: "BLOCKED" } }),
      prisma.follow.count({ where: { ...baseWhere, status: "REQUESTED" } }),
      prisma.follow.findMany({
        where: baseWhere,
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          status: true,
          createdAt: true,
          follower: {
            select: {
              userid: true,
              name: true,
            },
          },
          following: {
            select: {
              userid: true,
              name: true,
            },
          },
        },
      }),
    ]);

    return {
      summary: {
        totalLinks,
        followingLinks,
        blockedLinks,
        requestedLinks,
      },
      links: links as DashboardAffiliationItem[],
    };
  } catch (error) {
    console.error("Failed to get dashboard affiliations data:", error);
    return {
      summary: {
        totalLinks: 0,
        followingLinks: 0,
        blockedLinks: 0,
        requestedLinks: 0,
      },
      links: [],
    };
  }
});

export const getDashboardRadarData = cache(async (userId: string | null): Promise<DashboardRadarData> => {
  if (!userId) {
    return {
      actionSummary: [],
      trend: [],
      hotPosts: [],
    };
  }

  try {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const [actionCountRows, recentActions, recentPosts] = await Promise.all([
      prisma.userAction.groupBy({
        by: ["actionType"],
        where: { userId },
        _count: {
          _all: true,
        },
      }),
      prisma.userAction.findMany({
        where: {
          userId,
          createdAt: { gte: new Date(new Date().setDate(new Date().getDate() - 13)) },
        },
        select: {
          actionType: true,
          createdAt: true,
        },
      }),
      prisma.post.findMany({
        where: {
          authorId: userId,
          parentId: null,
          createdAt: { gte: weekAgo },
        },
        select: {
          id: true,
          content: true,
          createdAt: true,
          likeCount: true,
          replyCount: true,
          shareCount: true,
        },
        take: 50,
      }),
    ]);

    const keys = getRecentDayKeys(14);
    const trendMap = new Map<string, { postCreate: number; replyCreate: number }>(
      keys.map((key) => [key, { postCreate: 0, replyCreate: 0 }])
    );

    recentActions.forEach((item) => {
      const dayKey = formatDayKey(item.createdAt);
      const target = trendMap.get(dayKey);

      if (!target) {
        return;
      }

      if (item.actionType === "POST_CREATE") {
        target.postCreate += 1;
      }

      if (item.actionType === "REPLY_CREATE") {
        target.replyCreate += 1;
      }
    });

    const actionSummary: DashboardUserActionItem[] = actionCountRows
      .map((item) => ({ actionType: item.actionType, count: item._count._all }))
      .sort((left, right) => right.count - left.count)
      .filter((item) => item.count > 0);

    const hotPosts = recentPosts
      .map((post) => ({
        ...post,
        hotScore: post.likeCount * 3 + post.replyCount * 4 + post.shareCount * 5,
      }))
      .sort((left, right) => right.hotScore - left.hotScore || right.createdAt.getTime() - left.createdAt.getTime())
      .slice(0, 5);

    return {
      actionSummary,
      trend: keys.map((key) => {
        const value = trendMap.get(key);

        return {
          date: key,
          posts: value?.postCreate ?? 0,
          replies: value?.replyCreate ?? 0,
        };
      }),
      hotPosts,
    };
  } catch (error) {
    console.error("Failed to get dashboard radar data:", error);
    return {
      actionSummary: [],
      trend: [],
      hotPosts: [],
    };
  }
});

export const getDashboardAcquireHandlesData = cache(async (userId: string | null): Promise<DashboardAcquireHandlesData> => {
  if (!userId) {
    return {
      summary: {
        totalUsers: 0,
        premiumUsers: 0,
        activeCreators: 0,
      },
      handles: [],
    };
  }

  try {
    const followings = await prisma.follow.findMany({
      where: {
        followerId: userId,
        status: "FOLLOWING",
      },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        following: {
          select: {
            id: true,
            userid: true,
            name: true,
            isPremium: true,
            createdAt: true,
            _count: {
              select: {
                posts: true,
                followers: true,
              },
            },
          },
        },
      },
    });

    const handles: DashboardHandleItem[] = followings.map((item) => ({
      id: item.following.id,
      userid: item.following.userid,
      name: item.following.name,
      isPremium: item.following.isPremium,
      createdAt: item.following.createdAt,
      postCount: item.following._count.posts,
      followerCount: item.following._count.followers,
    }));

    const activeCreators = handles.filter((item) => item.postCount >= 5).length;

    return {
      summary: {
        totalUsers: handles.length,
        premiumUsers: handles.filter((item) => item.isPremium).length,
        activeCreators,
      },
      handles,
    };
  } catch (error) {
    console.error("Failed to get dashboard acquire handles data:", error);
    return {
      summary: {
        totalUsers: 0,
        premiumUsers: 0,
        activeCreators: 0,
      },
      handles: [],
    };
  }
});

function cleanDashboardKeyword(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 100);
}

export const getDashboardHireTalentData = cache(async (
  userId: string | null,
  options?: { keyword?: string }
): Promise<DashboardHireTalentData> => {
  if (!userId) {
    return {
      summary: {
        totalJobPosts: 0,
        remoteJobPosts: 0,
        hybridJobPosts: 0,
      },
      jobPosts: [],
    };
  }

  try {
    const keyword = cleanDashboardKeyword(options?.keyword ?? "");
    const rows = await prisma.jobPosting.findMany({
      where: {
        authorId: userId,
        ...(keyword
          ? {
              OR: [
                { title: { contains: keyword, mode: "insensitive" } },
                { company: { contains: keyword, mode: "insensitive" } },
                { description: { contains: keyword, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    const jobPosts: DashboardJobPostItem[] = rows.map((item) => ({
      id: item.id,
      title: item.title,
      company: item.company,
      description: item.description,
      locationType: item.locationType,
      seniority: item.seniority,
      employmentType: item.employmentType,
      createdAt: item.createdAt,
    }));

    return {
      summary: {
        totalJobPosts: jobPosts.length,
        remoteJobPosts: jobPosts.filter((item) => item.locationType === "REMOTE").length,
        hybridJobPosts: jobPosts.filter((item) => item.locationType === "HYBRID").length,
      },
      jobPosts,
    };
  } catch (error) {
    console.error("Failed to get dashboard hire talent data:", error);
    return {
      summary: {
        totalJobPosts: 0,
        remoteJobPosts: 0,
        hybridJobPosts: 0,
      },
      jobPosts: [],
    };
  }
});

export const getDashboardSupportData = cache(async (userId: string | null): Promise<DashboardSupportData> => {
  if (!userId) {
    return {
      summary: {
        totalConversations: 0,
        conversationsWithRecentActivity: 0,
        stalledConversations: 0,
      },
      conversations: [],
    };
  }

  try {
    const baseWhere = {
      participants: {
        some: { userId },
      },
    };

    const [totalConversations, conversations] = await Promise.all([
      prisma.conversation.count({ where: baseWhere }),
      prisma.conversation.findMany({
        where: baseWhere,
        orderBy: { updatedAt: "desc" },
        take: 20,
        select: {
          id: true,
          isGroup: true,
          name: true,
          updatedAt: true,
          messageCount: true,
          participants: {
            take: 3,
            select: {
              user: {
                select: {
                  id: true,
                  userid: true,
                  name: true,
                },
              },
            },
          },
        },
      }),
    ]);

    const recentBoundary = new Date();
    recentBoundary.setDate(recentBoundary.getDate() - 2);

    const supportConversations: DashboardConversationItem[] = conversations.map((item) => ({
      id: item.id,
      isGroup: item.isGroup,
      name: item.name,
      messageCount: item.messageCount,
      updatedAt: item.updatedAt,
      participants: item.participants.map((participant) => ({
        id: participant.user.id,
        userid: participant.user.userid,
        name: participant.user.name,
      })),
    }));

    const conversationsWithRecentActivity = supportConversations.filter(
      (item) => item.updatedAt >= recentBoundary
    ).length;

    return {
      summary: {
        totalConversations,
        conversationsWithRecentActivity,
        stalledConversations: Math.max(totalConversations - conversationsWithRecentActivity, 0),
      },
      conversations: supportConversations,
    };
  } catch (error) {
    console.error("Failed to get dashboard support data:", error);
    return {
      summary: {
        totalConversations: 0,
        conversationsWithRecentActivity: 0,
        stalledConversations: 0,
      },
      conversations: [],
    };
  }
});

export const getDashboardBillingData = cache(async (userId: string | null): Promise<DashboardBillingData> => {
  if (!userId) {
    return {
      summary: {
        totalUsers: 0,
        premiumUsers: 0,
        premiumRate: 0,
        newPremiumUsers7d: 0,
      },
      premiumUsers: [],
    };
  }

  try {
    const boundary = new Date();
    boundary.setDate(boundary.getDate() - 7);

    const me = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        userid: true,
        name: true,
        createdAt: true,
        isPremium: true,
        _count: {
          select: {
            posts: true,
          },
        },
      },
    });

    if (!me) {
      return {
        summary: {
          totalUsers: 0,
          premiumUsers: 0,
          premiumRate: 0,
          newPremiumUsers7d: 0,
        },
        premiumUsers: [],
      };
    }

    const isNewPremium = me.isPremium && me.createdAt >= boundary;

    const premiumUsersRows: DashboardPremiumUserItem[] = me.isPremium
      ? [
          {
            id: me.id,
            userid: me.userid,
            name: me.name,
            createdAt: me.createdAt,
            postCount: me._count.posts,
          },
        ]
      : [];

    return {
      summary: {
        totalUsers: 1,
        premiumUsers: me.isPremium ? 1 : 0,
        premiumRate: me.isPremium ? 100 : 0,
        newPremiumUsers7d: isNewPremium ? 1 : 0,
      },
      premiumUsers: premiumUsersRows,
    };
  } catch (error) {
    console.error("Failed to get dashboard billing data:", error);
    return {
      summary: {
        totalUsers: 0,
        premiumUsers: 0,
        premiumRate: 0,
        newPremiumUsers7d: 0,
      },
      premiumUsers: [],
    };
  }
});

export const getDashboardSettingsData = cache(async (userId: string | null): Promise<DashboardSettingsData> => {
  if (!userId) {
    return {
      summary: {
        totalActions: 0,
        actionsToday: 0,
        environmentReady: false,
      },
      recentActions: [],
    };
  }

  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    async function runWithRetry<T>(task: () => Promise<T>, label: string): Promise<T> {
      try {
        return await task();
      } catch (firstError) {
        console.warn(`Retrying dashboard settings query (${label}) after transient failure.`, firstError);
        await new Promise<void>((resolve) => setTimeout(resolve, 150));
        return task();
      }
    }

    const totalActions = await runWithRetry(
      () => prisma.userAction.count({ where: { userId } }),
      "totalActions"
    );

    const actionsToday = await runWithRetry(
      () => prisma.userAction.count({ where: { userId, createdAt: { gte: todayStart } } }),
      "actionsToday"
    );

    const recentActions = await runWithRetry(
      () =>
        prisma.userAction.findMany({
          where: { userId },
          orderBy: { createdAt: "desc" },
          take: 30,
          select: {
            id: true,
            actionType: true,
            createdAt: true,
            targetPostId: true,
            user: {
              select: {
                userid: true,
                name: true,
              },
            },
          },
        }),
      "recentActions"
    );

    const recentActionRows: DashboardActionLogItem[] = recentActions.map((item) => ({
      id: item.id,
      actionType: item.actionType,
      createdAt: item.createdAt,
      targetPostId: item.targetPostId,
      user: {
        userid: item.user.userid,
        name: item.user.name,
      },
    }));

    return {
      summary: {
        totalActions,
        actionsToday,
        environmentReady: true,
      },
      recentActions: recentActionRows,
    };
  } catch (error) {
    console.error("Failed to get dashboard settings data:", error);
    return {
      summary: {
        totalActions: 0,
        actionsToday: 0,
        environmentReady: false,
      },
      recentActions: [],
    };
  }
});
