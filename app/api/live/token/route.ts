import { AccessToken } from "livekit-server-sdk";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/utils/supabase/server";

const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;

function roomNameFromStream(streamId: string): string {
  return `live-${streamId}`;
}

/**
 * 生成 LiveKit 访问令牌。
 * - 主播（stream.authorId === 当前用户）可推流（roomPublish）
 * - 观众只能订阅（roomSubscribe）
 */
export async function POST(request: Request) {
  try {
    if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
      return NextResponse.json(
        { error: "LiveKit is not configured" },
        { status: 503 }
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { roomName, canPublish } = (await request.json()) as {
      roomName?: string;
      canPublish?: boolean;
    };

    if (typeof roomName !== "string" || !roomName.startsWith("live-")) {
      return NextResponse.json(
        { error: "Invalid room name" },
        { status: 400 }
      );
    }

    const streamId = roomName.slice("live-".length);
    const stream = await prisma.liveStream.findUnique({
      where: { id: streamId },
      select: { id: true, authorId: true },
    });

    if (!stream) {
      return NextResponse.json({ error: "Stream not found" }, { status: 404 });
    }

    const isHost = stream.authorId === user.id;

    // 只有主播可以推流；观众请求推流权限直接拒绝
    if (canPublish && !isHost) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity: user.id,
      name: user.user_metadata?.full_name || user.email || "user",
      ttl: "6h",
    });

    at.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: isHost && canPublish,
      canSubscribe: true,
    });

    const token = await at.toJwt();

    return NextResponse.json({
      data: {
        token,
        roomName,
        serverUrl: process.env.NEXT_PUBLIC_LIVEKIT_URL,
        isHost,
      },
      success: true,
    });
  } catch (error) {
    console.error("POST /api/live/token failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
