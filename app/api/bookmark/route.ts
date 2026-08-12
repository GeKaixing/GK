import { prisma } from "@/lib/prisma";
import { UserActionType, OspEventType } from "@/generated/prisma/enums";
import { logUserAction } from "@/lib/feed/actions";
import { invalidateUserHomeFeed } from "@/lib/feed/service";
import { OBJECT_TYPES, recordUserOspEvent } from "@/lib/osp";
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { postId } = await request.json();

    if (!postId) {
      return NextResponse.json({ error: "Post ID required" }, { status: 400 });
    }

    const existingBookmark = await prisma.bookmark.findUnique({
      where: {
        userId_postId: {
          userId: user.id,
          postId: postId,
        },
      },
    });

    if (existingBookmark) {
      return NextResponse.json({ error: "Already bookmarked" }, { status: 409 });
    }

    const targetPost = await prisma.post.findUnique({
      where: { id: postId },
      select: { authorId: true },
    });

    if (!targetPost) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const bookmark = await prisma.bookmark.create({
      data: {
        userId: user.id,
        postId: postId,
      },
    });
    await invalidateUserHomeFeed(user.id);
    await logUserAction({
      userId: user.id,
      actionType: UserActionType.POST_BOOKMARK,
      targetPostId: postId,
      targetAuthorId: targetPost.authorId,
    });
    await recordUserOspEvent(user.id, {
      eventType: OspEventType.POST_BOOKMARKED,
      objectType: OBJECT_TYPES.POST,
      objectId: postId,
    });

    return NextResponse.json({
      data: { bookmark },
      success: true,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const postId = searchParams.get("postId");

    if (!postId) {
      return NextResponse.json({ error: "Post ID required" }, { status: 400 });
    }

    const existingBookmark = await prisma.bookmark.findUnique({
      where: {
        userId_postId: {
          userId: user.id,
          postId: postId,
        },
      },
    });

    if (!existingBookmark) {
      return NextResponse.json({ error: "Not bookmarked yet" }, { status: 404 });
    }

    const targetPost = await prisma.post.findUnique({
      where: { id: postId },
      select: { authorId: true },
    });

    await prisma.bookmark.delete({
      where: {
        userId_postId: {
          userId: user.id,
          postId: postId,
        },
      },
    });
    await invalidateUserHomeFeed(user.id);
    await logUserAction({
      userId: user.id,
      actionType: UserActionType.POST_UNBOOKMARK,
      targetPostId: postId,
      targetAuthorId: targetPost?.authorId ?? null,
    });
    await recordUserOspEvent(user.id, {
      eventType: OspEventType.POST_UNBOOKMARKED,
      objectType: OBJECT_TYPES.POST,
      objectId: postId,
    });

    return NextResponse.json({
      success: true,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { searchParams } = new URL(request.url);
    const postId = searchParams.get("postId");
    const type = searchParams.get("type");

    if (postId) {
      if (!user) {
        return NextResponse.json({
          data: { isBookmarked: false },
          success: true,
        });
      }

      const bookmark = await prisma.bookmark.findUnique({
        where: {
          userId_postId: {
            userId: user.id,
            postId: postId,
          },
        },
      });

      return NextResponse.json({
        data: { isBookmarked: !!bookmark },
        success: true,
      });
    }

    if (type === "user" && user) {
      const bookmarks = await prisma.bookmark.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        include: {
          post: {
            include: {
              author: true,
              _count: {
                select: { replies: true },
              },
            },
          },
        },
      });

      return NextResponse.json({
        data: bookmarks,
        success: true,
      });
    }

    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
