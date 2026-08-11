import PostStore from "@/components/gekaixing/PostStore";
import HomeFeedSeenTracker from "@/components/gekaixing/HomeFeedSeenTracker";
import { getHomeFeed } from "@/lib/feed/service";
import type { FeedPage, FeedPostItem as Post, FeedTab } from "@/lib/feed/types";
import { prisma } from "@/lib/prisma";
import { withTimeoutOrNull } from "@/lib/with-timeout";
import { createClient } from "@/utils/supabase/server";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Prisma } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";

export type { Post };
export type { FeedPage };

const EMPTY_FEED: FeedPage = {
  data: [],
  page: {
    nextCursor: null,
    hasMore: false,
  },
};

async function getFeed(limit: number = 20, tab: FeedTab = "foryou"): Promise<FeedPage> {
  let userId: string | null = null;

  try {
    const supabase = await createClient();
    const authResult = await withTimeoutOrNull(supabase.auth.getUser(), 8000);
    const user = authResult?.data.user ?? null;
    userId = user?.id ?? null;

    const feed = await withTimeoutOrNull(
      getHomeFeed({
        userId,
        cursor: null,
        limit,
        tab,
      }),
      8000
    );

    if (feed) {
      return feed;
    }

    return getFallbackFeed(userId, limit, tab);
  } catch (error) {
    console.error("Failed to load gekaixing feed:", error);
    return getFallbackFeed(userId, limit, tab);
  }
}

async function getFallbackFeed(userId: string | null, limit: number, tab: FeedTab): Promise<FeedPage> {
  try {
    let where: Prisma.PostWhereInput = { parentId: null };

    if (tab === "following" && userId) {
      const follows = await prisma.follow.findMany({
        where: {
          followerId: userId,
          status: "FOLLOWING",
        },
        select: {
          followingId: true,
        },
      });
      const followingIds = follows.map((item) => item.followingId);
      if (followingIds.length === 0) {
        return EMPTY_FEED;
      }
      where = {
        parentId: null,
        authorId: { in: followingIds },
      };
    }

    const rows = await withTimeoutOrNull(
      prisma.post.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
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
      }),
      8000
    );

    if (!rows) {
      return EMPTY_FEED;
    }

    return {
      data: rows.map((post) => ({
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
      })),
      page: {
        nextCursor: null,
        hasMore: false,
      },
    };
  } catch (fallbackError) {
    console.error("Failed to load fallback feed:", fallbackError);
    return EMPTY_FEED;
  }
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const params = await searchParams;
  const tab: FeedTab = params.tab === "following" ? "following" : "foryou";
  const feed = await getFeed(20, tab);
  const tf = await getTranslations("ImitationX.Feed");

  return (
    <div>
      <HomeFeedSeenTracker />
      <div className="sticky top-14 z-10 border-b border-border bg-background/95 backdrop-blur sm:top-0">
        <nav className="grid grid-cols-2" aria-label={tf("following")}>
          <Link
            href="/gekaixing"
            aria-current={tab === "foryou" ? "page" : undefined}
            className={cn(
              "relative py-3 text-center text-sm font-medium transition-colors",
              tab !== "following"
                ? "text-foreground"
                : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
            )}
          >
            {tf("forYou")}
            {tab !== "following" ? (
              <div className="absolute bottom-0 left-1/2 h-1 w-12 -translate-x-1/2 rounded-full bg-blue-500" />
            ) : null}
          </Link>
          <Link
            href="/gekaixing?tab=following"
            aria-current={tab === "following" ? "page" : undefined}
            className={cn(
              "relative py-3 text-center text-sm font-medium transition-colors",
              tab === "following"
                ? "text-foreground"
                : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
            )}
          >
            {tf("following")}
            {tab === "following" ? (
              <div className="absolute bottom-0 left-1/2 h-1 w-12 -translate-x-1/2 rounded-full bg-blue-500" />
            ) : null}
          </Link>
        </nav>
      </div>
      <div className="px-4 pt-4">
        <PostStore data={feed.data} nextCursor={feed.page.nextCursor} hasMore={feed.page.hasMore} feedQuery={{ tab }} />
      </div>
    </div>
  );
}
