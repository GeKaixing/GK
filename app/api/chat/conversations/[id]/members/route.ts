import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/utils/supabase/server";

// 群成员列表
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
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

    const conversation = await prisma.conversation.findUnique({
      where: { id },
      select: { isGroup: true },
    });
    if (!conversation) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }
    if (!conversation.isGroup) {
      return NextResponse.json(
        { error: "Not a group conversation" },
        { status: 400 }
      );
    }

    const participants = await prisma.conversationParticipant.findMany({
      where: { conversationId: id },
      include: {
        user: {
          select: { id: true, name: true, avatar: true, userid: true },
        },
      },
      orderBy: [{ role: "desc" }, { joinedAt: "asc" }],
    });

    const caller = participants.find((p) => p.userId === user.id);

    return NextResponse.json({
      data: {
        callerRole: caller?.role ?? "member",
        members: participants.map((p) => ({
          id: p.userId,
          name: p.user.name || p.user.userid || "未知用户",
          avatar: p.user.avatar,
          userid: p.user.userid,
          role: p.role,
          mutedAt: p.mutedAt?.toISOString() ?? null,
          joinedAt: p.joinedAt.toISOString(),
        })),
      },
      success: true,
    });
  } catch (error) {
    console.error("Failed to fetch members:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// 向群聊添加成员
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
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
    const { memberIds } = await request.json();

    const conversation = await prisma.conversation.findUnique({
      where: { id },
      select: { id: true, isGroup: true, messageCount: true },
    });

    if (!conversation) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }
    if (!conversation.isGroup) {
      return NextResponse.json(
        { error: "Not a group conversation" },
        { status: 400 }
      );
    }

    // 只有群成员才能拉人进群
    const caller = await prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: {
          conversationId: id,
          userId: user.id,
        },
      },
      select: { userId: true },
    });
    if (!caller) {
      return NextResponse.json(
        { error: "Not a participant" },
        { status: 403 }
      );
    }

    const existingMembers = await prisma.conversationParticipant.findMany({
      where: { conversationId: id },
      select: { userId: true },
    });
    const existingIds = new Set(existingMembers.map((m) => m.userId));

    const members = Array.isArray(memberIds)
      ? [
          ...new Set(
            memberIds.filter(
              (m): m is string =>
                typeof m === "string" && m !== user.id && !existingIds.has(m)
            )
          ),
        ]
      : [];

    if (members.length === 0) {
      return NextResponse.json(
        { error: "All selected users are already members" },
        { status: 400 }
      );
    }

    await prisma.$transaction([
      prisma.conversationParticipant.createMany({
        data: members.map((userId) => ({ conversationId: id, userId })),
        skipDuplicates: true,
      }),
      prisma.conversationRead.createMany({
        data: members.map((userId) => ({
          conversationId: id,
          userId,
          lastReadMessageCount: conversation.messageCount,
        })),
        skipDuplicates: true,
      }),
    ]);

    return NextResponse.json({
      data: { addedCount: members.length },
      success: true,
    });
  } catch (error) {
    console.error("Failed to add members:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
