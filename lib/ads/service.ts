import type { FeedPostItem } from "@/lib/feed/types";
import { prisma } from "@/lib/prisma";
import { AD_STRIDE } from "@/lib/ads/config";

/** 规范化 CTA 落地页 URL：仅接受 http/https，返回 null 表示缺失或非法。 */
export function normalizeCtaUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * 拉取当前可投放的广告（status=ACTIVE 且未到期），映射为信息流条目。
 * 广告渲染时实时查询，因此广告启停无需失效任何用户信息流缓存。
 */
export async function getActiveSponsoredAds(): Promise<FeedPostItem[]> {
  const rows = await prisma.sponsoredAd.findMany({
    where: {
      status: "ACTIVE",
      endsAt: { gt: new Date() },
    },
    orderBy: { createdAt: "asc" },
    include: {
      post: {
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
        },
      },
    },
  });

  return rows.map((ad) => ({
    id: ad.post.id,
    content: ad.post.content,
    videoUrl: ad.post.videoUrl ?? null,
    audioUrl: null,
    createdAt: ad.post.createdAt,
    user_id: ad.post.author.id,
    user_name: ad.post.author.name,
    user_email: null,
    user_avatar: ad.post.author.avatar,
    user_userid: ad.post.author.userid,
    isPremium: ad.post.author.isPremium,
    like: ad.post._count.likes,
    star: ad.post._count.bookmarks,
    share: ad.post._count.shares,
    reply: ad.post._count.replies,
    likedByMe: false,
    bookmarkedByMe: false,
    sharedByMe: false,
    isSponsored: true,
    sponsoredBy: ad.post.author.name ?? ad.post.author.userid,
    ctaUrl: ad.ctaUrl,
    ctaLabel: ad.ctaLabel,
  }));
}

/**
 * 把广告按固定间隔插入到一页有机帖中（第 stride、2*stride、3*stride… 位）。
 * 广告按顺序循环取，避免同一页重复同一条。不改变有机帖顺序与分页游标。
 */
export function interleaveSponsoredPosts(
  posts: FeedPostItem[],
  ads: FeedPostItem[],
  stride: number = AD_STRIDE
): FeedPostItem[] {
  if (posts.length === 0 || ads.length === 0) {
    return posts;
  }

  const result: FeedPostItem[] = [];
  let adIndex = 0;
  posts.forEach((post, i) => {
    result.push(post);
    if ((i + 1) % stride === 0) {
      result.push(ads[adIndex % ads.length]);
      adIndex += 1;
    }
  });

  return result;
}
