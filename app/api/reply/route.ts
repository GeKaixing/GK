import { prisma } from "@/lib/prisma";
import { UserActionType, OspEventType } from "@/generated/prisma/enums";
import { logUserAction } from "@/lib/feed/actions";
import { invalidateUserHomeFeed } from "@/lib/feed/service";
import { OBJECT_TYPES, DEFAULT_CUSTOMS_PIPELINES, recordUserOspEvent, runCustoms } from "@/lib/osp";
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { extractYouTubeEmbedUrl } from "@/utils/function/extractYouTubeEmbedUrl";

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}


// ---------------- POST 创建回复 ----------------
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
      post_id,
      reply_id,
      videoUrl: inputVideoUrl,
      audioUrl: inputAudioUrl,
    } = await request.json() as {
      content: string;
      post_id: string;
      reply_id?: string | null;
      videoUrl?: string | null;
      audioUrl?: string | null;
    };
    const videoUrl = inputVideoUrl ?? extractYouTubeEmbedUrl(content);
    const audioUrl = inputAudioUrl ?? null;

    // rootId 规则：
    // - 回复主帖：rootId = post_id, parentId = post_id
    // - 回复某条回复：rootId = 该回复的 rootId, parentId = reply_id
    let parentId: string;
    let rootId: string;

    if (reply_id) {
      const parent = await prisma.post.findUnique({
        where: { id: reply_id },
        select: { rootId: true },
      });
      if (!parent) {
        return NextResponse.json({ error: "Parent reply not found" }, { status: 404 });
      }
      parentId = reply_id;
      rootId = parent.rootId!;
    } else {
      parentId = post_id;
      rootId = post_id;
    }

    // OSP RFC-010 Customs admission (RFC-005 Object: Comment). v1 admits everything.
    const customs = await runCustoms(
      { actorId: user.id, objectType: "comment", content },
      DEFAULT_CUSTOMS_PIPELINES
    );
    if (customs.decision === "DENY" || customs.decision === "QUARANTINE") {
      return NextResponse.json(
        { error: customs.reason ?? "Content not admitted by customs" },
        { status: 403 }
      );
    }

    const reply = await prisma.post.create({
      data: {
        content,
        videoUrl,
        audioUrl,
        authorId: user.id,
        parentId,
        rootId,
      },
      include: {
        author: true,
      },
    });

    // ✅ replyCount +1
    await prisma.post.update({
      where: { id: parentId },
      data: { replyCount: { increment: 1 } },
    });
    const parentPost = await prisma.post.findUnique({
      where: { id: parentId },
      select: { authorId: true },
    });
    await Promise.all([
      invalidateUserHomeFeed(user.id),
      invalidateUserHomeFeed(parentPost?.authorId ?? null),
    ]);
    await logUserAction({
      userId: user.id,
      actionType: UserActionType.REPLY_CREATE,
      targetPostId: post_id ?? parentId,
      targetAuthorId: parentPost?.authorId ?? null,
      metadata: JSON.stringify({ kind: "reply_create", source: "reply_box" }),
    });
    await recordUserOspEvent(user.id, {
      eventType: OspEventType.REPLY_CREATED,
      objectType: OBJECT_TYPES.COMMENT,
      objectId: reply.id,
      payload: { parentId, rootId },
    });

    return NextResponse.json({ data: reply, success: true });
  } catch (error: unknown) {
    return NextResponse.json({ error: toErrorMessage(error) }, { status: 500 });
  }
}


// ---------------- DELETE 删除回复 ----------------
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

    const reply = await prisma.post.findUnique({
      where: { id },
      select: { parentId: true, authorId: true },
    });

    if (!reply) {
      return NextResponse.json({ error: "Reply not found" }, { status: 404 });
    }

    if (reply.authorId !== user.id) {
      return NextResponse.json({ error: "Forbidden: You can only delete your own replies" }, { status: 403 });
    }

    await prisma.post.delete({ where: { id } });

    // ✅ replyCount -1
    if (reply.parentId) {
      await prisma.post.update({
        where: { id: reply.parentId },
        data: { replyCount: { decrement: 1 } },
      });
    }
    const parentPost = reply.parentId
      ? await prisma.post.findUnique({
          where: { id: reply.parentId },
          select: { authorId: true },
        })
      : null;
    await Promise.all([
      invalidateUserHomeFeed(user.id),
      invalidateUserHomeFeed(parentPost?.authorId ?? null),
    ]);
    await recordUserOspEvent(user.id, {
      eventType: OspEventType.POST_DELETED,
      objectType: OBJECT_TYPES.COMMENT,
      objectId: id,
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json({ error: toErrorMessage(error) }, { status: 500 });
  }
}


// ---------------- GET 查询回复 ----------------
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const type = searchParams.get("type");

    if (id && type === "post_id") {
      // ✅ 查询某个主帖下的一级回复（parentId = post_id）
      const replies = await prisma.post.findMany({
        where: {
          parentId: id,
        },
        orderBy: {
          createdAt: "asc",
        },
        include: {
          author: true,
        },
      });

      return NextResponse.json({ data: replies, success: true });
    }

    if (id && type === "reply_id") {
      // ✅ 查询某条回复下的子回复
      const replies = await prisma.post.findMany({
        where: {
          parentId: id,
        },
        orderBy: {
          createdAt: "asc",
        },
        include: {
          author: true,
        },
      });

      return NextResponse.json({ data: replies, success: true });
    }

    if (id && type === "id") {
      const reply = await prisma.post.findUnique({
        where: { id },
        include: {
          author: true,
        },
      });

      return NextResponse.json({ data: reply, success: true });
    }

    if (id && type === "user_id") {
      const replies = await prisma.post.findMany({
        where: {
          authorId: id,
        },
        orderBy: {
          createdAt: "desc",
        },
        include: {
          author: true,
        },
      });

      return NextResponse.json({ data: replies, success: true });
    }

    // 默认：返回所有回复（一般调试用）
    const replies = await prisma.post.findMany({
      where: {
        parentId: { not: null },
      },
      orderBy: {
        createdAt: "desc",
      },
      include: {
        author: true,
      },
    });

    return NextResponse.json({ data: replies, success: true });
  } catch (error: unknown) {
    return NextResponse.json({ error: toErrorMessage(error) }, { status: 500 });
  }
}
