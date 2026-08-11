import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("query") || "";
    if (!query.trim()) {
      return NextResponse.json({ data: [], success: true, message: "Empty query" });
    }

    // 可选登录态：用于计算点赞/收藏/分享的「我是否已操作」。
    let viewerId: string | null = null;
    try {
      const { data } = await supabase.auth.getUser();
      viewerId = data.user?.id ?? null;
    } catch {
      viewerId = null;
    }

    const posts = await prisma.post.findMany({
      where: {
        parentId: null,
        OR: [
          { content: { contains: query, mode: "insensitive" } },
          { author: { name: { contains: query, mode: "insensitive" } } },
        ],
      },
      include: {
        author: {
          select: {
            id: true,
            userid: true,
            name: true,
            email: true,
            avatar: true,
            isPremium: true,
          },
        },
        _count: {
          select: { likes: true, bookmarks: true, shares: true, replies: true },
        },
        likes: viewerId
          ? { where: { userId: viewerId }, select: { id: true } }
          : false,
        bookmarks: viewerId
          ? { where: { userId: viewerId }, select: { id: true } }
          : false,
        shares: viewerId
          ? { where: { userId: viewerId }, select: { id: true } }
          : false,
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    const transformedPosts = posts.map((post) => ({
      id: post.id,
      user_id: post.authorId,
      user_name: post.author?.name || "",
      user_email: post.author?.email || "",
      user_avatar: post.author?.avatar || "",
      user_userid: post.author?.userid || "",
      content: post.content,
      videoUrl: post.videoUrl ?? null,
      audioUrl: post.audioUrl ?? null,
      createdAt: post.createdAt.toISOString(),
      like: post._count?.likes || 0,
      star: post._count?.bookmarks || 0,
      reply_count: post._count?.replies || 0,
      share: post._count?.shares || 0,
      isPremium: post.author?.isPremium ?? false,
      likedByMe: (post.likes?.length ?? 0) > 0,
      bookmarkedByMe: (post.bookmarks?.length ?? 0) > 0,
      sharedByMe: (post.shares?.length ?? 0) > 0,
    }));

    return NextResponse.json({ data: transformedPosts, success: true });
  } catch (error) {
    console.error("Search posts failed:", error);
    return NextResponse.json({ error: "Search posts failed" }, { status: 500 });
  }
}
