import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/utils/supabase/server";

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
