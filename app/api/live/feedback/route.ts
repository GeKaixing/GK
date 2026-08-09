import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

/**
 * 直播问题反馈。允许登录用户提交对某场直播的反馈（播放/画质/音频/连接等）。
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { streamId, issueType, message } = (await request.json()) as {
      streamId?: string;
      issueType?: string;
      message?: string;
    };

    if (typeof streamId !== "string" || !streamId) {
      return NextResponse.json(
        { error: "Stream ID is required" },
        { status: 400 }
      );
    }

    const stream = await prisma.liveStream.findUnique({
      where: { id: streamId },
      select: { id: true },
    });

    if (!stream) {
      return NextResponse.json({ error: "Stream not found" }, { status: 404 });
    }

    const trimmedType = typeof issueType === "string" ? issueType.trim().slice(0, 50) : "";
    const trimmedMessage = typeof message === "string" ? message.trim() : "";

    if (!trimmedMessage) {
      return NextResponse.json(
        { error: "Feedback message is required" },
        { status: 400 }
      );
    }

    if (trimmedMessage.length > 1000) {
      return NextResponse.json(
        { error: "Feedback is too long (max 1000 chars)" },
        { status: 400 }
      );
    }

    await prisma.liveFeedback.create({
      data: {
        userId: user.id,
        streamId,
        issueType: trimmedType || "other",
        message: trimmedMessage,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("POST /api/live/feedback failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
