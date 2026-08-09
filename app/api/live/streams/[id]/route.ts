import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

const AUTHOR_SELECT = {
  select: {
    id: true,
    name: true,
    avatar: true,
    userid: true,
  },
};

function serializeStream(stream: any) {
  return {
    id: stream.id,
    authorId: stream.authorId,
    author: stream.author
      ? {
          id: stream.author.id,
          name: stream.author.name,
          avatar: stream.author.avatar,
          userid: stream.author.userid,
        }
      : null,
    title: stream.title,
    description: stream.description,
    category: stream.category,
    status: stream.status,
    streamUrl: stream.streamUrl,
    thumbnailUrl: stream.thumbnailUrl,
    viewerCount: stream.viewerCount,
    startedAt: stream.startedAt?.toISOString() ?? null,
    scheduledAt: stream.scheduledAt?.toISOString() ?? null,
    endedAt: stream.endedAt?.toISOString() ?? null,
    createdAt: stream.createdAt.toISOString(),
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const stream = await prisma.liveStream.findUnique({
      where: { id },
      include: { author: AUTHOR_SELECT },
    });

    if (!stream) {
      return NextResponse.json({ error: "Stream not found" }, { status: 404 });
    }

    // best-effort 观众计数：每次进入观看页 +1（忽略失败）
    try {
      await prisma.liveStream.update({
        where: { id },
        data: { viewerCount: { increment: 1 } },
      });
    } catch {
      // 忽略计数失败，不影响观看
    }

    return NextResponse.json({
      data: serializeStream(stream),
      success: true,
    });
  } catch (error) {
    console.error("GET /api/live/streams/[id] failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const existing = await prisma.liveStream.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Stream not found" }, { status: 404 });
    }

    if (existing.authorId !== user.id) {
      return NextResponse.json(
        { error: "Only the stream owner can modify this stream" },
        { status: 403 }
      );
    }

    const body = (await request.json()) as {
      status?: string;
      title?: string;
      description?: string;
      category?: string;
      streamUrl?: string;
      thumbnailUrl?: string;
    };

    const data: Record<string, unknown> = {};

    if (body.status === "ENDED") {
      data.status = "ENDED";
      data.endedAt = new Date();
    }

    if (typeof body.title === "string") {
      const title = body.title.trim();
      if (!title) {
        return NextResponse.json(
          { error: "Title is required" },
          { status: 400 }
        );
      }
      data.title = title;
    }

    if (typeof body.description === "string") {
      data.description = body.description.trim() || null;
    }

    if (typeof body.category === "string") {
      data.category = body.category.trim() || null;
    }

    if (typeof body.streamUrl === "string") {
      data.streamUrl = body.streamUrl.trim() || null;
    }

    if (typeof body.thumbnailUrl === "string") {
      data.thumbnailUrl = body.thumbnailUrl.trim() || null;
    }

    const stream = await prisma.liveStream.update({
      where: { id },
      data,
      include: { author: AUTHOR_SELECT },
    });

    return NextResponse.json({
      data: serializeStream(stream),
      success: true,
    });
  } catch (error) {
    console.error("PATCH /api/live/streams/[id] failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const existing = await prisma.liveStream.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Stream not found" }, { status: 404 });
    }

    if (existing.authorId !== user.id) {
      return NextResponse.json(
        { error: "Only the stream owner can delete this stream" },
        { status: 403 }
      );
    }

    await prisma.liveStream.delete({ where: { id } });

    return NextResponse.json({ data: { id }, success: true });
  } catch (error) {
    console.error("DELETE /api/live/streams/[id] failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
