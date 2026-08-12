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

    const { postId } = await request.json();

    if (!postId) {
      return NextResponse.json({ error: "Post ID required" }, { status: 400 });
    }

    const targetPost = await prisma.post.findUnique({
      where: { id: postId },
      select: { authorId: true },
    });

    if (!targetPost) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const post = await prisma.post.update({
      where: { id: postId },
      data: { shareCount: { increment: 1 } },
    });

    if (user) {
      await prisma.share.upsert({
        where: {
          userId_postId: {
            userId: user.id,
            postId: postId,
          },
        },
        update: {},
        create: {
          userId: user.id,
          postId: postId,
        },
      });
    }

    await Promise.all([
      invalidateUserHomeFeed(user?.id ?? null),
      invalidateUserHomeFeed(targetPost.authorId),
    ]);
    if (user) {
      await logUserAction({
        userId: user.id,
        actionType: UserActionType.POST_SHARE,
        targetPostId: postId,
        targetAuthorId: targetPost.authorId,
      });
      await recordUserOspEvent(user.id, {
        eventType: OspEventType.POST_SHARED,
        objectType: OBJECT_TYPES.POST,
        objectId: postId,
      });
    }

    return NextResponse.json({
      data: { shareCount: post.shareCount },
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
    const { searchParams } = new URL(request.url);
    const postId = searchParams.get("postId");

    if (!postId) {
      return NextResponse.json({ error: "Post ID required" }, { status: 400 });
    }

    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { shareCount: true },
    });

    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    return NextResponse.json({
      data: { shareCount: post.shareCount },
      success: true,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
