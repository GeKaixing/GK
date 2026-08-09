import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/utils/supabase/server";

// 删除自己的会话参与（1:1 会话 → 从我的列表移除；群聊 → 退出群）
export async function DELETE(
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

    const participant = await prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: {
          conversationId: id,
          userId: user.id,
        },
      },
      select: { id: true },
    });
    if (!participant) {
      return NextResponse.json(
        { error: "Not a participant" },
        { status: 404 }
      );
    }

    await prisma.$transaction([
      prisma.conversationParticipant.delete({
        where: { id: participant.id },
      }),
      prisma.conversationRead.deleteMany({
        where: { conversationId: id, userId: user.id },
      }),
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete conversation:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
