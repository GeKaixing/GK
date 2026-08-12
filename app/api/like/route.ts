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

    const existingLike = await prisma.like.findUnique({
      where: {
        userId_postId: {
          userId: user.id,
          postId: postId,
        },
      },
    });

    if (existingLike) {
      return NextResponse.json({ error: "Already liked" }, { status: 409 });
    }

    const targetPost = await prisma.post.findUnique({
      where: { id: postId },
      select: { authorId: true },
    });

    if (!targetPost) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const [like] = await prisma.$transaction([
      prisma.like.create({
        data: {
          userId: user.id,
          postId: postId,
        },
      }),
      prisma.post.update({
        where: { id: postId },
        data: { likeCount: { increment: 1 } },
      }),
    ]);
    await Promise.all([invalidateUserHomeFeed(user.id), invalidateUserHomeFeed(targetPost.authorId)]);
    await logUserAction({
      userId: user.id,
      actionType: UserActionType.POST_LIKE,
      targetPostId: postId,
      targetAuthorId: targetPost.authorId,
    });
    await recordUserOspEvent(user.id, {
      eventType: OspEventType.POST_LIKED,
      objectType: OBJECT_TYPES.POST,
      objectId: postId,
    });

    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { likeCount: true },
    });

    return NextResponse.json({
      data: { like, likeCount: post?.likeCount || 0 },
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

    const existingLike = await prisma.like.findUnique({
      where: {
        userId_postId: {
          userId: user.id,
          postId: postId,
        },
      },
    });

    if (!existingLike) {
      return NextResponse.json({ error: "Not liked yet" }, { status: 404 });
    }

    const targetPost = await prisma.post.findUnique({
      where: { id: postId },
      select: { authorId: true },
    });

    await prisma.$transaction([
      prisma.like.delete({
        where: {
          userId_postId: {
            userId: user.id,
            postId: postId,
          },
        },
      }),
      prisma.post.update({
        where: { id: postId },
        data: { likeCount: { decrement: 1 } },
      }),
    ]);
    await Promise.all([
      invalidateUserHomeFeed(user.id),
      invalidateUserHomeFeed(targetPost?.authorId ?? null),
    ]);
    await logUserAction({
      userId: user.id,
      actionType: UserActionType.POST_UNLIKE,
      targetPostId: postId,
      targetAuthorId: targetPost?.authorId ?? null,
    });
    await recordUserOspEvent(user.id, {
      eventType: OspEventType.POST_UNLIKED,
      objectType: OBJECT_TYPES.POST,
      objectId: postId,
    });

    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { likeCount: true },
    });

    return NextResponse.json({
      data: { likeCount: post?.likeCount || 0 },
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

    if (!postId) {
      return NextResponse.json({ error: "Post ID required" }, { status: 400 });
    }

    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { likeCount: true },
    });

    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    let isLiked = false;
    if (user) {
      const like = await prisma.like.findUnique({
        where: {
          userId_postId: {
            userId: user.id,
            postId: postId,
          },
        },
      });
      isLiked = !!like;
    }

    return NextResponse.json({
      data: {
        likeCount: post.likeCount,
        isLiked,
      },
      success: true,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
