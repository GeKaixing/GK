import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { withTimeoutOrNull } from "@/lib/with-timeout";
import type { FeedPage, FeedPostItem } from "./types";

const DB_TIMEOUT_MS = 8000;

/**
 * 获取某条帖子的顶层回复（parentId = postId），映射为 FeedPage。
 * 带超时保护：数据库挂起/超时时返回空页，避免整个页面 500。
 */
export async function getPostReplies(
  postId: string,
  viewerId: string | undefined,
  limit = 20,
): Promise<FeedPage> {
  try {
    const rows = await withTimeoutOrNull(
      prisma.post.findMany({
        where: {
          parentId: postId,
        } satisfies Prisma.PostWhereInput,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit + 1,
        include: {
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
          likes: viewerId ? { where: { userId: viewerId }, select: { id: true } } : false,
          bookmarks: viewerId ? { where: { userId: viewerId }, select: { id: true } } : false,
          shares: viewerId ? { where: { userId: viewerId }, select: { id: true } } : false,
        },
      }),
      DB_TIMEOUT_MS,
    );

    if (!rows) {
      return { data: [], page: { nextCursor: null, hasMore: false } };
    }

    const hasMore = rows.length > limit;
    const replies = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? replies[replies.length - 1]?.id ?? null : null;

    return {
      data: replies.map((reply) => ({
        id: reply.id,
        content: reply.content,
        videoUrl: reply.videoUrl ?? null,
        audioUrl: reply.audioUrl ?? null,
        createdAt: reply.createdAt,
        user_id: reply.author.id,
        user_name: reply.author.name,
        user_avatar: reply.author.avatar,
        user_userid: reply.author.userid,
        isPremium: reply.author.isPremium,
        like: reply._count.likes,
        star: reply._count.bookmarks,
        share: reply._count.shares,
        reply: reply._count.replies,
        likedByMe: reply.likes?.length > 0,
        bookmarkedByMe: reply.bookmarks?.length > 0,
        sharedByMe: reply.shares?.length > 0,
      })),
      page: {
        nextCursor,
        hasMore,
      },
    };
  } catch (error) {
    console.error("getPostReplies failed:", error);
    return { data: [], page: { nextCursor: null, hasMore: false } };
  }
}

/**
 * 获取单条帖子并映射为 FeedPostItem（不含指标统计）。
 * 带超时保护，找不到或出错时返回 null。
 */
export async function getPostById(
  postId: string,
  viewerId: string | undefined,
): Promise<FeedPostItem | null> {
  try {
    const post = await withTimeoutOrNull(
      prisma.post.findUnique({
        where: { id: postId },
        include: {
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
          likes: viewerId ? { where: { userId: viewerId }, select: { id: true } } : false,
          bookmarks: viewerId ? { where: { userId: viewerId }, select: { id: true } } : false,
          shares: viewerId ? { where: { userId: viewerId }, select: { id: true } } : false,
        },
      }),
      DB_TIMEOUT_MS,
    );

    if (!post) {
      return null;
    }

    return {
      id: post.id,
      content: post.content,
      videoUrl: post.videoUrl ?? null,
      audioUrl: post.audioUrl ?? null,
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
    };
  } catch (error) {
    console.error("getPostById failed:", error);
    return null;
  }
}
