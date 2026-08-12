import { prisma } from "@/lib/prisma";
import { UserActionType, UserRole, OspEventType } from "@/generated/prisma/enums";
import { logUserAction } from "@/lib/feed/actions";
import { invalidateAuthorAudienceFeed, invalidateUserHomeFeed } from "@/lib/feed/service";
import { OBJECT_TYPES, DEFAULT_CUSTOMS_PIPELINES, enqueueFederationDelivery, recordUserOspEvent, runCustoms } from "@/lib/osp";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { extractYouTubeEmbedUrl } from "@/utils/function/extractYouTubeEmbedUrl";
import { createClient } from "@/utils/supabase/server";

function transformPost(post: any) {
  return {
    id: post.id,
    user_id: post.authorId,
    user_name: post.author?.name || "",
    user_email: post.author?.email || "",
    user_avatar: post.author?.avatar || "",
    user_userid: post.author?.userid || "",
    content: post.content,
    videoUrl: post.videoUrl ?? null,
    audioUrl: post.audioUrl ?? null,
    like: post.likeCount || 0,
    star: 0,
    reply_count: post.replyCount || post._count?.replies || 0,
    share: post.shareCount || 0,
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const type = searchParams.get("type");

  try {
    if (id && type === "user_id") {
      const posts = await prisma.post.findMany({
        where: {
          authorId: id,
          parentId: null,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 50,
        include: {
          author: true,
          _count: {
            select: { likes: true, bookmarks: true, shares: true, replies: true },
          },
        },
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
        like: post._count?.likes || 0,
        star: post._count?.bookmarks || 0,
        reply_count: post._count?.replies || 0,
        share: post._count?.shares || 0,
      }));
      return NextResponse.json({ data: transformedPosts, success: true });
    }

    if (id) {
      const post = await prisma.post.findUnique({
        where: { id },
        include: {
          author: true,
          _count: {
            select: { likes: true, bookmarks: true, shares: true, replies: true },
          },
          replies: {
            orderBy: { createdAt: "asc" },
            include: { 
              author: true,
              _count: {
                select: { likes: true, bookmarks: true, shares: true, replies: true },
              },
            },
          },
        },
      });

      if (!post) {
        return NextResponse.json({ error: "Post not found" }, { status: 404 });
      }

      return NextResponse.json({
        data: {
          id: post.id,
          user_id: post.authorId,
          user_name: post.author?.name || "",
          user_email: post.author?.email || "",
          user_avatar: post.author?.avatar || "",
          user_userid: post.author?.userid || "",
          content: post.content,
          videoUrl: post.videoUrl ?? null,
          audioUrl: post.audioUrl ?? null,
          like: post._count?.likes || 0,
          star: post._count?.bookmarks || 0,
          reply_count: post._count?.replies || 0,
          share: post._count?.shares || 0,
          replies: post.replies?.map((reply: any) => ({
            id: reply.id,
            user_id: reply.authorId,
            user_name: reply.author?.name || "",
            user_email: reply.author?.email || "",
            user_avatar: reply.author?.avatar || "",
            user_userid: reply.author?.userid || "",
            content: reply.content,
            videoUrl: reply.videoUrl ?? null,
            audioUrl: reply.audioUrl ?? null,
            like: reply._count?.likes || 0,
            star: reply._count?.bookmarks || 0,
            reply_count: reply._count?.replies || 0,
            share: reply._count?.shares || 0,
          })),
        },
        success: true,
      });
    }

    const posts = await prisma.post.findMany({
      where: {
        parentId: null,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 50,
      include: {
        author: true,
        _count: {
          select: { likes: true, bookmarks: true, shares: true, replies: true },
        },
      },
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
      like: post._count?.likes || 0,
      star: post._count?.bookmarks || 0,
      reply_count: post._count?.replies || 0,
      share: post._count?.shares || 0,
    }));
    return NextResponse.json({ data: transformedPosts, success: true });
  } catch (error: any) {
    console.log(error)
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const {
      content,
      parentId,
      rootId,
      videoUrl: inputVideoUrl,
      audioUrl: inputAudioUrl,
    } = await request.json() as {
      content: string;
      parentId?: string | null;
      rootId?: string | null;
      videoUrl?: string | null;
      audioUrl?: string | null;
    };
    const containsEmbeddedYouTube = typeof content === "string" && content.includes("data-youtube-embed");
    const videoUrl = containsEmbeddedYouTube ? null : inputVideoUrl ?? extractYouTubeEmbedUrl(content);
    const audioUrl = inputAudioUrl ?? null;

    // OSP RFC-010 Customs: run the object through the Country's admission
    // pipeline before it enters the repository. v1 registers only the
    // pass-through `allowingCustoms` pipeline, so this never denies — it lands
    // the admission contract for real moderation policies later.
    const customs = await runCustoms(
      { actorId: user.id, objectType: "post", content },
      DEFAULT_CUSTOMS_PIPELINES
    );
    if (customs.decision === "DENY" || customs.decision === "QUARANTINE") {
      return NextResponse.json(
        { error: customs.reason ?? "Content not admitted by customs" },
        { status: 403 }
      );
    }

    const post = await prisma.post.create({
      data: {
        content,
        videoUrl,
        audioUrl,
        authorId: user.id,
        parentId: parentId ?? null,
        rootId: rootId ?? null,
      },
      include: {
        author: true,
      },
    });

    revalidatePath("/gekaixing");
    if (!parentId) {
      await invalidateAuthorAudienceFeed(user.id);
      await logUserAction({
        userId: user.id,
        actionType: UserActionType.POST_CREATE,
        targetPostId: post.id,
        targetAuthorId: user.id,
      });
      await recordUserOspEvent(user.id, {
        eventType: OspEventType.POST_CREATED,
        objectType: OBJECT_TYPES.POST,
        objectId: post.id,
      }).then(async (ospEvent) => {
        // OSP RFC-009: broadcast the signed content event to recognized peers.
        await enqueueFederationDelivery(ospEvent, {
          content: post.content,
          authorName: post.author?.name ?? null,
          authorHandle: post.author?.userid ?? null,
          authorAvatar: post.author?.avatar ?? null,
          parentId: null,
        });
      });
    } else {
      await invalidateUserHomeFeed(user.id);
      await logUserAction({
        userId: user.id,
        actionType: UserActionType.REPLY_CREATE,
        targetPostId: post.id,
        targetAuthorId: user.id,
      });
      await recordUserOspEvent(user.id, {
        eventType: OspEventType.REPLY_CREATED,
        objectType: OBJECT_TYPES.COMMENT,
        objectId: post.id,
        payload: { parentId: parentId ?? null, rootId: rootId ?? null },
      }).then(async (ospEvent) => {
        await enqueueFederationDelivery(ospEvent, {
          content: post.content,
          authorName: post.author?.name ?? null,
          authorHandle: post.author?.userid ?? null,
          authorAvatar: post.author?.avatar ?? null,
          parentId: parentId ?? null,
        });
      });
    }

    return NextResponse.json({ data: [transformPost(post)], success: true });
  } catch (error: any) {
    console.error("POST /api/post failed:", error);
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

    const { id } = await request.json();

    const existing = await prisma.post.findUnique({
      where: { id },
      select: { id: true, authorId: true, parentId: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    // Ownership check (previously MISSING — anyone could delete any post by id).
    const profile = await prisma.user.findUnique({
      where: { id: user.id },
      select: { role: true },
    });
    const isOwner = existing.authorId === user.id;
    const isAdmin = profile?.role === UserRole.ADMIN;
    if (!isOwner && !isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const deleted = await prisma.post.delete({
      where: { id },
    });

    revalidatePath("/gekaixing");
    await invalidateUserHomeFeed(deleted.authorId);

    await recordUserOspEvent(existing.authorId, {
      eventType: OspEventType.POST_DELETED,
      objectType: existing.parentId ? OBJECT_TYPES.COMMENT : OBJECT_TYPES.POST,
      objectId: id,
      payload: { deletedBy: user.id },
    });

    return NextResponse.json({ data: deleted, success: true });
  } catch (error: any) {
    console.error("DELETE /api/post failed:", error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
