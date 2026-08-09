import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

function serializeMessage(message: any) {
  return {
    id: message.id,
    streamId: message.streamId,
    authorId: message.authorId,
    authorName: message.author?.name ?? null,
    authorAvatar: message.author?.avatar ?? null,
    authorUserid: message.author?.userid ?? null,
    content: message.content,
    createdAt: message.createdAt.toISOString(),
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
      select: { id: true },
    });

    if (!stream) {
      return NextResponse.json({ error: "Stream not found" }, { status: 404 });
    }

    const messages = await prisma.liveChatMessage.findMany({
      where: { streamId: id },
      orderBy: { createdAt: "asc" },
      take: 100,
      include: {
        author: {
          select: {
            id: true,
            name: true,
            avatar: true,
            userid: true,
          },
        },
      },
    });

    return NextResponse.json({
      data: messages.map(serializeMessage),
      success: true,
    });
  } catch (error) {
    console.error("GET /api/live/streams/[id]/messages failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function POST(
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

    const stream = await prisma.liveStream.findUnique({
      where: { id },
      select: { id: true, status: true },
    });

    if (!stream) {
      return NextResponse.json({ error: "Stream not found" }, { status: 404 });
    }

    if (stream.status !== "LIVE") {
      return NextResponse.json(
        { error: "This stream is not live" },
        { status: 400 }
      );
    }

    const { content } = (await request.json()) as { content?: string };
    const trimmed = typeof content === "string" ? content.trim() : "";

    if (!trimmed) {
      return NextResponse.json(
        { error: "Message content is required" },
        { status: 400 }
      );
    }

    if (trimmed.length > 500) {
      return NextResponse.json(
        { error: "Message is too long (max 500 chars)" },
        { status: 400 }
      );
    }

    const message = await prisma.liveChatMessage.create({
      data: {
        streamId: id,
        authorId: user.id,
        content: trimmed,
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            avatar: true,
            userid: true,
          },
        },
      },
    });

    return NextResponse.json(
      { data: serializeMessage(message), success: true },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/live/streams/[id]/messages failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
