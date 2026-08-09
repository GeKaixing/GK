import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/utils/supabase/server";

// 群信息 / 改名 / 改头像 / 解散群
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
      select: {
        id: true,
        name: true,
        avatar: true,
        isGroup: true,
        createdAt: true,
        participants: {
          select: { userId: true, role: true },
        },
      },
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

    const caller = conversation.participants.find((p) => p.userId === user.id);
    if (!caller) {
      return NextResponse.json(
        { error: "Not a participant" },
        { status: 403 }
      );
    }

    return NextResponse.json({
      data: {
        id: conversation.id,
        name: conversation.name,
        avatar: conversation.avatar,
        isGroup: true,
        participantCount: conversation.participants.length,
        createdAt: conversation.createdAt.toISOString(),
        callerRole: caller.role,
      },
      success: true,
    });
  } catch (error) {
    console.error("Failed to fetch group info:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function PATCH(
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
    const { name, avatar } = await request.json();

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

    const caller = await prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: {
          conversationId: id,
          userId: user.id,
        },
      },
      select: { role: true },
    });
    if (caller?.role !== "admin") {
      return NextResponse.json(
        { error: "Only admins can edit the group" },
        { status: 403 }
      );
    }

    if (name !== undefined && typeof name === "string") {
      const trimmed = name.trim();
      if (!trimmed) {
        return NextResponse.json(
          { error: "Group name cannot be empty" },
          { status: 400 }
        );
      }
      await prisma.conversation.update({
        where: { id },
        data: { name: trimmed },
      });
    }

    if (avatar !== undefined && typeof avatar === "string") {
      await prisma.conversation.update({
        where: { id },
        data: { avatar },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to update group:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

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

    const caller = await prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: {
          conversationId: id,
          userId: user.id,
        },
      },
      select: { role: true },
    });
    if (caller?.role !== "admin") {
      return NextResponse.json(
        { error: "Only admins can disband the group" },
        { status: 403 }
      );
    }

    // 级联删除 participants / readStates / messages / workTasks
    await prisma.conversation.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to disband group:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
