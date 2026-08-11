export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { UserActionType } from "@/generated/prisma/enums";
import { logUserAction } from "@/lib/feed/actions";
import { createClient } from "@/utils/supabase/server";
import { Prisma } from "@/generated/prisma/client";
import { getHomeFeed } from "@/lib/feed/service";
import { getHistoryFeed } from "@/lib/feed/history";

type FeedScope =
  | "home"
  | "user-posts"
  | "user-replies"
  | "user-liked"
  | "user-bookmarks"
  | "user-history"
  | "status-replies";

function buildWhere(scope: FeedScope, targetId: string | null): Prisma.PostWhereInput {
  switch (scope) {
    case "user-posts":
      return {
        parentId: null,
        authorId: targetId || "",
      };
    case "user-replies":
      return {
        parentId: { not: null },
        authorId: targetId || "",
      };
    case "user-liked":
      return {
        parentId: null,
        likes: {
          some: {
            userId: targetId || "",
          },
        },
      };
    case "user-bookmarks":
      return {
        parentId: null,
        bookmarks: {
          some: {
            userId: targetId || "",
          },
        },
      };
    case "user-history":
      // Handled in its own branch in GET (grouped by click, not post query).
      return { id: "" };
    case "status-replies":
      return {
        parentId: targetId || "",
      };
    case "home":
    default:
      return {
        parentId: null,
      };
  }
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    let userId: string | undefined;

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      userId = user?.id;
    } catch {
      userId = undefined;
    }

    const searchParams = req.nextUrl.searchParams;
    const scope = (searchParams.get("scope") || "home") as FeedScope;
    const targetId = searchParams.get("targetId");
    const cursor = searchParams.get("cursor");
    const tab = searchParams.get("tab") === "following" ? "following" : "foryou";
    const requestedLimit = Number(searchParams.get("limit") || "20");
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), 40)
      : 20;

    if (scope === "home") {
      const feed = await getHomeFeed({
        userId: userId ?? null,
        cursor,
        limit,
        tab,
      });
      if (userId) {
        await Promise.allSettled(
          feed.data.slice(0, 20).map((post) =>
            logUserAction({
              userId,
              actionType: UserActionType.FEED_IMPRESSION,
              targetPostId: post.id,
              targetAuthorId: post.user_id,
              metadata: JSON.stringify({
                kind: "feed_impression",
                source: scope,
                ad: post.isSponsored ? true : undefined,
                advertiserId: post.isSponsored ? post.user_id : undefined,
              }),
            })
          )
        );
      }

      return NextResponse.json(feed);
    }

    if (scope === "user-history") {
      // Browsing history is strictly personal — ignore any client-supplied targetId.
      const historyUserId = userId ?? "";
      const offset = Number(cursor) || 0;
      const feed = await getHistoryFeed(historyUserId, offset, limit);
      if (historyUserId) {
        await Promise.allSettled(
          feed.data.slice(0, 20).map((post) =>
            logUserAction({
              userId: historyUserId,
              actionType: UserActionType.FEED_IMPRESSION,
              targetPostId: post.id,
              targetAuthorId: post.user_id,
              metadata: JSON.stringify({ kind: "feed_impression", source: scope }),
            })
          )
        );
      }
      return NextResponse.json(feed);
    }

    const rows = await prisma.post.findMany({
      where: buildWhere(scope, targetId),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(cursor
        ? {
            cursor: { id: cursor },
            skip: 1,
          }
        : {}),
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

        // ✅ 只查当前用户是否点赞
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

    const hasMore = rows.length > limit;
    const posts = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? posts[posts.length - 1]?.id ?? null : null;

    const result = posts.map((post) => ({
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

    if (userId) {
      await Promise.allSettled(
        result.slice(0, 20).map((post) =>
          logUserAction({
            userId,
            actionType: UserActionType.FEED_IMPRESSION,
            targetPostId: post.id,
            targetAuthorId: post.user_id,
            metadata: JSON.stringify({ kind: "feed_impression", source: scope }),
          })
        )
      );
    }

    return NextResponse.json({
      data: result,
      page: {
        nextCursor,
        hasMore,
      },
    });
  } catch (error) {
    console.error("Feed load failed:", error);
    return NextResponse.json({ error: "Feed load failed" }, { status: 500 });
  }
}
