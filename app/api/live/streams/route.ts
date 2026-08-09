import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

const VALID_STATUSES = ["LIVE", "SCHEDULED", "ENDED"] as const;
type LiveStatus = (typeof VALID_STATUSES)[number];

function isLiveStatus(value: string | null): value is LiveStatus {
  return value !== null && (VALID_STATUSES as readonly string[]).includes(value);
}

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

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const statusParam = searchParams.get("status");

    const where = isLiveStatus(statusParam) ? { status: statusParam } : {};

    const streams = await prisma.liveStream.findMany({
      where,
      orderBy: { startedAt: "desc" },
      take: 100,
      include: { author: AUTHOR_SELECT },
    });

    return NextResponse.json({
      data: streams.map(serializeStream),
      success: true,
    });
  } catch (error) {
    console.error("GET /api/live/streams failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
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

    const body = (await request.json()) as {
      title?: string;
      description?: string;
      category?: string;
      streamUrl?: string;
      thumbnailUrl?: string;
      scheduledAt?: string | null;
    };

    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) {
      return NextResponse.json(
        { error: "Title is required" },
        { status: 400 }
      );
    }

    // 计划开播：填入 scheduledAt 则为 SCHEDULED，否则立即开播
    const scheduledDate = body.scheduledAt
      ? new Date(body.scheduledAt)
      : null;
    const isScheduled =
      scheduledDate !== null && !Number.isNaN(scheduledDate.getTime());

    const stream = await prisma.liveStream.create({
      data: {
        authorId: user.id,
        title,
        description: body.description?.trim() || null,
        category: body.category?.trim() || null,
        streamUrl: body.streamUrl?.trim() || null,
        thumbnailUrl: body.thumbnailUrl?.trim() || null,
        status: isScheduled ? "SCHEDULED" : "LIVE",
        startedAt: isScheduled ? scheduledDate! : new Date(),
        scheduledAt: isScheduled ? scheduledDate : null,
      },
      include: { author: AUTHOR_SELECT },
    });

    return NextResponse.json(
      { data: serializeStream(stream), success: true },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/live/streams failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
